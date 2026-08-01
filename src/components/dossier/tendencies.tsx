import type { TendencyNote } from "@/lib/chess/types";

/**
 * Severity is state, not identity, so it gets an icon + word alongside the
 * colour — never the colour alone.
 */
const SEVERITY = {
  weakness: {
    word: "Exploit",
    glyph: "▲",
    text: "text-loss",
    border: "border-loss",
  },
  strength: {
    word: "Respect",
    glyph: "■",
    text: "text-win",
    border: "border-win",
  },
  neutral: {
    word: "Note",
    glyph: "●",
    text: "text-draw",
    border: "border-draw",
  },
} as const;

function ConfidenceMeter({ value }: { value: number }) {
  const pips = 5;
  const filled = Math.max(1, Math.round(value * pips));

  return (
    <span
      className="flex items-center gap-[3px]"
      title={`Confidence ${Math.round(value * 100)}% — driven mostly by sample size`}
    >
      {Array.from({ length: pips }, (_, index) => (
        <span
          key={index}
          className={`h-1 w-2.5 rounded-[1px] ${index < filled ? "bg-paper-muted" : "bg-ivory-edge"}`}
        />
      ))}
    </span>
  );
}

export function Tendencies({ notes }: { notes: TendencyNote[] }) {
  if (!notes.length) {
    return (
      <div>
        <p className="field-label">Tendencies</p>
        <p className="mt-2 text-sm text-paper-muted">
          Nothing stood out above the noise floor. That usually means a small sample — refresh once
          they have played more games.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="field-label">Tendencies</p>
      <ul className="mt-3 space-y-3">
        {notes.map((note) => {
          const severity = SEVERITY[note.severity];
          return (
            <li key={note.id} className={`border-l-2 ${severity.border} pl-3`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-mono text-[10px] tracking-widest uppercase ${severity.text}`}>
                  <span aria-hidden="true">{severity.glyph}</span> {severity.word}
                </span>
                <h3 className="text-sm font-semibold text-paper-ink">{note.title}</h3>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-paper-muted">{note.detail}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <ConfidenceMeter value={note.confidence} />
                <span className="tabular font-mono text-[11px] text-paper-faint">
                  {note.evidence}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
