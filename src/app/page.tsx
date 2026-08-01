import Link from "next/link";

import { getSessionUser } from "@/lib/supabase/server";

const SECTIONS = [
  {
    heading: "Repertoire by colour",
    body: "What they actually play as white and as black, grouped by opening family, with their score in each line and how often they enter it.",
  },
  {
    heading: "Time-control profile",
    body: "Bullet, blitz, rapid and classical broken out separately — most players are a different opponent in each pool.",
  },
  {
    heading: "Tendency notes",
    body: "Plain-language reads with the evidence attached: weak colour, leaky openings, clock trouble, form swings, rating drift.",
  },
  {
    heading: "Engine spot-checks",
    body: "Lines they repeat and score badly from, run through Stockfish in your browser to see whether their own move is what loses ground.",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <div className="space-y-8 py-6">
      <section className="max-w-3xl">
        <p className="field-label-plate">Opponent preparation</p>
        <h1 className="mt-3 font-mono text-4xl leading-tight font-bold text-plate-ink sm:text-5xl">
          Build a case file on your next opponent.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-plate-muted">
          Gambit File reads a player&rsquo;s public games from Chess.com and Lichess and turns them
          into a scouting dossier: what they play, where they leak points, and how they behave when
          the clock gets short.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={user ? "/scout" : "/login"}
            className="bg-ivory px-5 py-3 font-mono text-xs font-bold tracking-[0.2em] text-ink uppercase hover:opacity-90"
          >
            {user ? "Scout a player" : "Sign in to start"}
          </Link>
          {user ? (
            <Link
              href="/roster"
              className="border-2 border-plate-faint px-5 py-3 font-mono text-xs font-bold tracking-[0.2em] text-plate-ink uppercase hover:border-plate-ink"
            >
              Your roster
            </Link>
          ) : null}
        </div>
      </section>

      <div className="perforation opacity-20" />

      <section className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section, index) => (
          <article key={section.heading} className="card p-6">
            <p className="field-label">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-1 font-mono text-lg font-bold text-paper-ink">{section.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-paper-muted">{section.body}</p>
          </article>
        ))}
      </section>

      <p className="text-xs leading-relaxed text-plate-faint">
        Only public game data is used, fetched server-side and cached so repeat lookups do not hit
        the upstream APIs again. Nothing is inferred about accounts that have not played public,
        rated games.
      </p>
    </div>
  );
}
