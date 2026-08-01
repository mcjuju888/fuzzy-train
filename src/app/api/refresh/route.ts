import type { NextRequest } from "next/server";

import { fail, json, requireUser, toResponse } from "@/lib/api";
import { isPlatform, isValidHandle } from "@/lib/chess/handles";
import { resolveOpponent, syncOpponent } from "@/lib/scouting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/refresh — pull games played since the cached high-water mark.
 *
 * Incremental by default: `last_game_at` becomes the `since` cursor, so a
 * daily refresh on an active player costs one archive page rather than a full
 * history walk. Pass `full: true` to re-walk everything.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      handle?: string;
      full?: boolean;
    };

    const platform = body.platform ?? "";
    const handle = body.handle ?? "";

    if (!isPlatform(platform)) return fail("platform must be 'chesscom' or 'lichess'.", 422);
    if (!isValidHandle(handle)) return fail("That does not look like a valid username.", 422);

    const opponent = await resolveOpponent(platform, handle);
    const outcome = await syncOpponent(opponent, { force: true, full: body.full === true });

    return json({
      opponent: {
        id: outcome.opponent.id,
        platform: outcome.opponent.platform,
        handle: outcome.opponent.handle,
        displayHandle: outcome.opponent.display_handle,
        lastSyncedAt: outcome.opponent.last_synced_at,
        gamesCount: outcome.opponent.games_count,
        syncStatus: outcome.opponent.sync_status,
        syncError: outcome.opponent.sync_error,
      },
      report: outcome.report,
      newGames: outcome.fetched,
      skipped: outcome.skipped,
    });
  } catch (error) {
    return toResponse(error);
  }
}
