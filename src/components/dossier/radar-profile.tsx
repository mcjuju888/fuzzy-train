"use client";

import { useId, useState } from "react";

import type { RadarAxis } from "@/lib/chess/types";

const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 104;
const RINGS = [25, 50, 75, 100];

/** Distance from centre at which axis labels are placed. */
const LABEL_RADIUS = 122;

/**
 * The plot is 300×300, but the axis labels sit outside it and would be clipped
 * by a tight viewBox. The horizontal padding covers the widest label
 * ("Opening Prep") anchored at the 2 and 10 o'clock spokes.
 */
const VIEW_BOX = `-46 -10 ${SIZE + 92} ${SIZE + 24}`;

function pointAt(index: number, count: number, value: number): [number, number] {
  // Start at 12 o'clock and go clockwise.
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const distance = (value / 100) * RADIUS;
  return [CENTER + Math.cos(angle) * distance, CENTER + Math.sin(angle) * distance];
}

function polygon(axes: RadarAxis[], value?: number): string {
  return axes
    .map((axis, index) => pointAt(index, axes.length, value ?? axis.value).join(","))
    .join(" ");
}

/**
 * Six-axis player profile.
 *
 * One series, so there is no legend — the card title names it. Each vertex is
 * an 8px marker with a hover/focus readout carrying the axis's plain-language
 * hint, since a radar value on its own is meaningless without knowing what
 * fed it.
 */
export function RadarProfile({ axes }: { axes: RadarAxis[] }) {
  const [active, setActive] = useState<RadarAxis | null>(null);
  const gradientId = useId();

  if (axes.length < 3) {
    return <p className="text-sm text-paper-muted">Not enough games to build a profile.</p>;
  }

  return (
    <div>
      <div className="flex justify-center">
        <svg
          viewBox={VIEW_BOX}
          className="h-auto w-full max-w-[360px]"
          role="img"
          aria-label={`Player profile: ${axes.map((a) => `${a.label} ${a.value} of 100`).join(", ")}`}
        >
          <defs>
            <radialGradient id={gradientId}>
              <stop offset="0%" stopColor="var(--color-win)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-win)" stopOpacity="0.12" />
            </radialGradient>
          </defs>

          {/* Recessive grid rings */}
          {RINGS.map((ring) => (
            <polygon
              key={ring}
              points={polygon(axes, ring)}
              fill="none"
              stroke="var(--color-grid)"
              strokeWidth={1}
            />
          ))}

          {/* Spokes */}
          {axes.map((axis, index) => {
            const [x, y] = pointAt(index, axes.length, 100);
            return (
              <line
                key={axis.key}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke="var(--color-grid)"
                strokeWidth={1}
              />
            );
          })}

          {/* The player's shape */}
          <polygon
            points={polygon(axes)}
            fill={`url(#${gradientId})`}
            stroke="var(--color-win)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Vertex markers, 8px, ringed in the surface colour so they stay
              legible where the shape crosses a gridline. */}
          {axes.map((axis, index) => {
            const [x, y] = pointAt(index, axes.length, axis.value);
            const isActive = active?.key === axis.key;
            return (
              <g key={axis.key}>
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 6 : 4}
                  fill="var(--color-win)"
                  stroke="var(--color-ivory)"
                  strokeWidth={2}
                />
                {/* Oversized transparent hit target */}
                <circle
                  cx={x}
                  cy={y}
                  r={16}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${axis.label}: ${axis.value} of 100. ${axis.hint}`}
                  className="cursor-pointer focus:outline-none"
                  onMouseEnter={() => setActive(axis)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(axis)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}

          {/* Axis labels, pushed just outside the outer ring */}
          {axes.map((axis, index) => {
            const [x, y] = pointAt(index, axes.length, LABEL_RADIUS);
            const anchor = x > CENTER + 4 ? "start" : x < CENTER - 4 ? "end" : "middle";
            return (
              <text
                key={axis.key}
                x={x}
                y={y}
                textAnchor={anchor}
                dominantBaseline="middle"
                className="font-mono"
                fontSize="9"
                letterSpacing="0.1em"
                fill="var(--color-paper-faint)"
              >
                {axis.label.toUpperCase()}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Readout: hover detail, or the full list as the always-available
          table view when nothing is hovered. */}
      <div className="mt-4 min-h-[3.5rem] border-t border-ivory-edge pt-3">
        {active ? (
          <div>
            <p className="field-label">{active.label}</p>
            <p className="tabular mt-1 font-mono text-2xl leading-none text-paper-ink">
              {active.value}
              <span className="text-sm text-paper-faint">/100</span>
            </p>
            <p className="mt-1 text-xs text-paper-muted">{active.hint}</p>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {axes.map((axis) => (
              <div key={axis.key} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-xs text-paper-muted">{axis.label}</dt>
                <dd className="tabular font-mono text-xs text-paper-ink">{axis.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
