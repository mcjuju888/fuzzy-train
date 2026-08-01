import type { RecordLine } from "@/lib/chess/types";

/**
 * 100% stacked win/draw/loss bar.
 *
 * Win/draw/loss is polarity, so the fills use the diverging pair (blue/red)
 * with a gray midpoint rather than green/red — see globals.css. The numbers
 * are always rendered beside the bar, so colour never carries the reading on
 * its own.
 */
export function RecordBar({ record, className = "" }: { record: RecordLine; className?: string }) {
  const total = record.games || 1;
  const segments = [
    { key: "win", value: record.wins, label: "wins", className: "bg-win" },
    { key: "draw", value: record.draws, label: "draws", className: "bg-draw" },
    { key: "loss", value: record.losses, label: "losses", className: "bg-loss" },
  ].filter((segment) => segment.value > 0);

  return (
    <div
      className={`flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px] bg-ivory-sunk ${className}`}
      role="img"
      aria-label={`${record.wins} wins, ${record.draws} draws, ${record.losses} losses from ${record.games} games`}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={`${segment.className} first:rounded-l-[4px] last:rounded-r-[4px]`}
          style={{ width: `${(segment.value / total) * 100}%` }}
          title={`${segment.value} ${segment.label} (${Math.round((segment.value / total) * 100)}%)`}
        />
      ))}
    </div>
  );
}

/** Compact "12W 4L 2D" readout — the direct label for the bar above. */
export function RecordDigits({ record, className = "" }: { record: RecordLine; className?: string }) {
  return (
    <span className={`tabular font-mono text-xs whitespace-nowrap ${className}`}>
      <span className="text-win">{record.wins}W</span>{" "}
      <span className="text-draw">{record.draws}D</span>{" "}
      <span className="text-loss">{record.losses}L</span>
    </span>
  );
}

export function RecordLegend({ className = "" }: { className?: string }) {
  const items = [
    { label: "Win", className: "bg-win" },
    { label: "Draw", className: "bg-draw" },
    { label: "Loss", className: "bg-loss" },
  ];

  return (
    <ul className={`flex items-center gap-4 ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-[2px] ${item.className}`} aria-hidden="true" />
          <span className="field-label">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
