/**
 * Checks that Chess.com's flat ECOUrl slugs and Lichess's structured names
 * collapse onto the same family key. Run with: npm run check:openings
 */

import { familyOf, openingFromEcoUrl, parseOpening } from "../src/lib/chess/openings";

/** [chess.com ECOUrl tail, lichess name, expected family slug] */
const CASES: [string, string, string][] = [
  [
    "Sicilian-Defense-Najdorf-Variation-6.Bg5",
    "Sicilian Defense: Najdorf Variation, English Attack",
    "sicilian-defense",
  ],
  ["Ruy-Lopez-Berlin-Defense", "Ruy Lopez: Berlin Defense", "ruy-lopez"],
  ["Ruy-Lopez-Morphy-Defense-Closed", "Ruy Lopez: Morphy Defense", "ruy-lopez"],
  [
    "Nimzowitsch-Larsen-Attack-Modern-Variation",
    "Nimzo-Larsen Attack: Modern Variation",
    "nimzowitsch-larsen-attack",
  ],
  ["Nimzowitsch-Larsen-Attack-1...g6", "Nimzo-Larsen Attack", "nimzowitsch-larsen-attack"],
  [
    "English-Opening-Kings-English-Variation",
    "English Opening: King's English Variation",
    "english-opening",
  ],
  ["Bishops-Opening-Berlin-Vienna-Hybrid", "Bishop's Opening: Vienna Hybrid", "bishops-opening"],
  ["Polish-Opening-Kings-Indian-Defense", "Polish Opening: King's Indian Variation", "polish-opening"],
  ["Modern-Defense-Standard-Line...4.Nc3", "Modern Defense: Standard Line", "modern-defense"],
  [
    "Queens-Gambit-Declined-Exchange-Variation",
    "Queen's Gambit Declined: Exchange Variation",
    "queens-gambit-declined",
  ],
  [
    "Queens-Gambit-Accepted-Classical-Defense",
    "Queen's Gambit Accepted: Classical Defense",
    "queens-gambit-accepted",
  ],
  ["Caro-Kann-Defense-Advance-Variation", "Caro-Kann Defense: Advance Variation", "caro-kann-defense"],
  [
    "Kings-Indian-Defense-Orthodox-Variation",
    "King's Indian Defense: Orthodox Variation",
    "kings-indian-defense",
  ],
  ["Italian-Game-Giuoco-Piano", "Italian Game: Giuoco Piano", "italian-game"],
  ["French-Defense-Winawer-Variation", "French Defense: Winawer Variation", "french-defense"],
  ["London-System", "London System", "london-system"],
  ["Scotch-Game-Classical-Variation", "Scotch Game: Classical Variation", "scotch-game"],
  ["Kings-Gambit-Accepted-Kieseritzky", "King's Gambit Accepted: Kieseritzky Gambit", "kings-gambit-accepted"],
  ["Van-t-Kruijs-Opening", "Van't Kruijs Opening", "van-t-kruijs-opening"],
];

let failures = 0;

for (const [ecoUrlTail, lichessName, expected] of CASES) {
  const chesscomName = openingFromEcoUrl(`https://www.chess.com/openings/${ecoUrlTail}`);
  const chesscomSlug = chesscomName ? familyOf(chesscomName) : "(null)";
  const lichessSlug = familyOf(lichessName);

  const ok = chesscomSlug === expected && lichessSlug === expected;
  if (!ok) failures += 1;

  console.log(
    `${ok ? "ok  " : "FAIL"}  ${expected.padEnd(26)} ` +
      `chesscom=${chesscomSlug.padEnd(26)} lichess=${lichessSlug}`,
  );
}

// Display names should read like chess, not like a slug.
console.log("\nDisplay names:");
for (const raw of [
  "Queens-Gambit-Declined-Exchange-Variation",
  "Kings-Indian-Defense-Orthodox",
  "Caro-Kann-Defense-Advance",
  "Sicilian-Defense-Najdorf",
]) {
  const name = openingFromEcoUrl(`https://www.chess.com/openings/${raw}`);
  console.log(`  ${raw.padEnd(42)} -> ${parseOpening(name, null)?.family}`);
}

console.log(`\n${CASES.length - failures}/${CASES.length} cases agree across platforms.`);
process.exit(failures ? 1 : 0);
