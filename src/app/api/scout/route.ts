import type { NextRequest } from "next/server";

import { isPlatform, isValidHandle } from "@/lib/chess/handles";
import { fail, json, requireUser, toResponse } from "@/lib/api";
import { scout } from "@/lib/scouting/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A cold scout walks several months of archives upstream.
export const maxDuration = 60;

/**
 * GET /api/scout?platform=chesscom&handle=hikaru[&force=1]
 *
 * Cache-aware: only touches the upstream API when the stored dossier has aged
 * past SCOUT_CACHE_TTL_HOURS, or when `force` is set.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const params = request.nextUrl.searchParams;
    const platform = params.get("platform") ?? "";
    const handle = params.get("handle") ?? "";

    if (!isPlatform(platform)) {
      return fail("platform must be 'chesscom' or 'lichess'.", 422);
    }
    if (!isValidHandle(handle)) {
      return fail("That does not look like a valid username.", 422);
    }

    const result = await scout(platform, handle, {
      force: params.get("force") === "1",
      full: params.get("full") === "1",
    });

    return json({
      opponent: {
        id: result.opponent.id,
        platform: result.opponent.platform,
        handle: result.opponent.handle,
        displayHandle: result.opponent.display_handle,
        lastSyncedAt: result.opponent.last_synced_at,
        gamesCount: result.opponent.games_count,
        syncStatus: result.opponent.sync_status,
        syncError: result.opponent.sync_error,
      },
      report: result.report,
      cache: result.cache,
    });
  } catch (error) {
    return toResponse(error);
  }
}
