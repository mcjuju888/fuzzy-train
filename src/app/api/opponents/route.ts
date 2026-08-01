import type { NextRequest } from "next/server";

import { fail, json, requireUser, toResponse } from "@/lib/api";
import { isPlatform, isValidHandle } from "@/lib/chess/handles";
import { resolveOpponent } from "@/lib/scouting/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/opponents — the signed-in user's roster. */
export async function GET() {
  try {
    await requireUser();
    const supabase = await createClient();

    // RLS scopes this to the caller's own rows.
    const { data, error } = await supabase
      .from("saved_opponents")
      .select("id, label, notes, created_at, opponent:opponents(*)")
      .order("created_at", { ascending: false });

    if (error) return fail(error.message, 500);
    return json({ roster: data ?? [] });
  } catch (error) {
    return toResponse(error);
  }
}

/** POST /api/opponents — add a player to the roster. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      platform?: string;
      handle?: string;
      label?: string;
      notes?: string;
    };

    const platform = body.platform ?? "";
    const handle = body.handle ?? "";

    if (!isPlatform(platform)) return fail("platform must be 'chesscom' or 'lichess'.", 422);
    if (!isValidHandle(handle)) return fail("That does not look like a valid username.", 422);

    // Verifies the player exists upstream before it lands on anyone's roster.
    const opponent = await resolveOpponent(platform, handle);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("saved_opponents")
      .upsert(
        {
          user_id: user.id,
          opponent_id: opponent.id,
          label: body.label?.trim() || null,
          notes: body.notes?.trim() || null,
        },
        { onConflict: "user_id,opponent_id" },
      )
      .select("id, label, notes, created_at, opponent:opponents(*)")
      .single();

    if (error) return fail(error.message, 500);
    return json({ saved: data }, 201);
  } catch (error) {
    return toResponse(error);
  }
}
