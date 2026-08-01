# Gambit File

Opponent scouting for competitive chess players. Give it a Chess.com or Lichess
username and it builds a dossier: record and recent form, opening repertoire
split by colour, time-control profile, a six-axis player radar, plain-language
tendency notes with the evidence attached, and an optional in-browser Stockfish
check on the lines they repeat and score badly from.

Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth) · Tailwind v4 ·
deployed on Vercel.

## How it fits together

```
src/lib/chess/       fetching, normalization, and the report engine
  http.ts            per-host throttling, retry, NDJSON streaming
  chesscom.ts        Chess.com archive walker  -> NormalizedGame[]
  lichess.ts         Lichess NDJSON export     -> NormalizedGame[]
  openings.ts        collapses both platforms' naming onto one family key
  report.ts          NormalizedGame[] -> ScoutingReport (pure, no I/O)
src/lib/scouting/    cache policy, sync orchestration, TTL
src/lib/engine/      browser-side Stockfish wrapper
src/app/api/         scout, roster CRUD, on-demand refresh, cron sweep
supabase/migrations/ schema, RLS, and the stale-opponent helper
```

All upstream fetching happens server-side. Nothing in the browser talks to
Chess.com or Lichess, which sidesteps CORS and puts rate limiting and caching
somewhere they can actually be enforced.

### Data model

`opponents` is a **global** registry keyed on `(platform, handle)` and owns the
cache; `saved_opponents` is a per-user join carrying private notes. Two users
scouting the same grandmaster share one set of cached games and one report,
which cuts upstream calls sharply.

`games` stores one normalized row per game **from the scouted player's point of
view** — `color` is the colour they had, `result` is their outcome. Fixing the
perspective at the adapter boundary keeps every aggregate downstream free of
per-row flipping. `reports` holds the computed dossier as JSON.

Keeping raw games as well as the report snapshot is what makes analysis changes
cheap: bump `REPORT_VERSION` in `report.ts` and the next read rebuilds every
dossier from cached games with no upstream refetch.

### Incremental refresh

Each opponent tracks `last_game_at`. A refresh asks the platform only for games
after that mark — a month page from Chess.com, a `since=` query on Lichess —
rather than re-walking full history. Three ways in:

- opening a dossier whose cache is older than `SCOUT_CACHE_TTL_HOURS`
- the **Refresh** button (`POST /api/refresh`; pass `full: true` to re-walk)
- the nightly Vercel Cron sweep (`GET /api/cron/refresh`), which only touches
  opponents at least one user has actually saved

Concurrent syncs are guarded by a `sync_status` lock with a 3-minute staleness
timeout, and a failed refresh never blanks an existing dossier.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the Supabase values
npm run dev
```

Apply `supabase/migrations/0001_init.sql` to your project (SQL editor, or
`supabase db push` if the project is linked). Then set the magic-link redirect
allow-list in **Authentication → URL Configuration** to include
`http://localhost:3000/auth/callback` and your deployed equivalent.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser-safe key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; every shared-cache write |
| `NEXT_PUBLIC_SITE_URL` | no | Magic-link origin; falls back to `VERCEL_URL` |
| `SCOUT_CACHE_TTL_HOURS` | no | Freshness window, default 24 |
| `SCOUT_MAX_GAMES` | no | Per-platform sync ceiling, default 600 |
| `CRON_SECRET` | no | Guards the cron route; required for it to run |
| `CHESS_USER_AGENT` | no | Chess.com blocks requests without a real one |
| `LICHESS_TOKEN` | no | Raises the Lichess rate-limit ceiling |

### Checks

```bash
npm run typecheck
npm run check:openings              # cross-platform opening-name agreement
npm run smoke -- chesscom hikaru    # live fetch -> report, no database
npm run smoke -- lichess DrNykterstein 150
```

The two script commands need the `react-server` condition when run directly
with `tsx` (`npx tsx --conditions=react-server …`) because the fetchers import
`server-only`.

## Design notes

**Win/draw/loss is coloured blue → grey → red, not green → red.** Win/loss is a
polarity encoding, and green vs red is the classic colourblind failure: the two
measure OKLab ΔE 4.1 under deuteranopia, well below the ΔE 8 target. Blue vs red
measures 23.8 and clears every gate against the ivory card surface. Every result
chip also carries its letter, so colour is never the only channel.

The cards are ivory in every theme — the design commits to one surface, which is
also the surface the palette was validated against.

**Opening families, not variations.** Chess.com sends one flat slug
(`Nimzowitsch-Larsen-Attack-Modern-Variation`) with no marker for where the
family ends; Lichess sends `Family: Variation`. `openings.ts` reduces both to a
shared family slug via a root-noun rule, a curated prefix list for names like
"Ruy Lopez" that have no root noun, and an alias table for openings the two
platforms simply name differently. `npm run check:openings` asserts they agree.

**Engine spot-check is optional.** `stockfish.js` is an optional dependency
vendored into `public/engine/` at install time and gitignored. If the assets are
missing the feature hides itself and the aggregate report is unaffected. The
report stores the positions bracketing the last move *they* played in a repeated
line, so the engine can attribute a drop in evaluation to one concrete move
rather than just scoring the final position.

## Limitations

- Standard chess only; variants and games against engines are filtered out.
- Cached games are capped by `SCOUT_MAX_GAMES` per platform, so the report
  describes a recent window rather than a career.
- Only the first 30 plies of each game are stored, which is what the repeated-
  position detection needs and keeps rows small.
- The vendored engine is Stockfish 10 — plenty for flagging opening
  inaccuracies, not a modern NNUE analysis engine.
