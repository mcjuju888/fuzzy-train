"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PLATFORM_LABELS } from "@/lib/chess/handles";
import type { Platform, RatingBand } from "@/lib/chess/types";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DossierHeader({
  platform,
  handle,
  displayHandle,
  title,
  country,
  ratings,
  gamesAnalyzed,
  lastSyncedAt,
  ttlHours,
  syncError,
  initiallySaved,
}: {
  platform: Platform;
  handle: string;
  displayHandle: string;
  title: string | null;
  country: string | null;
  ratings: RatingBand[];
  gamesAnalyzed: number;
  lastSyncedAt: string | null;
  ttlHours: number;
  syncError: string | null;
  initiallySaved: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"refresh" | "save" | null>(null);
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);

  const stale = lastSyncedAt
    ? Date.now() - new Date(lastSyncedAt).getTime() > ttlHours * 3_600_000
    : true;

  async function refresh(full: boolean) {
    setBusy("refresh");
    setError(null);
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle, full }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Refresh failed.");
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Refresh failed.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/opponents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save.");
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const primaryRatings = ratings.filter((band) => band.current).slice(0, 4);

  return (
    <header className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="field-label">Scouting dossier · {PLATFORM_LABELS[platform]}</p>
          <h1 className="mt-1 flex flex-wrap items-baseline gap-2 font-mono text-3xl font-bold break-words text-paper-ink">
            {title ? <span className="text-loss">{title}</span> : null}
            {displayHandle}
          </h1>
          <p className="field-label mt-1">
            {gamesAnalyzed} games analysed
            {country ? ` · ${country}` : ""} · synced {relativeTime(lastSyncedAt)}
            {stale ? " · stale" : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refresh(false)}
            disabled={busy !== null || isPending}
            className="border-2 border-paper-ink px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] text-paper-ink uppercase hover:bg-paper-ink hover:text-ivory disabled:opacity-40"
          >
            {busy === "refresh" ? "Syncing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saved || busy !== null}
            className="bg-paper-ink px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] text-ivory uppercase hover:opacity-85 disabled:opacity-40"
          >
            {saved ? "On roster" : busy === "save" ? "Saving…" : "Add to roster"}
          </button>
        </div>
      </div>

      {primaryRatings.length ? (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-ivory-edge pt-4">
          {primaryRatings.map((band) => (
            <div key={band.timeClass}>
              <dt className="field-label">{band.timeClass}</dt>
              <dd className="tabular font-mono text-xl font-bold text-paper-ink">
                {band.current}
                {band.peak && band.peak > (band.current ?? 0) ? (
                  <span className="ml-1.5 text-xs font-normal text-paper-faint">
                    peak {band.peak}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 border-l-2 border-loss pl-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {syncError && !error ? (
        <p className="mt-4 border-l-2 border-draw pl-3 text-sm text-paper-muted">
          Last sync reported: {syncError}. Showing the most recent cached data.
        </p>
      ) : null}

      {stale ? (
        <p className="mt-4 text-xs text-paper-faint">
          Cache older than {ttlHours}h. Refresh pulls only games played since the last sync.
        </p>
      ) : null}
    </header>
  );
}
