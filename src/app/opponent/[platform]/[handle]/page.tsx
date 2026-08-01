import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DossierHeader } from "@/components/dossier/dossier-header";
import { EngineSpotCheck } from "@/components/dossier/engine-spot-check";
import { Openings } from "@/components/dossier/openings";
import { Overview } from "@/components/dossier/overview";
import { RadarProfile } from "@/components/dossier/radar-profile";
import { TimeControls } from "@/components/dossier/time-controls";
import { canonicalHandle, isPlatform, isValidHandle } from "@/lib/chess/handles";
import { ScoutError, scout } from "@/lib/scouting/service";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ platform: string; handle: string }> };

export async function generateMetadata({ params }: Params) {
  const { handle } = await params;
  return { title: `${decodeURIComponent(handle)} — Gambit File` };
}

export default async function OpponentPage({ params }: Params) {
  const { platform, handle: rawHandle } = await params;

  if (!isPlatform(platform)) notFound();

  const handle = canonicalHandle(decodeURIComponent(rawHandle));
  if (!isValidHandle(handle)) notFound();

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/opponent/${platform}/${handle}`);

  let result;
  try {
    // Called in-process rather than through /api/scout: the route handler
    // exists for the client-side refresh path, and a server component has no
    // reason to pay for an HTTP hop to its own origin.
    result = await scout(platform, handle);
  } catch (error) {
    if (error instanceof ScoutError && error.status === 404) notFound();

    const message = error instanceof Error ? error.message : "Could not build the dossier.";
    return (
      <div className="card mx-auto max-w-xl p-8">
        <p className="field-label">Scout failed</p>
        <h1 className="mt-2 font-mono text-xl font-bold text-paper-ink">
          Could not reach {handle}
        </h1>
        <p className="mt-3 text-sm text-paper-muted">{message}</p>
        <Link
          href="/scout"
          className="mt-6 inline-block bg-paper-ink px-4 py-2 font-mono text-[11px] font-bold tracking-[0.15em] text-ivory uppercase"
        >
          Try another player
        </Link>
      </div>
    );
  }

  const { report, opponent, cache } = result;

  const supabase = await createClient();
  const { data: savedRow } = await supabase
    .from("saved_opponents")
    .select("id")
    .eq("opponent_id", opponent.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <DossierHeader
        platform={opponent.platform}
        handle={opponent.handle}
        displayHandle={opponent.display_handle}
        title={opponent.title}
        country={opponent.country}
        ratings={report.ratings}
        gamesAnalyzed={report.window.gamesAnalyzed}
        lastSyncedAt={cache.lastSyncedAt}
        ttlHours={cache.ttlHours}
        syncError={opponent.sync_error}
        initiallySaved={Boolean(savedRow)}
      />

      {report.window.gamesAnalyzed === 0 ? (
        <div className="card p-8">
          <p className="field-label">Empty file</p>
          <p className="mt-2 text-sm text-paper-muted">
            No standard-chess games came back for this player. They may only play variants, or the
            account may be new.
          </p>
        </div>
      ) : (
        <>
          <Overview report={report} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section className="card p-6">
              <p className="field-label">Section 04</p>
              <h2 className="font-mono text-lg font-bold text-paper-ink">Player profile</h2>
              <p className="mt-2 text-sm text-paper-muted">
                Each axis is scaled 0–100 against a even-scoring baseline at 50. Hover a vertex for
                what drives it.
              </p>
              <div className="mt-4">
                <RadarProfile axes={report.radar} />
              </div>
            </section>

            <TimeControls lines={report.timeControls} ratings={report.ratings} />
          </div>

          <Openings repertoire={report.openings} />

          <EngineSpotCheck positions={report.criticalPositions} />
        </>
      )}
    </div>
  );
}
