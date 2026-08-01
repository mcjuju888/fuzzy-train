import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/supabase/server";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gambit File — opponent scouting",
  description:
    "Build a scouting dossier on any Chess.com or Lichess player: repertoire, time-control profile, form, and exploitable tendencies.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-dvh flex-col">
          <SiteHeader email={user?.email ?? null} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
            <div className="perforation mb-4 opacity-20" />
            <p className="field-label-plate">
              Public game data via the Chess.com and Lichess APIs · cached server-side
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
