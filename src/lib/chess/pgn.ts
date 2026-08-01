/**
 * Minimal PGN reader.
 *
 * Only what the report needs: the tag pairs and the SAN move list. Chess.com
 * ships clock annotations and comments inline, so the movetext is stripped of
 * comments, variations, NAGs, and move numbers before tokenizing.
 */

export interface ParsedPgn {
  headers: Record<string, string>;
  san: string[];
}

const TAG_LINE = /^\[(\w+)\s+"([^"]*)"\]\s*$/;
const RESULT_TOKEN = /^(1-0|0-1|1\/2-1\/2|\*)$/;

export function parsePgn(pgn: string | null | undefined): ParsedPgn {
  const headers: Record<string, string> = {};
  if (!pgn) return { headers, san: [] };

  const lines = pgn.split(/\r?\n/);
  const movetextLines: string[] = [];

  for (const line of lines) {
    const tag = TAG_LINE.exec(line);
    if (tag) {
      headers[tag[1]] = tag[2];
    } else {
      movetextLines.push(line);
    }
  }

  return { headers, san: parseMovetext(movetextLines.join(" ")) };
}

export function parseMovetext(movetext: string): string[] {
  if (!movetext.trim()) return [];

  const cleaned = movetext
    .replace(/\{[^}]*\}/g, " ") // { [%clk 0:02:58] } comments
    .replace(/;[^\n]*/g, " ") // rest-of-line comments
    .replace(/\([^()]*\)/g, " ") // one level of variation is all Chess.com emits
    .replace(/\$\d+/g, " ") // NAGs
    .replace(/\d+\.(\.\.)?/g, " ") // move numbers, incl. black continuations
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  return cleaned
    .split(" ")
    .filter((token) => token.length > 0 && !RESULT_TOKEN.test(token));
}

/** Full moves, i.e. plies rounded up. */
export function moveCountFromSan(san: string[]): number {
  return Math.ceil(san.length / 2);
}

/**
 * Truncate to the opening phase. Enough to rebuild the position for an engine
 * spot-check without storing full game history for every cached game.
 */
export function openingPrefix(san: string[], plies = 30): string | null {
  if (!san.length) return null;
  return san.slice(0, plies).join(" ");
}
