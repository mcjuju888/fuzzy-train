import { Chess } from "chess.js";

import type {
  ColorSplit,
  CriticalPosition,
  FormEntry,
  GameColor,
  GameResult,
  NormalizedGame,
  OpeningLine,
  OpeningRepertoire,
  PlayerIdentity,
  RadarAxis,
  RatingBand,
  RecordLine,
  ScoutingReport,
  TendencyNote,
  TendencySeverity,
  TimeClass,
  TimeControlLine,
} from "@/lib/chess/types";

export const REPORT_VERSION = 4;

/** Games shown in the form strip. */
const FORM_WINDOW = 12;

/** Below this many games a bucket is treated as anecdote, not evidence. */
const MIN_BUCKET = 6;

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const round = (value: number, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const pct = (value: number) => Math.round(value * 100);

/** Sample-size confidence, saturating around 40 games. */
const confidenceFor = (n: number) => round(clamp(n / 40, 0.15, 1), 2);

/**
 * Maps a 0–1 score onto a 0–100 radar axis, stretched so the interesting band
 * (roughly .35–.65 for most players) uses most of the chart's radius. A flat
 * linear mapping leaves every player looking like a hexagon at 50.
 */
const scoreToAxis = (score: number) => Math.round(clamp(50 + (score - 0.5) * 160, 4, 99));

// ---------------------------------------------------------------------------
// Tallies
// ---------------------------------------------------------------------------

export function tally(games: NormalizedGame[]): RecordLine {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const game of games) {
    if (game.result === "win") wins += 1;
    else if (game.result === "loss") losses += 1;
    else draws += 1;
  }

  const total = games.length;
  return {
    games: total,
    wins,
    losses,
    draws,
    score: total ? round((wins + draws / 2) / total) : 0,
    winRate: total ? round(wins / total) : 0,
  };
}

const emptyRecord = (): RecordLine => ({
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  score: 0,
  winRate: 0,
});

function groupBy<T, K extends string>(items: T[], key: (item: T) => K | null): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

function repertoireFor(games: NormalizedGame[], limit = 8): OpeningLine[] {
  const denominator = games.length || 1;
  const groups = groupBy(games, (game) => game.openingSlug);

  const lines: OpeningLine[] = [];
  for (const [slug, bucket] of groups) {
    const record = tally(bucket);
    const named = bucket.find((game) => game.openingName)?.openingName ?? slug;
    const withEco = bucket.find((game) => game.eco)?.eco ?? null;
    const lastPlayedAt = bucket.reduce<string | null>(
      (latest, game) => (!latest || game.playedAt > latest ? game.playedAt : latest),
      null,
    );

    lines.push({
      ...record,
      eco: withEco,
      name: named,
      slug,
      share: round(bucket.length / denominator),
      lastPlayedAt,
    });
  }

  lines.sort((a, b) => b.games - a.games || b.score - a.score);

  // Prefer lines with a real sample, but never return an empty repertoire just
  // because someone plays a wide, shallow range of openings.
  const meaningful = lines.filter((line) => line.games >= 2);
  return (meaningful.length ? meaningful : lines).slice(0, limit);
}

function buildRepertoire(games: NormalizedGame[]): OpeningRepertoire {
  return {
    white: repertoireFor(games.filter((game) => game.color === "white")),
    black: repertoireFor(games.filter((game) => game.color === "black")),
  };
}

// ---------------------------------------------------------------------------
// Time controls & ratings
// ---------------------------------------------------------------------------

const TIME_CLASS_ORDER: TimeClass[] = ["bullet", "blitz", "rapid", "classical", "daily", "unknown"];

const FAST_CLASSES = new Set<TimeClass>(["bullet", "blitz"]);
const SLOW_CLASSES = new Set<TimeClass>(["rapid", "classical", "daily"]);

