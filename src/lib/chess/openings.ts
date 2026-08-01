/**
 * Opening name normalization.
 *
 * The two platforms disagree on naming, granularity, and punctuation for the
 * same line. Lichess sends a structured `Family: Variation` string; Chess.com
 * encodes everything in one flat ECOUrl slug —
 * `Nimzowitsch-Larsen-Attack-Modern-Variation` — with no separator marking
 * where the family stops. Repertoire counts are only meaningful if both
 * collapse onto one key, so every label is reduced to a family plus a slug.
 *
 * Grouping at family level is deliberate: a scouting report wants "they play
 * the Caro-Kann 34% as Black", not eleven rows splitting the Advance,
 * Classical, and Exchange variations into statistical noise.
 */

/**
 * The head noun that ends a family name. "Sicilian Defense Najdorf Variation"
 * cuts after "Defense"; "English Opening Kings English Variation" after
 * "Opening". This one rule covers the large majority of both platforms'
 * vocabularies.
 */
const ROOT_NOUNS = new Set([
  "opening",
  "defense",
  "defence",
  "attack",
  "game",
  "gambit",
  "system",
  "countergambit",
  "reversed",
  "formation",
]);

/** Qualifiers that belong to the family even though they follow the root noun. */
const GAMBIT_QUALIFIERS = new Set(["accepted", "declined", "refused"]);

/**
 * Families the root-noun rule cannot find, because the name contains no root
 * noun before the variation begins ("Ruy Lopez Berlin Defense" would
 * otherwise cut at "Defense" and invent a family per variation). Matched
 * longest-first against the slug.
 */
const FAMILY_PREFIXES = [
  "queens-gambit-declined",
  "queens-gambit-accepted",
  "kings-gambit-accepted",
  "kings-gambit-declined",
  "ruy-lopez",
  "giuoco-piano",
  "kings-indian-attack",
  "english-defense",
  "old-benoni",
  "modern-benoni",
].sort((a, b) => b.length - a.length);

/**
 * Same opening, different house style. Chess.com and Lichess disagree on a
 * number of names outright, and a scouting report that lists "Nimzo-Larsen
 * Attack" and "Nimzowitsch-Larsen Attack" as separate lines is wrong. Left
 * side is the alias, right side the canonical slug this app groups on.
 */
const SLUG_ALIASES: Record<string, string> = {
  // Lichess spelling -> Chess.com spelling
  "nimzo-larsen-attack": "nimzowitsch-larsen-attack",
  "vant-kruijs-opening": "van-t-kruijs-opening",
  "zukertort-opening": "reti-opening",
  "sokolsky-opening": "polish-opening",
  "russian-game": "petrovs-defense",
  "petrov-defense": "petrovs-defense",
  "bird-opening": "birds-opening",
  "alekhine-defense": "alekhines-defense",
  "owen-defense": "owens-defense",
  "gruenfeld-defense": "grunfeld-defense",
  "kings-pawn-game": "kings-pawn-opening",
  "queens-pawn-game": "queens-pawn-opening",
  "horwitz-defense": "english-defense",
  "amar-opening": "paris-opening",
  // Variation adjectives Chess.com bakes into the family position.
  "closed-sicilian-defense": "sicilian-defense",
  "open-sicilian-defense": "sicilian-defense",
};

/** Display spellings for slugs whose title-cased form reads badly. */
const DISPLAY_NAMES: Record<string, string> = {
  "kings-pawn-opening": "King's Pawn Opening",
  "queens-pawn-opening": "Queen's Pawn Opening",
  "kings-indian-defense": "King's Indian Defense",
  "kings-indian-attack": "King's Indian Attack",
  "queens-indian-defense": "Queen's Indian Defense",
  "queens-gambit": "Queen's Gambit",
  "queens-gambit-declined": "Queen's Gambit Declined",
  "queens-gambit-accepted": "Queen's Gambit Accepted",
  "kings-gambit": "King's Gambit",
  "kings-gambit-accepted": "King's Gambit Accepted",
  "kings-gambit-declined": "King's Gambit Declined",
  "philidor-defense": "Philidor Defense",
  "bishops-opening": "Bishop's Opening",
  "alekhines-defense": "Alekhine's Defense",
  "van-t-kruijs-opening": "Van't Kruijs Opening",
  "caro-kann-defense": "Caro-Kann Defense",
  "nimzo-indian-defense": "Nimzo-Indian Defense",
  "bogo-indian-defense": "Bogo-Indian Defense",
  "nimzowitsch-larsen-attack": "Nimzowitsch-Larsen Attack",
  "semi-slav-defense": "Semi-Slav Defense",
  "grunfeld-defense": "Grünfeld Defense",
};

