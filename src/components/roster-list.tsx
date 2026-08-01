"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PLATFORM_LABELS } from "@/lib/chess/handles";
import type { OpponentRow } from "@/lib/supabase/types";

export interface RosterEntry {
  id: string;
  label: string | null;
  notes: string | null;
  created_at: string;
  opponent: OpponentRow;
}

function freshness(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "never synced";
  const hours = Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000);
  if (hours < 1) return "synced just now";
  if (hours < 24) return `synced ${hours}h ago`;
  return `synced ${Math.round(hours / 24)}d ago`;
}

function RosterCard({ entry, onChanged }: { entry: RosterEntry; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [label, setLabel] = useState(entry.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { opponent } = entry;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/opponents/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, label }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not save.");
      setEditing(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/opponents/${entry.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Could not remove.");
      }
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove.");
      setBusy(false);
    }
  }

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="field-label">{PLATFORM_LABELS[opponent.platform]}</p>
          <Link
            href={`/opponent/${opponent.platform}/${encodeURIComponent(opponent.handle)}`}
            className="mt-0.5 block font-mono text-xl font-bold break-words text-paper-ink hover:underline"
          >
            {opponent.title ? <span className="text-loss">{opponent.title} </span> : null}
            {opponent.display_handle}
          </Link>
          {label && !editing ? (
            <p className="mt-1 text-sm font-semibold text-paper-muted">{label}</p>
          ) : null}
          <p className="field-label mt-1">
            {opponent.games_count} games cached · {freshness(opponent.last_synced_at)}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing((current) => !current)}
            disabled={busy}
            className="border-2 border-ivory-edge px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.15em] text-paper-muted uppercase hover:border-paper-faint disabled:opacity-40"
          >
            {editing ? "Cancel" : "Notes"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="border-2 border-ivory-edge px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.15em] text-loss uppercase hover:border-loss disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 border-t border-ivory-edge pt-4">
          <div>
            <label htmlFor={`label-${entry.id}`} className="field-label block">
              Label
            </label>
            <input
              id={`label-${entry.id}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Club rival, round 3, …"
              className="mt-1.5 w-full border-2 border-ivory-edge bg-ivory-sunk px-3 py-1.5 font-mono text-sm text-paper-ink focus:border-win focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor={`notes-${entry.id}`} className="field-label block">
              Private notes
            </label>
            <textarea
              id={`notes-${entry.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="What you noticed over the board…"
              className="mt-1.5 w-full border-2 border-ivory-edge bg-ivory-sunk px-3 py-2 text-sm text-paper-ink focus:border-win focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="bg-paper-ink px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] text-ivory uppercase disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      ) : notes ? (
        <p className="mt-3 border-l-2 border-ivory-edge pl-3 text-sm whitespace-pre-wrap text-paper-muted">
          {notes}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-loss">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function RosterList({ entries }: { entries: RosterEntry[] }) {
  const router = useRouter();

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {entries.map((entry) => (
        <RosterCard key={entry.id} entry={entry} onChanged={() => router.refresh()} />
      ))}
    </ul>
  );
}