function buildTimeControls(games: NormalizedGame[]): TimeControlLine[] {
  const denominator = games.length || 1;
  const groups = groupBy(games, (game) => game.timeClass);

  const lines: TimeControlLine[] = [];
  for (const [timeClass, bucket] of groups) {
    const moves = bucket.filter((game) => game.moveCount > 0);
    const rated = bucket.filter((game) => typeof game.playerRating === "number");

    lines.push({
      ...tally(bucket),
      timeClass,
      share: round(bucket.length / denominator),
      averageMoves: moves.length
        ? Math.round(moves.reduce((sum, game) => sum + game.moveCount, 0) / moves.length)
        : 0,
      averageRating: rated.length
        ? Math.round(rated.reduce((sum, game) => sum + (game.playerRating ?? 0), 0) / rated.length)
        : null,
    });
  }

  lines.sort(
    (a, b) => TIME_CLASS_ORDER.indexOf(a.timeClass) - TIME_CLASS_ORDER.indexOf(b.timeClass),
  );
  return lines;
}

function buildRatingBands(
  games: NormalizedGame[],
  identity: PlayerIdentity,
): RatingBand[] {
  const groups = groupBy(
    games.filter((game) => typeof game.playerRating === "number"),
    (game) => game.timeClass,
  );

  const bands: RatingBand[] = [];
  for (const [timeClass, bucket] of groups) {
    const ratings = bucket.map((game) => game.playerRating as number);
    // Games arrive newest-first, so the head is the latest known rating.
    // The platform profile is authoritative when it has a figure.
    const observedCurrent = ratings[0] ?? null;
    bands.push({
      timeClass,
      current: identity.ratings[timeClass] ?? observedCurrent,
      peak: identity.ratings[`${timeClass}_peak`] ?? Math.max(...ratings),
      low: Math.min(...ratings),
    });
  }

  bands.sort(
    (a, b) => TIME_CLASS_ORDER.indexOf(a.timeClass) - TIME_CLASS_ORDER.indexOf(b.timeClass),
  );
  return bands;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function buildForm(games: NormalizedGame[]): FormEntry[] {
  return games.slice(0, FORM_WINDOW).map((game) => ({
    gameId: game.gameId,
    result: game.result,
    color: game.color,
    playedAt: game.playedAt,
    timeClass: game.timeClass,
    opponent: game.rivalHandle,
    opening: game.openingName,
    url: game.url,
  }));
}

function buildStreaks(games: NormalizedGame[]) {
  // `games` is newest-first; streak lengths are direction-independent, but the
  // *current* streak has to be read from the newest end.
  let longestWin = 0;
  let longestLoss = 0;
  let runWin = 0;
  let runLoss = 0;

  for (let i = games.length - 1; i >= 0; i -= 1) {
    const { result } = games[i];
    if (result === "win") {
      runWin += 1;
      runLoss = 0;
    } else if (result === "loss") {
      runLoss += 1;
      runWin = 0;
    } else {
      runWin = 0;
      runLoss = 0;
    }
    longestWin = Math.max(longestWin, runWin);
    longestLoss = Math.max(longestLoss, runLoss);
  }

  let currentStreak: { result: GameResult; length: number } | null = null;
  if (games.length) {
    const head = games[0].result;
    let length = 0;
    while (length < games.length && games[length].result === head) length += 1;
    currentStreak = { result: head, length };
  }

  return { longestWinStreak: longestWin, longestLossStreak: longestLoss, currentStreak };
}

// ---------------------------------------------------------------------------
// Pace / termination shape
// ---------------------------------------------------------------------------

function buildPace(games: NormalizedGame[]) {
  const withMoves = games.filter((game) => game.moveCount > 0);
  const counts = withMoves.map((game) => game.moveCount).sort((a, b) => a - b);

  const average = counts.length
    ? Math.round(counts.reduce((sum, n) => sum + n, 0) / counts.length)
    : 0;
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;

  const denominator = withMoves.length || 1;
  const losses = games.filter((game) => game.result === "loss");
  const lostOnTime = losses.filter((game) => game.termination === "timeout").length;

  return {
    averageMoves: average,
    medianMoves: median,
    shortGameShare: round(withMoves.filter((g) => g.moveCount <= 25).length / denominator),
    longGameShare: round(withMoves.filter((g) => g.moveCount >= 50).length / denominator),
    decisiveShare: games.length
      ? round(games.filter((g) => g.result !== "draw").length / games.length)
      : 0,
    /** Share of their *losses* that ran out of clock, not of all games. */
    timeoutShare: losses.length ? round(lostOnTime / losses.length) : 0,
  };
}

// ---------------------------------------------------------------------------
// Tendency notes
// ---------------------------------------------------------------------------

interface NoteDraft extends TendencyNote {
  /** Sorting weight — how much this should matter to a player preparing. */
  weight: number;
}

function note(
  id: string,
  title: string,
  detail: string,
  severity: TendencySeverity,
  sample: number,
  evidence: string,
  weight: number,
): NoteDraft {
  return {
    id,
    title,
    detail,
    severity,
    confidence: confidenceFor(sample),
    evidence,
    weight: weight * confidenceFor(sample),
  };
}

function buildTendencies(
  games: NormalizedGame[],
  overall: RecordLine,
  byColor: ColorSplit,
  openings: OpeningRepertoire,
  timeControls: TimeControlLine[],
  pace: ReturnType<typeof buildPace>,
  formScore: number,
): TendencyNote[] {
  const drafts: NoteDraft[] = [];

  // --- colour imbalance ---------------------------------------------------
  if (byColor.white.games >= 8 && byColor.black.games >= 8) {
    const delta = byColor.white.score - byColor.black.score;
    if (Math.abs(delta) >= 0.07) {
      const weakColor: GameColor = delta > 0 ? "black" : "white";
      const weak = weakColor === "white" ? byColor.white : byColor.black;
      const strong = weakColor === "white" ? byColor.black : byColor.white;
      drafts.push(
        note(
          "weak-color",
          `Softer with ${weakColor}`,
          `Scores ${pct(weak.score)}% with ${weakColor} against ${pct(strong.score)}% with ${
            weakColor === "white" ? "black" : "white"
          }. Steer the pairing toward giving them ${weakColor} where you can.`,
          "weakness",
          weak.games,
          `${weak.wins}W ${weak.losses}L ${weak.draws}D as ${weakColor} over ${weak.games} games`,
          Math.abs(delta) * 10,
        ),
      );
    }
  }

  // --- opening outliers ---------------------------------------------------
  for (const color of ["white", "black"] as const) {
    const lines = openings[color].filter((line) => line.games >= MIN_BUCKET);
    if (!lines.length) continue;

    const worst = [...lines].sort((a, b) => a.score - b.score)[0];
    if (worst && worst.score <= overall.score - 0.1) {
      drafts.push(
        note(
          `weak-opening-${color}`,
          `Leaks points in the ${worst.name}`,
          `As ${color} they score just ${pct(worst.score)}% in the ${worst.name}, against ${pct(
            overall.score,
          )}% overall — and it is ${pct(worst.share)}% of their ${color} games.`,
          "weakness",
          worst.games,
          `${worst.wins}W ${worst.losses}L ${worst.draws}D across ${worst.games} games${
            worst.eco ? ` (${worst.eco})` : ""
          }`,
          (overall.score - worst.score) * 8 + worst.share * 2,
        ),
      );
    }

    const best = [...lines].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= overall.score + 0.12 && best.slug !== worst?.slug) {
      drafts.push(
        note(
          `strong-opening-${color}`,
          `Well prepared in the ${best.name}`,
          `Scores ${pct(best.score)}% as ${color} in the ${best.name}. Sidestepping it early is cheaper than outplaying them in it.`,
          "strength",
          best.games,
          `${best.wins}W ${best.losses}L ${best.draws}D across ${best.games} games${
            best.eco ? ` (${best.eco})` : ""
          }`,
          (best.score - overall.score) * 7,
        ),
      );
    }
  }

  // --- speed profile ------------------------------------------------------
  const fast = timeControls.filter((line) => FAST_CLASSES.has(line.timeClass));
  const slow = timeControls.filter((line) => SLOW_CLASSES.has(line.timeClass));
  const fastGames = fast.reduce((sum, line) => sum + line.games, 0);
  const slowGames = slow.reduce((sum, line) => sum + line.games, 0);

  if (fastGames >= 8 && slowGames >= 8) {
    const fastScore =
      fast.reduce((sum, line) => sum + line.score * line.games, 0) / (fastGames || 1);
    const slowScore =
      slow.reduce((sum, line) => sum + line.score * line.games, 0) / (slowGames || 1);
    const delta = fastScore - slowScore;

    if (delta <= -0.08) {
      drafts.push(
        note(
          "fast-weakness",
          "Falls apart at fast time controls",
          `${pct(fastScore)}% in bullet and blitz versus ${pct(slowScore)}% at slower controls. Short games favour you.`,
          "weakness",
          fastGames,
          `${fastGames} fast games vs ${slowGames} slow games`,
          Math.abs(delta) * 9,
        ),
      );
    } else if (delta >= 0.08) {
      drafts.push(
        note(
          "fast-strength",
          "Sharpest with little time",
          `${pct(fastScore)}% in bullet and blitz versus ${pct(slowScore)}% at slower controls. Do not let this become a scramble.`,
          "strength",
          fastGames,
          `${fastGames} fast games vs ${slowGames} slow games`,
          delta * 9,
        ),
      );
    }
  }

  const bullet = timeControls.find((line) => line.timeClass === "bullet");
  if (bullet && bullet.games >= 15 && bullet.score <= overall.score - 0.1) {
    drafts.push(
      note(
        "bullet-drop",
        "Bullet is their worst pool",
        `${pct(bullet.score)}% across ${bullet.games} bullet games, ${pct(
          overall.score - bullet.score,
        )} points below their overall rate.`,
        "weakness",
        bullet.games,
        `${bullet.wins}W ${bullet.losses}L ${bullet.draws}D in bullet`,
        (overall.score - bullet.score) * 6,
      ),
    );
  }

  // --- game length --------------------------------------------------------
  if (pace.averageMoves > 0) {
    if (pace.longGameShare >= 0.32) {
      drafts.push(
        note(
          "grinder",
          "Grinder — happy in long games",
          `${pct(pace.longGameShare)}% of their games pass 50 moves, averaging ${pace.averageMoves}. They will not crack from boredom; look for a concrete edge instead.`,
          "strength",
          games.length,
          `median ${pace.medianMoves} moves, mean ${pace.averageMoves}`,
          1.6,
        ),
      );
    } else if (pace.shortGameShare >= 0.42) {
      drafts.push(
        note(
          "quick-kills",
          "Short-game player",
          `${pct(pace.shortGameShare)}% of their games end inside 25 moves (mean ${pace.averageMoves}). Expect early aggression, and value survival past the opening.`,
          "neutral",
          games.length,
          `median ${pace.medianMoves} moves, mean ${pace.averageMoves}`,
          1.5,
        ),
      );
    }
  }

  // --- clock --------------------------------------------------------------
  if (pace.timeoutShare >= 0.22 && overall.losses >= 6) {
    drafts.push(
      note(
        "flag-prone",
        "Loses on the clock",
        `${pct(pace.timeoutShare)}% of their losses are flags rather than positions. Complicating late is worth more than it looks.`,
        "weakness",
        overall.losses,
        `${Math.round(pace.timeoutShare * overall.losses)} of ${overall.losses} losses on time`,
        pace.timeoutShare * 6,
      ),
    );
  }

  // --- decisiveness -------------------------------------------------------
  if (overall.games >= 25) {
    const drawRate = overall.draws / overall.games;
    if (drawRate >= 0.24) {
      drafts.push(
        note(
          "drawish",
          "Draws a lot",
          `${pct(drawRate)}% of their games are drawn. If you need a win, the burden of imbalance is on you.`,
          "neutral",
          overall.games,
          `${overall.draws} draws in ${overall.games} games`,
          1.4,
        ),
      );
    } else if (drawRate <= 0.06 && overall.games >= 40) {
      drafts.push(
        note(
          "no-draws",
          "Plays for a result",
          `Only ${pct(drawRate)}% of their games are drawn — they keep pushing rather than shaking hands.`,
          "neutral",
          overall.games,
          `${overall.draws} draws in ${overall.games} games`,
          1.2,
        ),
      );
    }
  }

  // --- resignation habits -------------------------------------------------
  const losses = games.filter((game) => game.result === "loss");
  if (losses.length >= 8) {
    const mated = losses.filter((game) => game.termination === "checkmate").length;
    const matedShare = mated / losses.length;
    if (matedShare >= 0.3) {
      drafts.push(
        note(
          "plays-to-mate",
          "Never resigns",
          `${pct(matedShare)}% of their losses go all the way to mate. Convert cleanly and expect to be made to prove it.`,
          "neutral",
          losses.length,
          `${mated} of ${losses.length} losses ended in checkmate`,
          1.3,
        ),
      );
    }
  }

  // --- recent form --------------------------------------------------------
  const formDelta = formScore - overall.score;
  if (games.length >= FORM_WINDOW && Math.abs(formDelta) >= 0.1) {
    const hot = formDelta > 0;
    drafts.push(
      note(
        "form-swing",
        hot ? "In form right now" : "Out of form right now",
        `Their last ${Math.min(FORM_WINDOW, games.length)} games score ${pct(formScore)}% against a ${pct(
          overall.score,
        )}% baseline.`,
        hot ? "strength" : "weakness",
        FORM_WINDOW,
        `${pct(Math.abs(formDelta))} point swing over the recent window`,
        Math.abs(formDelta) * 5,
      ),
    );
  }

  // --- rating trajectory --------------------------------------------------
  const ratedGames = games.filter((game) => typeof game.playerRating === "number");
  if (ratedGames.length >= 40) {
    const recent = ratedGames.slice(0, 20);
    const prior = ratedGames.slice(20, 40);
    const mean = (list: NormalizedGame[]) =>
      list.reduce((sum, game) => sum + (game.playerRating ?? 0), 0) / list.length;
    const drift = Math.round(mean(recent) - mean(prior));

    if (Math.abs(drift) >= 25) {
      drafts.push(
        note(
          "rating-drift",
          drift > 0 ? "Rating is climbing" : "Rating is sliding",
          `Roughly ${Math.abs(drift)} points ${drift > 0 ? "up" : "down"} across their last 20 games versus the 20 before. Their published rating ${
            drift > 0 ? "understates" : "overstates"
          } current strength.`,
          drift > 0 ? "strength" : "weakness",
          40,
          `mean ${Math.round(mean(recent))} recent vs ${Math.round(mean(prior))} prior`,
          Math.min(Math.abs(drift) / 25, 3),
        ),
      );
    }
  }

  return drafts
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 7)
    .map(({ weight: _weight, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Radar profile
// ---------------------------------------------------------------------------

function buildRadar(
  games: NormalizedGame[],
  overall: RecordLine,
  byColor: ColorSplit,
  openings: OpeningRepertoire,
  timeControls: TimeControlLine[],
  pace: ReturnType<typeof buildPace>,
): RadarAxis[] {
  // Opening prep: how they do in the lines they actually choose to play.
  const mainSlugs = new Set<string>();
  for (const color of ["white", "black"] as const) {
    for (const line of openings[color].slice(0, 3)) mainSlugs.add(`${color}:${line.slug}`);
  }
  const mainLineGames = games.filter(
    (game) => game.openingSlug && mainSlugs.has(`${game.color}:${game.openingSlug}`),
  );
  const prepScore = mainLineGames.length >= MIN_BUCKET ? tally(mainLineGames).score : overall.score;

  // Aggression: decisive results, wins forced rather than conceded, and a
  // taste for finishing early.
  const wins = games.filter((game) => game.result === "win");
  const matingWins = wins.filter((game) => game.termination === "checkmate").length;
  const quickWins = wins.filter((game) => game.moveCount > 0 && game.moveCount <= 25).length;
  const aggression = wins.length
    ? 0.45 * pace.decisiveShare + 0.35 * (matingWins / wins.length) + 0.2 * (quickWins / wins.length)
    : pace.decisiveShare * 0.45;

  // Endurance: results once the game goes long.
  const longGames = games.filter((game) => game.moveCount >= 40);
  const endurance = longGames.length >= MIN_BUCKET ? tally(longGames).score : overall.score;

  // Clock control: not flagging, plus how they hold up when time is short.
  const fastLines = timeControls.filter((line) => FAST_CLASSES.has(line.timeClass));
  const fastGames = fastLines.reduce((sum, line) => sum + line.games, 0);
  const fastScore = fastGames
    ? fastLines.reduce((sum, line) => sum + line.score * line.games, 0) / fastGames
    : overall.score;
  const clock = 0.6 * (1 - pace.timeoutShare) + 0.4 * fastScore;

  // Consistency: how flat their performance is across colours and pools. A
  // wide spread is the thing a scout most wants to find.
  // The threshold scales with the sample: a 6-game pool inside a 300-game
  // history is a rounding error, and letting it set the spread would report
  // every active player as wildly inconsistent.
  const minBucket = Math.max(8, Math.round(games.length * 0.08));
  const buckets: number[] = [];
  if (byColor.white.games >= minBucket) buckets.push(byColor.white.score);
  if (byColor.black.games >= minBucket) buckets.push(byColor.black.score);
  for (const line of timeControls) if (line.games >= minBucket) buckets.push(line.score);
  const spread = buckets.length >= 2 ? Math.max(...buckets) - Math.min(...buckets) : 0.15;
  const consistency = 1 - clamp(spread, 0, 0.5) / 0.5;

  // Versatility: breadth of the repertoire they will actually enter.
  const distinctOpenings = new Set(
    games.filter((game) => game.openingSlug).map((game) => `${game.color}:${game.openingSlug}`),
  ).size;
  const versatility = clamp(distinctOpenings / 16, 0, 1);

  return [
    {
      key: "prep",
      label: "Opening Prep",
      value: scoreToAxis(prepScore),
      hint: `${pct(prepScore)}% in their most-played lines`,
    },
    {
      key: "aggression",
      label: "Aggression",
      value: Math.round(clamp(aggression, 0, 1) * 100),
      hint: `${pct(pace.decisiveShare)}% decisive, ${wins.length ? pct(matingWins / wins.length) : 0}% of wins by mate`,
    },
    {
      key: "endurance",
      label: "Endurance",
      value: scoreToAxis(endurance),
      hint: `${pct(endurance)}% in games past 40 moves`,
    },
    {
      key: "clock",
      label: "Clock Control",
      value: Math.round(clamp(clock, 0, 1) * 100),
      hint: `${pct(pace.timeoutShare)}% of losses on time`,
    },
    {
      key: "consistency",
      label: "Consistency",
      value: Math.round(clamp(consistency, 0, 1) * 100),
      hint: `${pct(spread)} point spread across colours and pools`,
    },
    {
      key: "versatility",
      label: "Versatility",
      value: Math.round(versatility * 100),
      hint: `${distinctOpenings} distinct opening lines played`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Critical positions (input to the optional engine spot-check)
// ---------------------------------------------------------------------------

/** Ply depths at which repeated lines are looked for. */
const PROBE_DEPTHS = [8, 12];

interface ReplayedLine {
  fen: string | null;
  fenBefore: string | null;
  theirMove: string | null;
}

const EMPTY_REPLAY: ReplayedLine = {
  fen: null,
  fenBefore: null,
  theirMove: null,
};

/**
 * Replays a SAN line, capturing the position immediately before the last move
 * the scouted player made, plus that move. The engine spot-check compares
 * their move against the best move *from that same position* — evaluating the
 * position after their move instead would compare two searches a ply apart,
 * which is biased and reports drops that are not real.
 */
function replayLine(san: string[], color: GameColor): ReplayedLine {
  // White moves on even plies (0-based).
  const theirParity = color === "white" ? 0 : 1;

  let lastTheirPly = -1;
  for (let i = san.length - 1; i >= 0; i -= 1) {
    if (i % 2 === theirParity) {
      lastTheirPly = i;
      break;
    }
  }

  const board = new Chess();
  let fenBefore: string | null = null;

  for (let i = 0; i < san.length; i += 1) {
    if (i === lastTheirPly) fenBefore = board.fen();
    try {
      board.move(san[i]);
    } catch {
      // A malformed or truncated SAN prefix just means no engine position.
      return EMPTY_REPLAY;
    }
  }

  return {
    fen: board.fen(),
    fenBefore,
    theirMove: lastTheirPly >= 0 ? san[lastTheirPly] : null,
  };
}

function buildCriticalPositions(
  games: NormalizedGame[],
  overall: RecordLine,
): CriticalPosition[] {
  const candidates: CriticalPosition[] = [];

  for (const depth of PROBE_DEPTHS) {
    const groups = new Map<string, { color: GameColor; line: string[]; games: NormalizedGame[] }>();

    for (const game of games) {
      if (!game.movesSan) continue;
      const san = game.movesSan.split(" ").filter(Boolean);
      if (san.length < depth) continue;

      const line = san.slice(0, depth);
      const key = `${game.color}|${line.join(" ")}`;
      const existing = groups.get(key);
      if (existing) existing.games.push(game);
      else groups.set(key, { color: game.color, line, games: [game] });
    }

    for (const [key, group] of groups) {
      if (group.games.length < 3) continue;
      const record = tally(group.games);
      const scoreDelta = round(record.score - overall.score);
      // Only positions where they measurably underperform are worth engine time.
      if (scoreDelta > -0.12) continue;

      candidates.push({
        id: `${depth}:${key}`,
        color: group.color,
        eco: group.games.find((game) => game.eco)?.eco ?? null,
        openingName: group.games.find((game) => game.openingName)?.openingName ?? "Unclassified",
        line: group.line,
        ...replayLine(group.line, group.color),
        occurrences: group.games.length,
        record,
        scoreDelta,
      });
    }
  }

  // Prefer the deepest description of the same problem: drop any shallow line
  // that is merely a prefix of a deeper candidate we already have.
  const byImpact = candidates.sort(
    (a, b) => b.occurrences * -b.scoreDelta - a.occurrences * -a.scoreDelta,
  );

  const kept: CriticalPosition[] = [];
  for (const candidate of byImpact) {
    const redundant = kept.some((existing) => {
      if (existing.color !== candidate.color) return false;
      const [shorter, longer] =
        existing.line.length <= candidate.line.length
          ? [existing.line, candidate.line]
          : [candidate.line, existing.line];
      return shorter.every((move, index) => longer[index] === move);
    });
    if (!redundant) kept.push(candidate);
    if (kept.length >= 4) break;
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildReport(
  identity: PlayerIdentity,
  rawGames: NormalizedGame[],
): ScoutingReport {
  // Everything downstream assumes newest-first ordering.
  const games = [...rawGames].sort((a, b) => (a.playedAt < b.playedAt ? 1 : -1));

  const overall = tally(games);
  const byColor: ColorSplit = {
    white: tally(games.filter((game) => game.color === "white")),
    black: tally(games.filter((game) => game.color === "black")),
  };
  const rated = tally(games.filter((game) => game.rated));
  const openings = buildRepertoire(games);
  const timeControls = buildTimeControls(games);
  const pace = buildPace(games);
  const form = buildForm(games);
  const streaks = buildStreaks(games);

  const formGames = games.slice(0, FORM_WINDOW);
  const formScore = formGames.length ? tally(formGames).score : 0;
  const formDelta = formScore - overall.score;

  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    identity,
    window: {
      from: games.length ? games[games.length - 1].playedAt : null,
      to: games.length ? games[0].playedAt : null,
      gamesAnalyzed: games.length,
    },
    overall,
    byColor,
    rated: rated.games ? rated : emptyRecord(),
    openings,
    timeControls,
    ratings: buildRatingBands(games, identity),
    form,
    formSummary: {
      lastN: formGames.length,
      score: formScore,
      trend: formDelta >= 0.08 ? "hot" : formDelta <= -0.08 ? "cold" : "steady",
      ...streaks,
    },
    tendencies: buildTendencies(
      games,
      overall,
      byColor,
      openings,
      timeControls,
      pace,
      formScore,
    ),
    radar: buildRadar(games, overall, byColor, openings, timeControls, pace),
    criticalPositions: buildCriticalPositions(games, overall),
    pace,
  };
}
