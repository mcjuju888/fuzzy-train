/**
 * End-to-end check of the fetch -> normalize -> report pipeline, with no
 * database involved. Useful for confirming the upstream adapters still line
 * up with what the platforms actually return.
 *
 *   npm run smoke -- chesscom hikaru
 *   npm run smoke -- lichess DrNykterstein 120
 */

import * as chesscom from "../src/lib/chess/chesscom";
import * as lichess from "../src/lib/chess/lichess";
import { isPlatform } from "../src/lib/chess/handles";
import { buildReport } from "../src/lib/chess/report";

const [platformArg = "chesscom", handle = "hikaru", limitArg = "80"] = process.argv.slice(2);

if (!isPlatform(platformArg)) {
  console.error(`Unknown platform "${platformArg}". Use chesscom or lichess.`);
  process.exit(1);
}

const adapter = platformArg === "chesscom" ? chesscom : lichess;
const limit = Number.parseInt(limitArg, 10) || 80;

const bar = (label: string) => `\n${label}\n${"─".repeat(label.length)}`;

async function main() {
  console.log(`Scouting ${handle} on ${platformArg} (up to ${limit} games)…`);

  const identity = await adapter.fetchIdentity(handle);
  console.log(
    `Identity: ${identity.displayHandle}${identity.title ? ` (${identity.title})` : ""} ` +
      `— ratings ${JSON.stringify(identity.ratings)}`,
  );

  const started = Date.now();
  const games = await adapter.fetchGames(identity.handle, { limit });
  console.log(`Fetched ${games.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (!games.length) {
    console.log("No standard games returned — nothing to report on.");
    return;
  }

  const report = buildReport(identity, games);

  console.log(bar("Overall"));
  console.log(
    `${report.overall.wins}W ${report.overall.draws}D ${report.overall.losses}L ` +
      `over ${report.overall.games} — score ${(report.overall.score * 100).toFixed(1)}%`,
  );
  console.log(
    `White ${(report.byColor.white.score * 100).toFixed(1)}% (${report.byColor.white.games}) · ` +
      `Black ${(report.byColor.black.score * 100).toFixed(1)}% (${report.byColor.black.games})`,
  );

  console.log(bar("Time controls"));
  for (const line of report.timeControls) {
    console.log(
      `  ${line.timeClass.padEnd(10)} ${String(line.games).padStart(4)} games  ` +
        `${(line.score * 100).toFixed(1).padStart(5)}%  ~${line.averageMoves} moves`,
    );
  }

  for (const color of ["white", "black"] as const) {
    console.log(bar(`Openings as ${color}`));
    for (const line of report.openings[color]) {
      console.log(
        `  ${line.name.slice(0, 34).padEnd(34)} ${String(line.games).padStart(3)}g  ` +
          `${(line.score * 100).toFixed(0).padStart(3)}%  ${(line.share * 100).toFixed(0)}% share`,
      );
    }
  }

  console.log(bar("Radar"));
  for (const axis of report.radar) {
    console.log(`  ${axis.label.padEnd(14)} ${String(axis.value).padStart(3)}  ${axis.hint}`);
  }

  console.log(bar("Tendencies"));
  for (const tendency of report.tendencies) {
    console.log(`  [${tendency.severity}] ${tendency.title}`);
    console.log(`      ${tendency.detail}`);
    console.log(`      evidence: ${tendency.evidence} (confidence ${tendency.confidence})`);
  }

  console.log(bar("Repeat positions"));
  if (!report.criticalPositions.length) {
    console.log("  none above the threshold");
  }
  for (const position of report.criticalPositions) {
    console.log(
      `  ${position.openingName} as ${position.color} — ${position.occurrences}× ` +
        `at ${(position.record.score * 100).toFixed(0)}% (${(position.scoreDelta * 100).toFixed(0)} vs baseline)`,
    );
    console.log(`      ${position.line.join(" ")}`);
    console.log(`      their move: ${position.theirMove ?? "?"} · fen ${position.fen ?? "unavailable"}`);
  }
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error);
  process.exit(1);
});
