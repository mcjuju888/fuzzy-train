import type { Platform } from "@/lib/chess/types";

/**
 * Platform naming and username rules.
 *
 * Kept free of any server-only import so client components can validate a
 * username before spending a round trip on it — the adapters themselves live
 * in `platforms.ts`, which is server-only.
 */

export const PLATFORM_LABELS: Record<Platform, string> = {
  chesscom: "Chess.com",
  lichess: "Lichess",
};

export function isPlatform(value: string): value is Platform {
  return value === "chesscom" || value === "lichess";
}

/**
 * Usernames are the primary key of the whole cache, so they get normalized
 * once here. Both platforms are case-insensitive; Lichess additionally treats
 * the id as the canonical form.
 */
export function canonicalHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function isValidHandle(raw: string): boolean {
  const handle = canonicalHandle(raw);
  return handle.length >= 2 && handle.length <= 64 && /^[a-z0-9_-]+$/.test(handle);
}
