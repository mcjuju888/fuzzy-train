import type { FormEntry, ScoutingReport } from "@/lib/chess/types";

const RESULT_STYLES: Record<FormEntry["result"], { chip: string; letter: string }> = {
  win: { chip: "bg-win text-ivory", letter: "W" },
  draw: { chip: "bg-draw text-ivory", letter: "D" },
  loss: { chip: "bg-loss text-ivory", letter: "L" },
};

function describe(entry: FormEntry): string {
  const when = new Date(entry.playedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const parts = [
    `${entry.result} as ${entry.color}`,
    entry.opponent ? `vs ${entry.opponent}` : null,
    entry.opening,
    entry.timeClass !== "unknown" ? entry.timeClass : null,
    when,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Most-recent-first run of results. The letter inside each chip is the
 * secondary encoding, so the strip is readable without colour.
 */
export function FormStrip({ report }: { report: ScoutingReport }) {
  const { form, formSummary } = report;

  if (!form.length) {
    return <p className="text-sm text-paper-muted">No recent games in the cached window.</p>;
  }

  const trendCopy =
    formSummary.trend === "hot"
      ? "above their baseline"
      : formSummary.trend === "cold"
        ? "below their baseline"
        : "in line with their baseline";

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {form.map((entry) => {
          const style = RESULT_STYLES[entry.result];
          const chip = (
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-[3px] font-mono text-xs font-bold ${style.chip}`}
            >
              {style.letter}
            </span>
          );

          return entry.url ? (
            <a
              key={entry.gameId}
              href={entry.url}
              target="_blank"
              rel="noreferrer noopener"
              title={describe(entry)}
              className="transition-opacity hover:opacity-75"
            >
              {chip}
            </a>
          ) : (
            <span key={entry.gameId} title={describe(entry)}>
              {chip}
            </span>
          );
        })}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-paper-muted">
        Last {formSummary.lastN} games scored{" "}
        <span className="tabular font-mono text-paper-ink">
          {Math.round(formSummary.score * 100)}%
        </span>{" "}
        — {trendCopy}.
        {formSummary.currentStreak && formSummary.currentStreak.length > 1 ? (
          <>
            {" "}
            Currently on {formSummary.currentStreak.length} straight{" "}
            {formSummary.currentStreak.result}
            {formSummary.currentStreak.result === "loss" ? "es" : "s"}.
          </>
        ) : null}
      </p>
    </div>
  );
}
