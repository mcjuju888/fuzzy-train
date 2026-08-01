import Link from "next/link";

export function SiteHeader({ email }: { email: string | null }) {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-mono text-lg font-bold tracking-[0.2em] text-plate-ink uppercase">
            Gambit File
          </span>
          <span className="field-label-plate hidden sm:inline">opponent scouting</span>
        </Link>

        <nav className="flex items-center gap-4">
          {email ? (
            <>
              <Link
                href="/roster"
                className="font-mono text-xs tracking-widest text-plate-muted uppercase hover:text-plate-ink"
              >
                Roster
              </Link>
              <Link
                href="/scout"
                className="font-mono text-xs tracking-widest text-plate-muted uppercase hover:text-plate-ink"
              >
                New scout
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="font-mono text-xs tracking-widest text-plate-faint uppercase hover:text-plate-ink"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="font-mono text-xs tracking-widest text-plate-muted uppercase hover:text-plate-ink"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
