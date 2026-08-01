/**
 * Environment access with loud failures.
 *
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time only when referenced
 * as a full static property access, which is why the public values are read
 * literally here rather than through a dynamic key lookup.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const supabaseUrl = () =>
  required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");

export const supabaseAnonKey = () =>
  required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabaseServiceKey = () =>
  required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

/** Absolute origin used to build auth redirect URLs. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function intFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** How long a cached dossier is considered fresh. */
export const cacheTtlHours = () => intFromEnv(process.env.SCOUT_CACHE_TTL_HOURS, 24);

/** Upper bound on games pulled from a single platform in one sync. */
export const maxGamesPerSync = () => intFromEnv(process.env.SCOUT_MAX_GAMES, 600);

export const cronSecret = () => process.env.CRON_SECRET ?? "";

export const chessUserAgent = () =>
  process.env.CHESS_USER_AGENT ?? "gambit-file/0.1 (chess scouting app)";

export const lichessToken = () => process.env.LICHESS_TOKEN ?? "";
