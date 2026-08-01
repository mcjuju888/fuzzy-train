/**
 * Copies the Stockfish WASM build into public/engine/ so it can be loaded as a
 * same-origin Web Worker.
 *
 * The engine is an OPTIONAL dependency: if stockfish.js is not installed this
 * exits quietly and the app simply hides the engine spot-check. Run as a
 * postinstall hook so Vercel restores the files on every deploy (public/engine
 * is gitignored — no binaries in the repo).
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "stockfish.js");
const target = join(root, "public", "engine");

// The WASM loader plus its binary. The 1.5MB asm.js fallback is deliberately
// left out: every browser that can run this app supports WebAssembly.
const FILES = ["stockfish.wasm.js", "stockfish.wasm"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(source))) {
    console.log("[vendor-engine] stockfish.js not installed — skipping engine assets.");
    return;
  }

  await mkdir(target, { recursive: true });

  for (const file of FILES) {
    const from = join(source, file);
    if (!(await exists(from))) {
      console.warn(`[vendor-engine] expected ${file} in stockfish.js — skipping.`);
      continue;
    }
    await copyFile(from, join(target, file));
    console.log(`[vendor-engine] ${file} -> public/engine/`);
  }
}

main().catch((error) => {
  // Never fail an install over an optional feature.
  console.warn("[vendor-engine] skipped:", error.message);
});
