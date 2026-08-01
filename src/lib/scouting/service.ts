import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PlayerNotFoundError } from "@/lib/chess/http";
import { canonicalHandle } from "@/lib/chess/handles";
import { adapterFor } from "@/lib/chess/platforms";
import { buildReport, REPORT_VERSION } from "@/lib/chess/report";
import type {
  NormalizedGame,
  Platform,
  PlayerIdentity,
  ScoutingReport,
} from "@/lib/chess/types";
import { cacheTtlHours, maxGamesPerSync } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import type { Database, GameRow, OpponentRow } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/** A sync that started longer ago than this is assumed dead, not running. */
const SYNC_LOCK_TIMEOUT_MS = 3 * 60_000;

/** Supabase rejects very large single inserts; games go up in chunks. */
const INSERT_CHUNK = 400;

export class ScoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScoutError";
  }
}

// ---------------------------------------------------------------------------
// Row <-> domain mapping
// ---------------------------------------------------------------------------

function rowToGame(row: GameRow): NormalizedGame {
  return {
    platform: row.platform,
    gameId: row.game_id,
    playedAt: row.played_at,
    color: row.color,
    result: row.result,
    playerRating: row.player_rating,
    rivalRating: row.rival_rating,
    rivalHandle: row.rival_handle,
    timeClass: (row.time_class ?? "unknown") as NormalizedGame["timeClass"],
    timeControl: row.time_control,
    rated: row.rated,
    eco: row.eco,
    openingName: row.opening_name,
    openingSlug: row.opening_slug,
    moveCount: row.move_count,
    termination: row.termination,
    url: row.url,
    movesSan: row.moves_san,
  };
}

function gameToRow(opponentId: string, game: NormalizedGame) {
  return {
    opponent_id: opponentId,
    platform: game.platform,
    game_id: game.gameId,
    played_at: game.playedAt,
    color: game.color,
    result: game.result,
    player_rating: game.playerRating,
    rival_rating: game.rivalRating,
    rival_handle: game.rivalHandle,
    time_class: game.timeClass,
    time_control: game.timeControl,
    rated: game.rated,
    eco: game.eco,
    opening_name: game.openingName,
    opening_slug: game.openingSlug,
    move_count: game.moveCount,
    termination: game.termination,
    url: game.url,
    moves_san: game.movesSan,
  };
}

function rowToIdentity(row: OpponentRow): PlayerIdentity {
  return {
    platform: row.platform,
    handle: row.handle,
    displayHandle: row.display_handle,
    title: row.title,
    country: row.country,
    avatarUrl: row.avatar_url,
    ratings: row.ratings ?? {},
  };
}

// ---------------------------------------------------------------------------
// Opponent registry
// ---------------------------------------------------------------------------

/**
 * Finds the opponent row for a handle, creating it (and fetching the upstream
 * profile) the first time anyone scouts that player.
 */
