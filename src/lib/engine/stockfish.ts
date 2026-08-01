/**
 * Browser-side Stockfish wrapper.
 *
 * The engine runs as a same-origin Web Worker loaded from /engine, which is
 * vendored at install time (see scripts/vendor-engine.mjs). It is optional:
 * `create()` rejects when the assets are absent and the UI hides the feature.
 */

export interface EngineScore {
  /** Centipawns from the side-to-move's point of view. Null when mating. */
  cp: number | null;
  /** Moves to mate, signed from the side-to-move's point of view. */
  mate: number | null;
  depth: number;
  /** Engine's preferred move, in UCI long algebraic. */
  bestMove: string | null;
}

/** Collapses cp/mate into one comparable number, side-to-move relative. */
export function toCentipawns(score: EngineScore): number {
  if (score.mate !== null) {
    // Mate scores dominate any material evaluation but still order sensibly by
    // distance, so a mate in 2 outranks a mate in 8.
    return score.mate > 0 ? 10_000 - score.mate * 100 : -10_000 - score.mate * 100;
  }
  return score.cp ?? 0;
}

const ENGINE_URL = "/engine/stockfish.wasm.js";

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (event: MessageEvent) => {
      const line =
        typeof event.data === "string" ? event.data : (event.data?.data ?? String(event.data));
      for (const listener of [...this.listeners]) listener(line);
    };
  }

  static async create(): Promise<Engine> {
    // A missing asset surfaces as an HTML 404 body that fails to parse inside
    // the worker, which is far harder to diagnose than an explicit probe.
    const probe = await fetch(ENGINE_URL, { method: "HEAD" });
    if (!probe.ok) {
      throw new Error("Engine assets are not available on this deployment.");
    }

    const engine = new Engine(new Worker(ENGINE_URL));
    await engine.handshake();
    return engine;
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs = 20_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("The engine stopped responding."));
      }, timeoutMs);

      const listener = (line: string) => {
        if (!predicate(line)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(line);
      };

      this.listeners.add(listener);
    });
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private async handshake() {
    const uciok = this.waitFor((line) => line.startsWith("uciok"));
    this.send("uci");
    await uciok;

    const ready = this.waitFor((line) => line.startsWith("readyok"));
    this.send("isready");
    await ready;
  }

  /**
   * Evaluates one position to a fixed depth.
   *
   * `searchMoves` (UCI long algebraic) restricts the search to those moves, so
   * the score comes back for that specific continuation. Scoring a candidate
   * move this way — rather than evaluating the position after playing it —
   * keeps both numbers on the same side-to-move, same depth, same search, which
   * is the only comparison that means anything.
   */
  async evaluate(fen: string, depth = 14, searchMoves?: string[]): Promise<EngineScore> {
    const result: EngineScore = { cp: null, mate: null, depth: 0, bestMove: null };

    const collector = (line: string) => {
      if (!line.startsWith("info ")) return;
      // Lower-bound/upper-bound reports are mid-search artefacts, not evaluations.
      if (line.includes(" lowerbound") || line.includes(" upperbound")) return;

      const depthMatch = /\bdepth (\d+)/.exec(line);
      const cpMatch = /\bscore cp (-?\d+)/.exec(line);
      const mateMatch = /\bscore mate (-?\d+)/.exec(line);

      if (!cpMatch && !mateMatch) return;
      if (depthMatch) result.depth = Number(depthMatch[1]);
      result.cp = cpMatch ? Number(cpMatch[1]) : null;
      result.mate = mateMatch ? Number(mateMatch[1]) : null;
    };

    this.listeners.add(collector);

    try {
      const done = this.waitFor((line) => line.startsWith("bestmove"), 30_000);
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      this.send(
        searchMoves?.length
          ? `go depth ${depth} searchmoves ${searchMoves.join(" ")}`
          : `go depth ${depth}`,
      );

      const bestmoveLine = await done;
      const move = bestmoveLine.split(/\s+/)[1];
      result.bestMove = move && move !== "(none)" ? move : null;
    } finally {
      this.listeners.delete(collector);
    }

    return result;
  }

  destroy() {
    this.listeners.clear();
    try {
      this.send("quit");
    } catch {
      // Worker may already be gone; nothing to clean up.
    }
    this.worker.terminate();
  }
}
