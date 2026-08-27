// Compile the TypeScript the tests import, on any OS.
//
// This used to be a bash script calling python3 to strip types with regexes.
// It worked on two Macs and failed outright on Eric's Windows machine, which
// matters because he is the one driving the demo. Plain node now, and tsc does
// the compiling rather than regexes guessing at it.
//
//   node test/build.mjs

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const gen = join(root, "test", "gen");
mkdirSync(gen, { recursive: true });

/** Compile a TS file to plain ESM the test files can import. */
function compile(src, outName) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "tsc", src, "--outDir", gen, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: root, stdio: "pipe" }
  );
  const base = src.split("/").pop().replace(/\.ts$/, ".js");
  copyFileSync(join(gen, base), join(root, "test", outName));
}

// Pure modules: tsc handles them directly.
compile("agents/pricing.ts", "pricing.mjs");
compile("line/verify.ts", "line-verify.mjs");

// llm.ts imports nothing, but only parseDraft is under test; tsc emits the
// whole file, which is fine because the rest is never called.
compile("agents/llm.ts", "llm-parse.mjs");

// decide.ts imports the Supabase client for its TYPE only. tsc drops
// type-only imports, so the emitted file has no runtime dependency and the
// tests can hand it an in-memory fake.
compile("context/decide.ts", "decide.mjs");

// The emitted decide.mjs imports ./types.js for types that no longer exist at
// runtime; strip any leftover relative import of it.
const decidePath = join(root, "test", "decide.mjs");
writeFileSync(
  decidePath,
  readFileSync(decidePath, "utf8").replace(/^import .*['"]\.\.?\/.*types(\.js)?['"];?\s*$/gm, "")
);

rmSync(gen, { recursive: true, force: true });
console.log("built test modules: pricing, line-verify, llm-parse, decide");
