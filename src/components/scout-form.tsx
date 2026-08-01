"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { canonicalHandle, isValidHandle, PLATFORM_LABELS } from "@/lib/chess/handles";
import type { Platform } from "@/lib/chess/types";

const PLATFORMS: Platform[] = ["chesscom", "lichess"];

export function ScoutForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("chesscom");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const canonical = canonicalHandle(handle);

    if (!isValidHandle(canonical)) {
      setError("Usernames are 2–64 characters, letters, digits, hyphen or underscore.");
      return;
    }

    setError(null);
    setPending(true);
    router.push(`/opponent/${platform}/${encodeURIComponent(canonical)}`);
  }

  return (
    <form onSubmit={submit} className={compact ? "flex flex-wrap items-end gap-3" : "space-y-5"}>
      <fieldset className={compact ? "" : "space-y-2"}>
        <legend className="field-label">Platform</legend>
        <div className="mt-2 flex gap-2">
          {PLATFORMS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={platform === option}
              onClick={() => setPlatform(option)}
              className={`border-2 px-3 py-1.5 font-mono text-[11px] font-bold tracking-[0.15em] uppercase transition-colors ${
                platform === option
                  ? "border-paper-ink bg-paper-ink text-ivory"
                  : "border-ivory-edge text-paper-muted hover:border-paper-faint"
              }`}
            >
              {PLATFORM_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={compact ? "min-w-[12rem] flex-1" : ""}>
        <label htmlFor="handle" className="field-label block">
          Username
        </label>
        <input
          id="handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder={platform === "chesscom" ? "hikaru" : "DrNykterstein"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-2 w-full border-2 border-ivory-edge bg-ivory-sunk px-3 py-2 font-mono text-sm text-paper-ink placeholder:text-paper-faint focus:border-win focus:outline-none"
        />
      </div>

      {error ? (
        <p role="alert" className="border-l-2 border-loss pl-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !handle.trim()}
        className={`bg-paper-ink px-4 py-2.5 font-mono text-xs font-bold tracking-[0.2em] text-ivory uppercase hover:opacity-85 disabled:opacity-40 ${
          compact ? "" : "w-full"
        }`}
      >
        {pending ? "Opening…" : "Open file"}
      </button>
    </form>
  );
}
