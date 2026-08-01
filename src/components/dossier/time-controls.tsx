import { RecordBar, RecordDigits, RecordLegend } from "@/components/dossier/record-bar";
import type { RatingBand, TimeControlLine } from "@/lib/chess/types";

const LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
  daily: "Daily",
  unknown: "Other",
};

export function TimeControls({
  lines,
  ratings,
}: {
  lines: TimeControlLine[];
  ratings: RatingBand[];
}) {
  const ratingFor = (timeClass: string) => ratings.find((band) => band.timeClass === timeClass);

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="field-label">Section 03</p>
          <h2 className="font-mono text-lg font-bold text-paper-ink">Time-control profile</h2>
        </div>
        <RecordLegend />
      </div>

      <div className="perforation my-5" />

      {lines.length ? (
        <ul className="divide-y divide-ivory-edge">
          {lines.map((line) => {
            const band = ratingFor(line.timeClass);
            return (
              <li key={line.timeClass} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-paper-ink">
                    {LABELS[line.timeClass] ?? line.timeClass}
                  </p>
                  <p className="tabular font-mono text-xs text-paper-faint">
                    {line.games} games · {Math.round(line.share * 100)}% of sample
                    {line.averageMoves ? ` · ~${line.averageMoves} moves` : ""}
                  </p>
                </div>

                <div className="mt-1.5 flex items-center gap-3">
                  <RecordBar record={line} className="flex-1" />
                  <RecordDigits record={line} />
                  <span className="tabular w-10 shrink-0 text-right font-mono text-xs font-bold text-paper-ink">
                    {Math.round(line.score * 100)}%
                  </span>
                </div>

                {band?.current ? (
                  <p className="tabular mt-1.5 font-mono text-[11px] text-paper-faint">
                    Rating {band.current}
                    {band.peak && band.peak !== band.current ? ` · peak ${band.peak}` : ""}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-paper-muted">No games in the cached window.</p>
      )}
    </section>
  );
}