/** Trailing move markers, e.g. `-6.Bg5` or `-1...g6`. */
const MOVE_SUFFIX = /-\d+\.{0,3}[A-Za-z0-9+#=-]*$/;

function titleCase(input: string): string {
  return input
    .split(" ")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    // Combining diacritical marks, so "Réti"/"Grünfeld" match their ASCII forms.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Chess.com: derive a readable name from the ECOUrl slug. */
export function openingFromEcoUrl(ecoUrl: string | null | undefined): string | null {
  if (!ecoUrl) return null;
  const tail = ecoUrl.split("/").filter(Boolean).pop();
  if (!tail) return null;

  const cleaned = tail.replace(MOVE_SUFFIX, "").replace(/-/g, " ").trim();
  return cleaned.length ? cleaned : null;
}

/**
 * Reduces a full opening label to its family.
 *
 * Order matters: the `:`/`(` split handles Lichess, the digit-token cut drops
 * Chess.com's inline move markers, the curated prefix list catches families
 * with no root noun, and the root-noun scan handles everything else.
 */
export function familyOf(rawName: string): string {
  const slug = rawFamilyOf(rawName);
  return SLUG_ALIASES[slug] ?? slug;
}

function rawFamilyOf(rawName: string): string {
  // Lichess: "Sicilian Defense: Najdorf Variation, 6.Bg5"
  const head = rawName.split(/[:(]/)[0].replace(/\s+/g, " ").trim();
  if (!head) return slugify(rawName);

  // Drop everything from the first token carrying a move number:
  // "Modern Defense Standard Line...4.Nc3" -> "Modern Defense".
  const tokens: string[] = [];
  for (const token of head.split(/[\s,]+/).filter(Boolean)) {
    if (/\d/.test(token)) break;
    tokens.push(token);
  }
  if (!tokens.length) return slugify(head);

  const joined = slugify(tokens.join(" "));
  for (const prefix of FAMILY_PREFIXES) {
    if (joined === prefix || joined.startsWith(`${prefix}-`)) {
      return prefix;
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    if (!ROOT_NOUNS.has(tokens[i].toLowerCase())) continue;

    let end = i + 1;
    // "Queen's Gambit Declined" is a different opening from "Queen's Gambit
    // Accepted", so the qualifier stays part of the family.
    if (
      tokens[i].toLowerCase() === "gambit" &&
      tokens[end] &&
      GAMBIT_QUALIFIERS.has(tokens[end].toLowerCase())
    ) {
      end += 1;
    }
    return slugify(tokens.slice(0, end).join(" "));
  }

  return slugify(tokens.join(" "));
}

export interface ParsedOpening {
  eco: string | null;
  /** Full name as reported, cleaned up. */
  name: string;
  /** Display form of the family, used for grouping. */
  family: string;
  /** Stable grouping key, identical across both platforms. */
  slug: string;
}

export function parseOpening(
  rawName: string | null | undefined,
  eco: string | null | undefined,
): ParsedOpening | null {
  if (!rawName && !eco) return null;

  const name = (rawName ?? "").replace(/\s+/g, " ").trim();

  if (!name) {
    // An ECO code with no name still groups usefully on its own.
    const code = (eco ?? "").trim().toUpperCase();
    if (!code) return null;
    return { eco: code, name: code, family: code, slug: slugify(code) };
  }

  const slug = familyOf(name);
  const family = DISPLAY_NAMES[slug] ?? titleCase(slug.replace(/-/g, " "));

  return {
    eco: eco ? eco.trim().toUpperCase() : null,
    name,
    family,
    slug,
  };
}
