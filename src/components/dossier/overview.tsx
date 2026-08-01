import { FormStrip } from "@/components/dossier/form-strip";
import { RecordBar, RecordLegend } from "@/components/dossier/record-bar";
import { Tendencies } from "@/components/dossier/tendencies";
import type { RecordLine, ScoutingReport } from "@/lib/chess/types";

function ColorSplitRow({ label, record }: { label: string; record: RecordLine }) {
  if (!record.games) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="field-label">{label}</p>
        <p className="tabular font-mono text-xs text-paper-ink">
          <span className="font-bold">{Math.round(record.score * 100)}%</span>
          <span className="ml-2 text-paper-faint">{record.games} games</span>
        </p>
      </div>
      <RecordBar record={record} className="mt-1.5" />
    </div>
  );
}

export function Overview({ report }: { report: ScoutingReport }) {
  const { overall, byColor, pace, window: reportWindow } = report;

  const span =
    reportWindow.from && reportWindow.to
      ? `${new Date(reportWindow.from).toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        })} – ${new Date(reportWindow.to).toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        })}`
      : "no games cached";

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="field-label">Section 01</p>
          <h2 className="font-mono text-lg font-bold text-paper-ink">Overview</h2>
        </div>
        <RecordLegend />
      </div>

      <div className="perforation my-5" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          {/* Hero figure: the single number that answers "how good are they?" */}
          <div>
            <p className="field-label">Overall score</p>
            <p className="tabular mt-1 font-mono text-5xl leading-none font-bold text-paper-ink">
              {Math.round(overall.score * 100)}
              <span className="text-2xl text-paper-faint">%</span>
            </p>
            <p className="tabular mt-2 font-mono text-sm text-paper-muted">
              {overall.wins}W · {overall.draws}D · {overall.losses}L over {overall.games} games
            </p>
            <p className="field-label mt-1">{span}</p>
          </div>

          <RecordBar record={overall} />

          <div className="space-y-4">
            <ColorSplitRow label="As white" record={byColor.white} />
            <ColorSplitRow label="As black" record={byColor.black} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-ivory-edge pt-4">
            <div>
              <dt className="field-label">Median length</dt>
              <dd className="tabular font-mono text-sm text-paper-ink">{pace.medianMoves} moves</dd>
            </div>
            <div>
              <dt className="field-label">Decisive</dt>
              <dd className="tabular font-mono text-sm text-paper-ink">
                {Math.round(pace.decisiveShare * 100)}%
              </dd>
            </div>
            <div>
              <dt className="field-label">Under 25 moves</dt>
              <dd className="tabular font-mono text-sm text-paper-ink">
                {Math.round(pace.shortGameShare * 100)}%
              </dd>
            </div>
            <div>
              <dt className="field-label">Losses on time</dt>
              <dd className="tabular font-mono text-sm text-paper-ink">
                {Math.round(pace.timeoutShare * 100)}%
              </dd>
            </div>
          </dl>
        </div>

        <div className="space-y-6">
          <div>
            <p className="field-label">Recent form — newest first</p>
            <div className="mt-2">
              <FormStrip report={report} />
            </div>
          </div>

          <div className="border-t border-ivory-edge pt-5">
            <Tendencies notes={report.tendencies} />
          </div>
        </div>
      </div>
    </section>
  );
}
