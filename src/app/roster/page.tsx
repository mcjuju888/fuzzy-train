import Link from "next/link";
import { redirect } from "next/navigation";

import { RosterList, type RosterEntry } from "@/components/roster-list";
import { ScoutForm } from "@/components/scout-form";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roster — Gambit File" };

export default async function RosterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/roster");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_opponents")
    .select("id, label, notes, created_at, opponent:opponents(*)")
    .order("created_at", { ascending: false });

  // The join comes back untyped through the hand-written Database types;
  // the shape is guaranteed by the select above.
  const roster = (data ?? []) as unknown as RosterEntry[];

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="field-label">Case load</p>
        <h1 className="mt-1 font-mono text-2xl font-bold text-paper-ink">Your roster</h1>
        <p className="mt-2 text-sm text-paper-muted">
          Saved opponents keep their cached history between sessions, and the nightly sweep pulls
          any new games they play.
        </p>

        <div className="perforation my-5" />

        <ScoutForm compact />
      </section>

      {error ? (
        <div className="card border-l-2 border-loss p-6">
          <p className="text-sm text-loss">Could not load your roster: {error.message}</p>
        </div>
      ) : roster.length ? (
        <RosterList entries={roster} />
      ) : (
        <div className="card p-8 text-center">
          <p className="field-label">Empty</p>
          <p className="mt-2 text-sm text-paper-muted">
            Nothing saved yet. Scout a player, then use{" "}
            <span className="font-mono">Add to roster</span> on their dossier.
          </p>
          <Link
            href="/scout"
            className="mt-5 inline-block bg-paper-ink px-4 py-2 font-mono text-[11px] font-bold tracking-[0.15em] text-ivory uppercase"
          >
            Scout a player
          </Link>
        </div>
      )}
    </div>
  );
}
