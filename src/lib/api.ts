import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { ScoutError } from "@/lib/scouting/service";
import { createClient } from "@/lib/supabase/server";

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Thrown when a route needs a signed-in user and there isn't one. */
export class UnauthorizedError extends Error {
  constructor() {
    super("You need to be signed in.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Turns the handful of error types the scouting stack throws into responses,
 * so every route handler can just `try { ... } catch (e) { return toResponse(e) }`.
 */
export function toResponse(error: unknown) {
  if (error instanceof UnauthorizedError) return fail(error.message, 401);
  if (error instanceof ScoutError) return fail(error.message, error.status);
  if (error instanceof Error) {
    console.error("[api]", error);
    return fail(error.message || "Something went wrong.", 500);
  }
  console.error("[api] unknown error", error);
  return fail("Something went wrong.", 500);
}
