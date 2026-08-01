import "server-only";

import { fetchJson, PlayerNotFoundError, streamNdjson, UpstreamError } from "@/lib/chess/http";
import { parseOpening } from "@/lib/chess/openings";
import { moveCountFromSan, openingPrefix, parseMovetext } from "@/lib/chess/pgn";
import { lichessToken } from "@/lib/env";
import type {
  GameColor,
  GameResult,
  NormalizedGame,
  PlayerIdentity,
  TimeClass,
} from "@/lib/chess/types";

const API = "https://lichess.org/api";
const HOST = "lichess.org";

// ---------------------------------------------------------------------------
// Upstream payload shapes (only the fields actually consumed)
// ---------------------------------------------------------------------------

interface LichessPerf {
  rating?: number;
  games?: number;
  prov?: boolean;
}

interface LichessUser {
  id?: string;
  username?: string;
  title?: string;
  profile?: { country?: string; flag?: string };
  perfs?: Record<string, LichessPerf>;
}

interface LichessPlayerSide {
  user?: { name?: string; id?: string };
  rating?: number;
  aiLevel?: number;
}

interface LichessGame {
  id?: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  status?: string;
  createdAt?: number;
  lastMoveAt?: number;
  winner?: "white" | "black";
  players?: { white?: LichessPlayerSide; black?: LichessPlayerSide };
  opening?: { eco?: string; name?: string; ply?: number };
  moves?: string;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/** Games in these states never produced a real result. */
const UNFINISHED = new Set(["created", "started", "aborted", "noStart"]);

const TERMINATION_LABELS: Record<string, string> = {
  mate: "checkmate",
  resign: "resignation",
  stalemate: "stalemate",
  draw: "agreement",
  outoftime: "timeout",
  timeout: "abandonment",
  cheat: "cheat detected",
  variantEnd: "variant end",
  unknownFinish: "unknown",
};

function timeClassOf(speed: string | undefined): TimeClass {
  switch (speed) {
    case "ultraBullet":
    case "bullet":
      return "bullet";
    case "blitz":
      return "blitz";
    case "rapid":
      return "rapid";
    case "classical":
      return "classical";
    case "correspondence":
      return "daily";
    default:
      return "unknown";
  }
}

function authOptions() {
  const token = lichessToken();
  // Lichess is stricter than Chess.com when unauthenticated; give anonymous
  // traffic more headroom between calls.
  return { host: HOST, token: token || undefined, minGapMs: token ? 250 : 800 };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchIdentity(handle: string): Promise<PlayerIdentity> {
  const encoded = encodeURIComponent(handle.toLowerCase());

  let user: LichessUser;
  try {
    user = await fetchJson<LichessUser>(`${API}/user/${encoded}`, authOptions());
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) {
      throw new PlayerNotFoundError(handle, "Lichess");
    }
    throw error;
  }

  // Lichess answers 200 with `{closed: true}`-ish bodies for some accounts;
  // treat a missing username as "no such player" rather than crashing later.
  if (!user.username && !user.id) {
    throw new PlayerNotFoundError(handle, "Lichess");
  }

  const ratings: Record<string, number> = {};
  const buckets: [string, TimeClass][] = [
    ["bullet", "bullet"],
    ["blitz", "blitz"],
    ["rapid", "rapid"],
    ["classical", "classical"],
    ["correspondence", "daily"],
  ];
  for (const [perfKey, label] of buckets) {
    const perf = user.perfs?.[perfKey];
    // Provisional ratings are noise on a scouting sheet.
    if (perf && typeof perf.rating === "number" && !perf.prov) {
      ratings[label] = perf.rating;
    }
  }

  return {
    platform: "lichess",
    handle: (user.id ?? user.username ?? handle).toLowerCase(),
    displayHandle: user.username ?? handle,
    title: user.title ?? null,
    country: user.profile?.flag ?? user.profile?.country ?? null,
    avatarUrl: null,
    ratings,
  };
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

export interface FetchGamesOptions {
  since?: Date | null;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchGames(
  handle: string,
  options: FetchGamesOptions = {},
): Promise<NormalizedGame[]> {
  const { since = null, limit = 600, signal } = options;
  const canonical = handle.toLowerCase();

  const params = new URLSearchParams({
    max: String(limit),
    opening: "true",
    moves: "true",
    sort: "dateDesc",
    // Keep the payload small: no clock arrays, no evals, no accuracy.
    clocks: "false",
    evals: "false",
    accuracy: "false",
    literate: "false",
  });
  if (since) params.set("since", String(since.getTime() + 1));

  const url = `${API}/games/user/${encodeURIComponent(canonical)}?${params.toString()}`;
  const collected: NormalizedGame[] = [];

  try {
    for await (const game of streamNdjson<LichessGame>(url, { ...authOptions(), signal })) {
      const normalized = normalizeGame(game, canonical);
      if (normalized) collected.push(normalized);
      if (collected.length >= limit) break;
    }
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) {
      throw new PlayerNotFoundError(handle, "Lichess");
    }
    throw error;
  }

  return collected;
}

export function normalizeGame(game: LichessGame, canonicalHandle: string): NormalizedGame | null {
  if (!game.id) return null;
  if (game.variant && game.variant !== "standard") return null;
  if (game.status && UNFINISHED.has(game.status)) return null;

  const whiteId = game.players?.white?.user?.id?.toLowerCase();
  const blackId = game.players?.black?.user?.id?.toLowerCase();

  let color: GameColor;
  if (whiteId === canonicalHandle) color = "white";
  else if (blackId === canonicalHandle) color = "black";
  else return null;

  const me = color === "white" ? game.players?.white : game.players?.black;
  const them = color === "white" ? game.players?.black : game.players?.white;

  // Games against Stockfish levels tell us nothing about human tendencies.
  if (typeof them?.aiLevel === "number") return null;

  let result: GameResult;
  if (!game.winner) result = "draw";
  else result = game.winner === color ? "win" : "loss";

  const opening = parseOpening(game.opening?.name ?? null, game.opening?.eco ?? null);
  const san = parseMovetext(game.moves ?? "");
  const playedAtMs = game.lastMoveAt ?? game.createdAt;

  return {
    platform: "lichess",
    gameId: game.id,
    playedAt: new Date(playedAtMs ?? Date.now()).toISOString(),
    color,
    result,
    playerRating: typeof me?.rating === "number" ? me.rating : null,
    rivalRating: typeof them?.rating === "number" ? them.rating : null,
    rivalHandle: them?.user?.name ?? null,
    timeClass: timeClassOf(game.speed),
    timeControl: game.speed ?? null,
    rated: game.rated !== false,
    eco: opening?.eco ?? game.opening?.eco ?? null,
    openingName: opening?.family ?? null,
    openingSlug: opening?.slug ?? null,
    moveCount: moveCountFromSan(san),
    termination: game.status ? (TERMINATION_LABELS[game.status] ?? game.status) : null,
    url: `https://lichess.org/${game.id}`,
    movesSan: openingPrefix(san),
  };
}
