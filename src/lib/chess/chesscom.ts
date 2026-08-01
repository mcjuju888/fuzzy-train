import "server-only";

import { fetchJson, PlayerNotFoundError, UpstreamError } from "@/lib/chess/http";
import { openingFromEcoUrl, parseOpening } from "@/lib/chess/openings";
import { moveCountFromSan, openingPrefix, parsePgn } from "@/lib/chess/pgn";
import type {
  GameColor,
  GameResult,
  NormalizedGame,
  PlayerIdentity,
  TimeClass,
} from "@/lib/chess/types";

const API = "https://api.chess.com/pub";
const HOST = "api.chess.com";

// ---------------------------------------------------------------------------
// Upstream payload shapes (only the fields actually consumed)
// ---------------------------------------------------------------------------

interface ChessComProfile {
  username: string;
  name?: string;
  title?: string;
  country?: string;
  avatar?: string;
}

interface StatBlock {
  last?: { rating?: number; date?: number };
  best?: { rating?: number };
  record?: { win?: number; loss?: number; draw?: number };
}

interface ChessComStats {
  chess_bullet?: StatBlock;
  chess_blitz?: StatBlock;
  chess_rapid?: StatBlock;
  chess_daily?: StatBlock;
}

interface ChessComSide {
  rating?: number;
  result?: string;
  username?: string;
}

interface ChessComGame {
  url?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  rated?: boolean;
  uuid?: string;
  time_class?: string;
  rules?: string;
  white?: ChessComSide;
  black?: ChessComSide;
  eco?: string;
}

// ---------------------------------------------------------------------------
// Result-code mapping
// ---------------------------------------------------------------------------

/**
 * Chess.com reports an outcome per side. "win" is the only winning code; every
 * other code says *how* that side failed to win, which is exactly the
 * termination detail the report wants.
 */
const DRAW_CODES = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

const TERMINATION_LABELS: Record<string, string> = {
  checkmated: "checkmate",
  resigned: "resignation",
  timeout: "timeout",
  abandoned: "abandonment",
  lose: "loss",
  agreed: "agreement",
  repetition: "repetition",
  stalemate: "stalemate",
  insufficient: "insufficient material",
  "50move": "fifty-move rule",
  timevsinsufficient: "timeout vs insufficient",
  kingofthehill: "king of the hill",
  threecheck: "three-check",
  bughousepartnerlose: "bughouse partner loss",
};

function resultFromCode(code: string | undefined): GameResult {
  if (!code) return "draw";
  if (code === "win") return "win";
  if (DRAW_CODES.has(code)) return "draw";
  return "loss";
}

