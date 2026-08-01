import "server-only";

import * as chesscom from "@/lib/chess/chesscom";
import * as lichess from "@/lib/chess/lichess";
import type { NormalizedGame, Platform, PlayerIdentity } from "@/lib/chess/types";

/**
 * Single seam between the app and the two upstream providers. Adding a third
 * platform means implementing this pair of functions and nothing else.
 */
interface Adapter {
  fetchIdentity(handle: string): Promise<PlayerIdentity>;
  fetchGames(
    handle: string,
    options: { since?: Date | null; limit?: number; signal?: AbortSignal },
  ): Promise<NormalizedGame[]>;
}

const ADAPTERS: Record<Platform, Adapter> = {
  chesscom,
  lichess,
};

export function adapterFor(platform: Platform): Adapter {
  return ADAPTERS[platform];
}
