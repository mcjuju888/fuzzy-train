import { RecordBar, RecordDigits, RecordLegend } from "@/components/dossier/record-bar";
import type { OpeningLine, OpeningRepertoire } from "@/lib/chess/types";

function OpeningRow({ line }: { line: OpeningLine }) {
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-paper-ink" title={line.name}>
          {line.name}
          {line.eco ? (
            <span className="tabular ml-2 font-mono text-[11px] text-paper-faint">{line.eco}</span>
          ) : null}
        </p>
        <p className="tabular shrink-0 font-mono text-xs text-paper-faint">
          {Math.round(line.share * 100)}%
        </p>
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        <RecordBar record={line} className="flex-1" />
        <RecordDigits record={line} />
        <span className="tabular w-10 shrink-0 text-right font-mono text-xs font-bold text-paper-ink">
          {Math.round(line.score * 100)}%
        </span>
      </div>
    </li>
  );
}

function ColorColumn({ title, lines }: { title: string; lines: OpeningLine[] }) {
  return (
    <div>
      <p className="field-label">{title}</p>
      {lines.length ? (
        <ul className="mt-1 divide-y divide-ivory-edge">
          {lines.map((line) => (
            <OpeningRow key={line.slug} line={line} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-paper-muted">No classified games with this colour.</p>
      )}
    </div>
  );
}

export function Openings({ repertoire }: { repertoire: OpeningRepertoire }) {
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="field-label">Section 02</p>
          <h2 className="font-mono text-lg font-bold text-paper-ink">Opening repertoire</h2>
        </div>
        <RecordLegend />
      </div>

      <p className="mt-2 text-sm text-paper-muted">
        Grouped by opening family, not by exact variation — the percentage on the right is their
        score in that family, the one on the left is how often they enter it.
      </p>

      <div className="perforation my-5" />

      <div className="grid gap-8 md:grid-cols-2">
        <ColorColumn title="As white" lines={repertoire.white} />
        <ColorColumn title="As black" lines={repertoire.black} />
      </div>
    </section>
  );
}
