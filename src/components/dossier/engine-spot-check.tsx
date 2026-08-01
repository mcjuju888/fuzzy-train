"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";

import { Engine, toCentipawns } from "@/lib/engine/stockfish";
import type { CriticalPosition } from "@/lib/chess/types";

const SEARCH_DEPTH = 14;

/** Centipawn drop thresholds, matching the usual annotation vocabulary. */
const VERDICTS = [
  { min: 300, label: "Blunder", tone: "text-loss" },
  { min: 150, label: "Mistake", tone: "text-loss" },
  { min: 50, label: "Inaccuracy", tone: "text-draw" },
] as const;

interface Finding {
  id: string;
  /** Score of the engine's preferred move, their POV, in centipawns. */
  best: number;
  /** Score of the move they actually played, same position and depth. */
  played: number;
  drop: number;
  bestMove: string | null;
  verdict: (typeof VERDICTS)[number] | null;
}

function classify(drop: number) {
  return VERDICTS.find((verdict) => drop >= verdict.min) ?? null;
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 9_000) {
    const mateIn = Math.round((10_000 - Math.abs(cp)) / 100);
    return `${cp > 0 ? "#" : "-#"}${Math.max(mateIn, 1)}`;
  }
  const pawns = cp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** UCI long algebraic -> SAN, so the suggestion reads like chess notation. */
function toSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  try {
    const board = new Chess(fen);
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    });
    return move?.san ?? null;
  } catch {
    return uci;
  }
}

/** SAN -> UCI, so a move can be handed to the engine's `searchmoves`. */
function toUci(fen: string, san: string): string | null {
  try {
    const board = new Chess(fen);
    const move = board.move(san);
    if (!move) return null;
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
}

function formatLine(line: string[]): string {
  return line
    .map((move, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${move}` : move))
    .join(" ");
}

export function EngineSpotCheck({ positions }: { positions: CriticalPosition[] }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "unavailable">("idle");
  const [progress, setProgress] = useState(0);
  const [findings, setFindings] = useState<Record<string, Finding>>({});
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);

  // Positions where we know both sides of one of their moves.
  const checkable = positions.filter((p) => p.fenBefore && p.theirMove);

  useEffect(
    () => () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    },
    [],
  );

  const run = useCallback(async () => {
    setState("running");
    setError(null);
    setProgress(0);

    let engine: Engine;
    try {
      engine = await Engine.create();
      engineRef.current = engine;
    } catch (caught) {
      setState("unavailable");
      setError(caught instanceof Error ? caught.message : "Could not start the engine.");
      return;
    }

    try {
      for (const position of checkable) {
        const fen = position.fenBefore!;
        const playedUci = toUci(fen, position.theirMove!);
        if (!playedUci) {
          setProgress((current) => current + 1);
          continue;
        }

        // Find the engine's choice first, then score both candidates with a
        // *restricted* search. A `searchmoves` search concentrates the whole
        // budget on one move and so reads deeper than an unrestricted one at
        // the same nominal depth; comparing a restricted score against an
        // unrestricted one bakes that difference into the drop. Restricting
        // both sides cancels it.
        const bestEval = await engine.evaluate(fen, SEARCH_DEPTH);
        const bestUci = bestEval.bestMove;
        const bestMove = toSan(fen, bestUci);

        let best: number;
        let played: number;

        if (!bestUci || bestUci === playedUci) {
          // They played the engine's move — no second search needed.
          const score = await engine.evaluate(fen, SEARCH_DEPTH, [playedUci]);
          best = toCentipawns(score);
          played = best;
        } else {
          best = toCentipawns(await engine.evaluate(fen, SEARCH_DEPTH, [bestUci]));
          played = toCentipawns(await engine.evaluate(fen, SEARCH_DEPTH, [playedUci]));
        }

        // Their move cannot genuinely beat the engine's; clamp search noise.
        const drop = Math.max(0, best - played);

        setFindings((current) => ({
          ...current,
          [position.id]: { id: position.id, best, played, drop, bestMove, verdict: classify(drop) },
        }));
        setProgress((current) => current + 1);
      }
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The engine run failed.");
      setState("done");
    } finally {
      engine.destroy();
      engineRef.current = null;
    }
  }, [checkable]);

  if (!positions.length) return null;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="field-label">Section 05</p>
          <h2 className="font-mono text-lg font-bold text-paper-ink">Repeat positions</h2>
        </div>
        {checkable.length && state === "idle" ? (
          <button
            type="button"
            onClick={run}
            className="bg-paper-ink px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] text-ivory uppercase hover:opacity-85"
          >
            Run engine check
          </button>
        ) : null}
        {state === "running" ? (
          <p className="field-label" role="status">
            Analysing {progress + 1} of {checkable.length} · depth {SEARCH_DEPTH}
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-paper-muted">
        Lines they entered at least three times and scored badly from. The engine check runs
        entirely in your browser and flags whether their own move is the thing losing ground.
      </p>

      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-loss pl-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      <div className="perforation my-5" />

      <ul className="space-y-4">
        {positions.map((position) => {
          const finding = findings[position.id];
          return (
            <li key={position.id} className="border-l-2 border-ivory-edge pl-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-paper-ink">
                  {position.openingName}
                  {position.eco ? (
                    <span className="tabular ml-2 font-mono text-[11px] text-paper-faint">
                      {position.eco}
                    </span>
                  ) : null}
                </p>
                <p className="tabular font-mono text-[11px] text-paper-faint">
                  as {position.color} · {position.occurrences}× ·{" "}
                  {Math.round(position.record.score * 100)}% ({Math.round(position.scoreDelta * 100)}{" "}
                  vs baseline)
                </p>
              </div>

              <p className="tabular mt-1 font-mono text-xs break-words text-paper-muted">
                {formatLine(position.line)}
              </p>

              {finding ? (
                <p className="tabular mt-2 font-mono text-xs">
                  {finding.verdict ? (
                    <span className={`font-bold ${finding.verdict.tone}`}>
                      {finding.verdict.label}:{" "}
                    </span>
                  ) : (
                    <span className="font-bold text-win">Sound: </span>
                  )}
                  <span className="text-paper-ink">{position.theirMove}</span>
                  {finding.verdict ? (
                    <span className="text-paper-muted">
                      {" "}
                      scores {formatEval(finding.played)} where {finding.bestMove ?? "the best move"}{" "}
                      holds {formatEval(finding.best)}
                    </span>
                  ) : (
                    <span className="text-paper-muted">
                      {" "}
                      is the engine&rsquo;s choice here at {formatEval(finding.played)}
                    </span>
                  )}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state === "unavailable" ? (
        <p className="mt-4 text-xs text-paper-faint">
          The Stockfish assets are not present on this deployment, so only the aggregate statistics
          above are available.
        </p>
      ) : null}
    </section>
  );
}
