import type { NextRequest } from "next/server";

import { fail, json, requireUser, toResponse } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import type { SavedOpponentRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/opponents/:id — edit the private label and notes. */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireUser();
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      label?: string | null;
      notes?: string | null;
    };

    const patch: Partial<Pick<SavedOpponentRow, "label" | "notes">> = {};
    if ("label" in body) patch.label = body.label?.trim() || null;
    if ("notes" in body) patch.notes = body.notes?.trim() || null;
    if (!Object.keys(patch).length) return fail("Nothing to update.", 422);

    // No user_id filter needed: RLS only exposes the caller's own rows, and a
    // mismatched id simply matches nothing.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("saved_opponents")
      .update(patch)
      .eq("id", id)
      .select("id, label, notes, created_at, opponent:opponents(*)")
      .maybeSingle();

    if (error) return fail(error.message, 500);
    if (!data) return fail("Not found.", 404);
    return json({ saved: data });
  } catch (error) {
    return toResponse(error);
  }
}

/** DELETE /api/opponents/:id — drop a player from the roster. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    await requireUser();
    const { id } = await params;

    const supabase = await createClient();
    const { error } = await supabase.from("saved_opponents").delete().eq("id", id);

    if (error) return fail(error.message, 500);
    return json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}
