/**
 * Domain types shared by the fetchers, the report engine, and the UI.
 *
 * Everything downstream of `NormalizedGame` is platform-agnostic: Chess.com
 * and Lichess differ wildly in payload shape, and that difference is confined
 * to the two adapter modules.
 */

export type Platform = "chesscom" | "lichess";
export type GameColor = "white" | "black";
export type GameResult = "win" | "loss" | "draw";

/** Buckets both platforms can be mapped onto. */
export type TimeClass = "bullet" | "blitz" | "rapid" | "classical" | "daily" | "unknown";

/**
 * A single game as seen *from the scouted player's side*: `color` is the
 * colour they had, `result` is their outcome. Fixing the perspective at the
 * adapter boundary keeps every aggregate downstream trivially correct.
 */
export interface NormalizedGame {
  platform: Platform;
  gameId: string;
  playedAt: string;
  color: GameColor;
  result: GameResult;
  playerRating: number | null;
  rivalRating: number | null;
  rivalHandle: string | null;
  timeClass: TimeClass;
  timeControl: string | null;
  rated: boolean;
  eco: string | null;
  openingName: string | null;
  openingSlug: string | null;
  moveCount: number;
  termination: string | null;
  url: string | null;
  movesSan: string | null;
}

export interface PlayerIdentity {
  platform: Platform;
  handle: string;
  displayHandle: string;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  ratings: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Report shapes
// ---------------------------------------------------------------------------

export interface RecordLine {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Points per game, 0–1. Draws count a half. */
  score: number;
  winRate: number;
}

export interface ColorSplit {
  white: RecordLine;
  black: RecordLine;
}

export interface OpeningLine extends RecordLine {
  eco: string | null;
  name: string;
  slug: string;
  /** Share of that colour's games, 0–1. */
  share: number;
  lastPlayedAt: string | null;
}

export interface OpeningRepertoire {
  white: OpeningLine[];
  black: OpeningLine[];
}

export interface TimeControlLine extends RecordLine {
  timeClass: TimeClass;
  share: number;
  averageMoves: number;
  averageRating: number | null;
}

export interface FormEntry {
  gameId: string;
  result: GameResult;
  color: GameColor;
  playedAt: string;
  timeClass: TimeClass;
  opponent: string | null;
  opening: string | null;
  url: string | null;
}

export type TendencySeverity = "strength" | "weakness" | "neutral";

export interface TendencyNote {
  id: string;
  title: string;
  detail: string;
  severity: TendencySeverity;
  /** 0–1 confidence, driven mostly by sample size. */
  confidence: number;
  evidence: string;
}

export interface RadarAxis {
  key: string;
  label: string;
  /** 0–100, normalized so the shape is comparable across players. */
  value: number;
  hint: string;
}

export interface RatingBand {
  timeClass: TimeClass;
  current: number | null;
  peak: number | null;
  low: number | null;
}

/**
 * A position the opponent reached repeatedly and scored badly from. Surfaced
 * for the optional engine spot-check; the FEN fields are null when the
 * position could not be replayed from the stored SAN prefix.
 *
 * `fenBefore` plus `theirMove` let the engine compare their choice against the
 * best move *in the same position*, which is the only way to attribute a drop
 * in evaluation to one concrete move.
 */
export interface CriticalPosition {
  id: string;
  color: GameColor;
  eco: string | null;
  openingName: string;
  /** SAN moves leading to the position. */
  line: string[];
  /** Position after the full line. */
  fen: string | null;
  /** Position immediately before their last move in the line. */
  fenBefore: string | null;
  /** Their last move in the line, in SAN. */
  theirMove: string | null;
  occurrences: number;
  record: RecordLine;
  /** Score across the whole sample minus score from this position. */
  scoreDelta: number;
}

export interface ScoutingReport {
  version: number;
  generatedAt: string;
  identity: PlayerIdentity;
  window: {
    from: string | null;
    to: string | null;
    gamesAnalyzed: number;
  };
  overall: RecordLine;
  byColor: ColorSplit;
  rated: RecordLine;
  openings: OpeningRepertoire;
  timeControls: TimeControlLine[];
  ratings: RatingBand[];
  form: FormEntry[];
  formSummary: {
    lastN: number;
    score: number;
    trend: "hot" | "cold" | "steady";
    longestWinStreak: number;
    longestLossStreak: number;
    currentStreak: { result: GameResult; length: number } | null;
  };
  tendencies: TendencyNote[];
  radar: RadarAxis[];
  criticalPositions: CriticalPosition[];
  pace: {
    averageMoves: number;
    medianMoves: number;
    shortGameShare: number;
    longGameShare: number;
    decisiveShare: number;
    timeoutShare: number;
  };
}
