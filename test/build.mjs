// Compile the TypeScript the tests import, on any OS.
//
// This used to be a bash script calling python3 to strip types with regexes.
// It worked on two Macs and failed outright on Eric's Windows machine, which
// matters because he is the one driving the demo. Plain node now, and tsc does
// the compiling rather than regexes guessing at it.
//
//   node test/build.mjs

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * tsc flattens output only when the file has no local imports. Anything that
 * imports from another directory (plan.ts -> context/types) drags that file
 * into the program, and tsc then mirrors the source tree instead. So find the
 * emitted file rather than assuming where it landed.
 */
function findEmitted(dir, base) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const hit = findEmitted(full, base);
      if (hit) return hit;
    } else if (entry === base) {
      return full;
    }
  }
  return null;
}

const root = fileURLToPath(new URL("..", import.meta.url));
const gen = join(root, "test", "gen");
mkdirSync(gen, { recursive: true });

/** Compile a TS file to plain ESM the test files can import. */
function compile(src, outName) {
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "tsc", src, "--outDir", gen, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    // Windows can only run a .cmd shim through the shell (node's own
    // .cmd-handling in execFileSync throws EINVAL on some Node versions
    // otherwise); harmless on POSIX where "npx" is a real executable.
    { cwd: root, stdio: "pipe", shell: process.platform === "win32" }
  );
  const base = src.split("/").pop().replace(/\.ts$/, ".js");
  const emitted = findEmitted(gen, base);
  if (!emitted) throw new Error(`tsc produced no ${base} anywhere under ${gen}`);
  copyFileSync(emitted, join(root, "test", outName));
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

// remember.ts imports the Supabase client for its type only, same as decide.ts.
compile("agents/remember.ts", "remember.mjs");
compile("agents/plan.ts", "plan.mjs");

// compute.ts genuinely calls into pricing at runtime, so unlike the others its
// import survives compilation and has to be repointed at the flat copy.
compile("pools/compute.ts", "pools-compute.mjs");
{
  const path = join(root, "test", "pools-compute.mjs");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(/['"][^'"]*agents\/pricing(\.js)?['"]/g, '"./pricing.mjs"')
  );
}

// The emitted decide.mjs imports ./types.js for types that no longer exist at
// runtime; strip any leftover relative import of it.
for (const f of ["decide.mjs", "remember.mjs", "plan.mjs"]) {
  const path = join(root, "test", f);
  writeFileSync(
    path,
    readFileSync(path, "utf8")
      .replace(/^import .*['"]\.\.?\/.*types(\.js)?['"];?\s*$/gm, "")
      .replace(/^import .*['"]\.\/runner(\.js)?['"];?\s*$/gm, "")
  );
}

rmSync(gen, { recursive: true, force: true });
console.log("built test modules: pricing, line-verify, llm-parse, decide, remember, plan, pools-compute");
