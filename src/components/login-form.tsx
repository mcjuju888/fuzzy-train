"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  nextPath,
  initialError,
}: {
  nextPath: string | null;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("sending");

    try {
      const supabase = createClient();
      const callback = new URL("/auth/callback", window.location.origin);
      if (nextPath) callback.searchParams.set("next", nextPath);

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback.toString() },
      });

      if (signInError) {
        setError(signInError.message);
        setStatus("idle");
        return;
      }

      setStatus("sent");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the link.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="border-2 border-win/40 bg-win/5 p-4">
        <p className="font-mono text-xs tracking-widest text-win uppercase">Link sent</p>
        <p className="mt-2 text-sm text-paper-ink">
          Check <span className="font-mono">{email}</span> and open the link to finish signing in.
          It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="field-label block">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
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
        disabled={status === "sending" || !email.trim()}
        className="w-full bg-paper-ink px-4 py-2.5 font-mono text-xs font-bold tracking-[0.2em] text-ivory uppercase transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        {status === "sending" ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
