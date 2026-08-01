import type { NextRequest } from "next/server";

import { fail, json } from "@/lib/api";
import { cacheTtlHours, cronSecret } from "@/lib/env";
import { syncOpponent } from "@/lib/scouting/service";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Opponents refreshed per invocation — keeps the run inside maxDuration. */
const BATCH_SIZE = 20;

/**
 * GET /api/cron/refresh — scheduled incremental sweep.
 *
 * Only opponents that at least one user has actually saved are refreshed; a
 * one-off lookup nobody kept is not worth the upstream quota. Each opponent
 * is synced incrementally from its own high-water mark.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret) {
    return fail("CRON_SECRET is not configured.", 503);
  }

  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return fail("Unauthorized.", 401);
  }

  const ttlHours = cacheTtlHours();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("stale_saved_opponents", {
    ttl_hours: ttlHours,
    max_rows: BATCH_SIZE,
  });

  if (error) return fail(error.message, 500);

  const targets = data ?? [];
  const results: { handle: string; platform: string; newGames?: number; error?: string }[] = [];

  for (const target of targets) {
    // Re-read the full row: the RPC returns only the columns it needs, and
    // syncOpponent wants the sync bookkeeping fields for its locking.
    const { data: opponent } = await admin
      .from("opponents")
      .select("*")
      .eq("id", target.id)
      .maybeSingle();

    if (!opponent) continue;

    try {
      const outcome = await syncOpponent(opponent, { force: true, ttlHours });
      results.push({
        handle: opponent.handle,
        platform: opponent.platform,
        newGames: outcome.fetched,
      });
    } catch (syncError) {
      // One bad handle (deleted account, upstream hiccup) must not abort the
      // sweep — the failure is already recorded on the opponent row.
      results.push({
        handle: opponent.handle,
        platform: opponent.platform,
        error: syncError instanceof Error ? syncError.message : "sync failed",
      });
    }
  }

  return json({
    checked: targets.length,
    refreshed: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    results,
  });
}