function timeClassOf(raw: string | undefined): TimeClass {
  switch (raw) {
    case "bullet":
    case "blitz":
    case "rapid":
    case "daily":
      return raw;
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchIdentity(handle: string): Promise<PlayerIdentity> {
  const encoded = encodeURIComponent(handle.toLowerCase());

  let profile: ChessComProfile;
  try {
    profile = await fetchJson<ChessComProfile>(`${API}/player/${encoded}`, { host: HOST });
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) {
      throw new PlayerNotFoundError(handle, "Chess.com");
    }
    throw error;
  }

  // Ratings are a nicety; a stats outage should not sink the whole scout.
  let stats: ChessComStats = {};
  try {
    stats = await fetchJson<ChessComStats>(`${API}/player/${encoded}/stats`, { host: HOST });
  } catch {
    stats = {};
  }

  const ratings: Record<string, number> = {};
  const buckets: [keyof ChessComStats, TimeClass][] = [
    ["chess_bullet", "bullet"],
    ["chess_blitz", "blitz"],
    ["chess_rapid", "rapid"],
    ["chess_daily", "daily"],
  ];
  for (const [key, label] of buckets) {
    const rating = stats[key]?.last?.rating;
    if (typeof rating === "number") ratings[label] = rating;
    const best = stats[key]?.best?.rating;
    if (typeof best === "number") ratings[`${label}_peak`] = best;
  }

  return {
    platform: "chesscom",
    handle: (profile.username ?? handle).toLowerCase(),
    displayHandle: profile.username ?? handle,
    title: profile.title ?? null,
    country: profile.country?.split("/").pop() ?? null,
    avatarUrl: profile.avatar ?? null,
    ratings,
  };
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

interface ArchiveList {
  archives?: string[];
}

/** `.../games/2024/07` -> Date at the start of that month, UTC. */
function archiveMonthStart(url: string): Date | null {
  const match = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export interface FetchGamesOptions {
  /** Only games strictly after this instant. Enables incremental sync. */
  since?: Date | null;
  /** Stop once this many games have been collected. */
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchGames(
  handle: string,
  options: FetchGamesOptions = {},
): Promise<NormalizedGame[]> {
  const { since = null, limit = 600, signal } = options;
  const canonical = handle.toLowerCase();
  const encoded = encodeURIComponent(canonical);

  let archiveList: ArchiveList;
  try {
    archiveList = await fetchJson<ArchiveList>(`${API}/player/${encoded}/games/archives`, {
      host: HOST,
      signal,
    });
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) {
      throw new PlayerNotFoundError(handle, "Chess.com");
    }
    throw error;
  }

  const archives = archiveList.archives ?? [];
  if (!archives.length) return [];

  // Walk newest-first so `limit` keeps the most recent games, and stop early
  // once we reach months that predate the last sync.
  const ordered = [...archives].reverse();
  const collected: NormalizedGame[] = [];

  for (const archiveUrl of ordered) {
    if (collected.length >= limit) break;

    if (since) {
      const monthStart = archiveMonthStart(archiveUrl);
      // A month is skippable only if it ended before `since`. Comparing the
      // month *start* against `since` would drop the partially-synced month
      // the high-water mark sits inside.
      if (monthStart) {
        const monthEnd = new Date(
          Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
        );
        if (monthEnd <= since) break;
      }
    }

    let payload: { games?: ChessComGame[] };
    try {
      payload = await fetchJson<{ games?: ChessComGame[] }>(archiveUrl, { host: HOST, signal });
    } catch (error) {
      // One bad month should not void an otherwise good sync.
      if (error instanceof UpstreamError && !error.retryable) continue;
      throw error;
    }

    const games = payload.games ?? [];
    for (let i = games.length - 1; i >= 0; i -= 1) {
      if (collected.length >= limit) break;
      const normalized = normalizeGame(games[i], canonical);
      if (!normalized) continue;
      if (since && new Date(normalized.playedAt) <= since) continue;
      collected.push(normalized);
    }
  }

  return collected;
}

export function normalizeGame(game: ChessComGame, canonicalHandle: string): NormalizedGame | null {
  // Variants share the endpoint but not the statistics; a Chess960 loss says
  // nothing about someone's Najdorf.
  if (game.rules && game.rules !== "chess") return null;
  if (!game.end_time) return null;

  const whiteName = game.white?.username?.toLowerCase();
  const blackName = game.black?.username?.toLowerCase();

  let color: GameColor;
  if (whiteName === canonicalHandle) color = "white";
  else if (blackName === canonicalHandle) color = "black";
  else return null;

  const me = color === "white" ? game.white : game.black;
  const them = color === "white" ? game.black : game.white;

  const result = resultFromCode(me?.result);
  // On a win the interesting code lives on the loser's side.
  const rawTermination = result === "win" ? them?.result : me?.result;

  const { headers, san } = parsePgn(game.pgn);
  const rawOpeningName =
    openingFromEcoUrl(headers.ECOUrl ?? game.eco) ?? headers.Opening ?? null;
  const opening = parseOpening(rawOpeningName, headers.ECO ?? null);

  const gameId =
    game.uuid ?? game.url?.split("/").filter(Boolean).pop() ?? `${game.end_time}-${color}`;

  return {
    platform: "chesscom",
    gameId,
    playedAt: new Date(game.end_time * 1000).toISOString(),
    color,
    result,
    playerRating: typeof me?.rating === "number" ? me.rating : null,
    rivalRating: typeof them?.rating === "number" ? them.rating : null,
    rivalHandle: them?.username ?? null,
    timeClass: timeClassOf(game.time_class),
    timeControl: game.time_control ?? null,
    rated: game.rated !== false,
    eco: opening?.eco ?? headers.ECO ?? null,
    openingName: opening?.family ?? null,
    openingSlug: opening?.slug ?? null,
    moveCount: moveCountFromSan(san),
    termination: rawTermination ? (TERMINATION_LABELS[rawTermination] ?? rawTermination) : null,
    url: game.url ?? null,
    movesSan: openingPrefix(san),
  };
}