export async function resolveOpponent(
  platform: Platform,
  rawHandle: string,
  options: { createIfMissing?: boolean } = {},
): Promise<OpponentRow> {
  const { createIfMissing = true } = options;
  const handle = canonicalHandle(rawHandle);
  const admin = createAdminClient();

  const existing = await admin
    .from("opponents")
    .select("*")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();

  if (existing.error) throw new ScoutError(existing.error.message, 500);
  if (existing.data) return existing.data;
  if (!createIfMissing) throw new ScoutError(`Unknown opponent ${handle}`, 404);

  let identity: PlayerIdentity;
  try {
    identity = await adapterFor(platform).fetchIdentity(handle);
  } catch (error) {
    if (error instanceof PlayerNotFoundError) throw new ScoutError(error.message, 404);
    throw new ScoutError(
      error instanceof Error ? error.message : "Could not reach the chess platform.",
      502,
    );
  }

  const inserted = await admin
    .from("opponents")
    .upsert(
      {
        platform,
        handle: identity.handle,
        display_handle: identity.displayHandle,
        title: identity.title,
        country: identity.country,
        avatar_url: identity.avatarUrl,
        ratings: identity.ratings,
      },
      { onConflict: "platform,handle" },
    )
    .select("*")
    .single();

  if (inserted.error) throw new ScoutError(inserted.error.message, 500);
  return inserted.data;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncOutcome {
  opponent: OpponentRow;
  report: ScoutingReport;
  fetched: number;
  inserted: number;
  skipped: "fresh" | "locked" | null;
}

function isFresh(opponent: OpponentRow, ttlHours: number): boolean {
  if (!opponent.last_synced_at) return false;
  const age = Date.now() - new Date(opponent.last_synced_at).getTime();
  return age < ttlHours * 3_600_000;
}

function isLocked(opponent: OpponentRow): boolean {
  if (opponent.sync_status !== "syncing") return false;
  if (!opponent.sync_started_at) return false;
  return Date.now() - new Date(opponent.sync_started_at).getTime() < SYNC_LOCK_TIMEOUT_MS;
}

async function loadCachedGames(admin: Admin, opponentId: string): Promise<NormalizedGame[]> {
  const { data, error } = await admin
    .from("games")
    .select("*")
    .eq("opponent_id", opponentId)
    .order("played_at", { ascending: false })
    .limit(maxGamesPerSync() * 2);

  if (error) throw new ScoutError(error.message, 500);
  return (data ?? []).map(rowToGame);
}

async function storeReport(
  admin: Admin,
  opponent: OpponentRow,
  games: NormalizedGame[],
): Promise<ScoutingReport> {
  const report = buildReport(rowToIdentity(opponent), games);

  const { error } = await admin.from("reports").upsert(
    {
      opponent_id: opponent.id,
      payload: report,
      games_analyzed: games.length,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "opponent_id" },
  );

  if (error) throw new ScoutError(error.message, 500);
  return report;
}

/**
 * Pulls games newer than the cached high-water mark, stores them, and rebuilds
 * the report snapshot.
 *
 * `force: true` still syncs incrementally — it only bypasses the freshness
 * check. `full: true` is the escape hatch that re-walks history from scratch,
 * which is what you want after changing a normalizer.
 */
export async function syncOpponent(
  opponent: OpponentRow,
  options: { force?: boolean; full?: boolean; ttlHours?: number } = {},
): Promise<SyncOutcome> {
  const { force = false, full = false, ttlHours = cacheTtlHours() } = options;
  const admin = createAdminClient();

  if (!force && isFresh(opponent, ttlHours)) {
    return {
      opponent,
      report: await ensureReport(admin, opponent),
      fetched: 0,
      inserted: 0,
      skipped: "fresh",
    };
  }

  if (isLocked(opponent)) {
    // Another request is already doing this work; hand back what we have.
    return {
      opponent,
      report: await ensureReport(admin, opponent),
      fetched: 0,
      inserted: 0,
      skipped: "locked",
    };
  }

  await admin
    .from("opponents")
    .update({ sync_status: "syncing", sync_started_at: new Date().toISOString(), sync_error: null })
    .eq("id", opponent.id);

  try {
    const since = full || !opponent.last_game_at ? null : new Date(opponent.last_game_at);

    const fetched = await adapterFor(opponent.platform).fetchGames(opponent.handle, {
      since,
      limit: maxGamesPerSync(),
    });

    let inserted = 0;
    if (fetched.length) {
      const rows = fetched.map((game) => gameToRow(opponent.id, game));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { error } = await admin
          .from("games")
          .upsert(chunk, {
            onConflict: "opponent_id,platform,game_id",
            ignoreDuplicates: true,
          });
        if (error) throw new ScoutError(error.message, 500);
        inserted += chunk.length;
      }
    }

    const games = await loadCachedGames(admin, opponent.id);
    const report = await storeReport(admin, opponent, games);

    const lastGameAt = games.length ? games[0].playedAt : opponent.last_game_at;
    const { data: updated, error: updateError } = await admin
      .from("opponents")
      .update({
        sync_status: "idle",
        sync_error: null,
        sync_started_at: null,
        last_synced_at: new Date().toISOString(),
        last_game_at: lastGameAt,
        games_count: games.length,
      })
      .eq("id", opponent.id)
      .select("*")
      .single();

    if (updateError) throw new ScoutError(updateError.message, 500);

    return { opponent: updated, report, fetched: fetched.length, inserted, skipped: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await admin
      .from("opponents")
      .update({ sync_status: "error", sync_error: message, sync_started_at: null })
      .eq("id", opponent.id);

    // A failed refresh should not blank out a dossier that already exists.
    const cached = await readReport(admin, opponent.id);
    if (cached) {
      return { opponent, report: cached, fetched: 0, inserted: 0, skipped: null };
    }

    if (error instanceof ScoutError) throw error;
    if (error instanceof PlayerNotFoundError) throw new ScoutError(message, 404);
    throw new ScoutError(message, 502);
  }
}

async function readReport(admin: Admin, opponentId: string): Promise<ScoutingReport | null> {
  const { data, error } = await admin
    .from("reports")
    .select("payload, generated_at")
    .eq("opponent_id", opponentId)
    .maybeSingle();

  if (error) throw new ScoutError(error.message, 500);
  return data?.payload ?? null;
}

/**
 * Returns the stored report, rebuilding it from cached games when it is
 * missing or was produced by an older version of the analysis code. This is
 * what makes a report-logic change cheap: no upstream refetch, just a rebuild.
 */
async function ensureReport(admin: Admin, opponent: OpponentRow): Promise<ScoutingReport> {
  const stored = await readReport(admin, opponent.id);
  if (stored && stored.version === REPORT_VERSION) return stored;

  const games = await loadCachedGames(admin, opponent.id);
  return storeReport(admin, opponent, games);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface ScoutResult {
  opponent: OpponentRow;
  report: ScoutingReport;
  cache: {
    hit: boolean;
    generatedAt: string;
    lastSyncedAt: string | null;
    ttlHours: number;
    stale: boolean;
  };
}

/**
 * The one call the UI needs: resolve the handle, refresh if the cache has
 * aged past the TTL, and hand back a report either way.
 */
export async function scout(
  platform: Platform,
  handle: string,
  options: { force?: boolean; full?: boolean } = {},
): Promise<ScoutResult> {
  const ttlHours = cacheTtlHours();
  const opponent = await resolveOpponent(platform, handle);

  const fresh = isFresh(opponent, ttlHours);
  const needsSync = options.force || options.full || !fresh;

  if (!needsSync) {
    const admin = createAdminClient();
    const report = await ensureReport(admin, opponent);
    return {
      opponent,
      report,
      cache: {
        hit: true,
        generatedAt: report.generatedAt,
        lastSyncedAt: opponent.last_synced_at,
        ttlHours,
        stale: false,
      },
    };
  }

  const outcome = await syncOpponent(opponent, { ...options, force: true, ttlHours });
  return {
    opponent: outcome.opponent,
    report: outcome.report,
    cache: {
      hit: outcome.skipped !== null,
      generatedAt: outcome.report.generatedAt,
      lastSyncedAt: outcome.opponent.last_synced_at,
      ttlHours,
      stale: outcome.skipped === "locked",
    },
  };
}

export { isFresh, rowToIdentity };
