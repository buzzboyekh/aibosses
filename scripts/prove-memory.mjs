// Does memory actually change the decision?
//
// The honest way to answer that is a controlled comparison, not a demo trick:
// run the same goal twice with the SAME supplier replies, and change only what
// the system has learned in between. If the answer changes, memory is the one
// variable that could have caused it.
//
//   npm run prove
//
// Exits non-zero if the evidence does not hold up, so this doubles as a
// regression test over the whole memory path.

import crypto from "node:crypto";

const BASE = process.env.DEPLOY_URL ?? "https://aibosses.vercel.app";
const { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY,
        LINE_CHANNEL_SECRET: SECRET, LINE_OWNER_USER_ID: OWNER,
        DASHBOARD_KEY: DKEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY,
  LINE_CHANNEL_SECRET: SECRET, LINE_OWNER_USER_ID: OWNER, DASHBOARD_KEY: DKEY })) {
  if (!v) throw new Error(`${k} missing from .env.local`);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = (path, init) => fetch(`${URL_}/rest/v1/${path}`, { headers: H, ...init });

// Identical in both runs. Nothing here mentions past behaviour.
const GOAL =
  "Source 500 pcs of 195/55R16 from our suppliers at the best total landed cost " +
  "and prepare a purchase order";
const REPLIES = [
  ["Supplier A", "For 195/55R16 we offer GBP 13.40 per tyre, MOQ 500, EXW our factory, lead time 6 weeks. EU label included."],
  ["Supplier B", "195/55R16 is GBP 12.80 each. We can do small orders. I will confirm shipping details later."],
  ["Supplier C", "USD 10.90 per piece FOB, MOQ 500, lead time 45 days. We can supply EU labelling."],
];

// The one thing that differs between the runs. It is about PAST behaviour and
// appears in none of the replies, so it cannot be inferred from the case.
const TAUGHT_SUPPLIER = "Supplier C";
const TAUGHT_FACT =
  "Supplier C was three weeks late on our last order because their EU labelling " +
  "certification had not come through, and they did not tell us until we chased them.";

async function approveNextRfq(caseId) {
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const steps = await (await db(
      `case_steps?select=approval_id,status&case_id=eq.${caseId}&status=eq.awaiting_approval`
    )).json();
    if (steps.length && steps[0].approval_id) {
      const body = JSON.stringify({
        destination: "prove",
        events: [{ type: "postback", source: { type: "user", userId: OWNER },
                   postback: { data: `a=approve&id=${steps[0].approval_id}` } }],
      });
      const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
      await fetch(`${BASE}/api/line/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Line-Signature": sig },
        body,
      });
      return true;
    }
  }
  return false;
}

async function runOnce(label) {
  console.log(bold(`\n${label}`));

  const opened = await (await fetch(`${BASE}/api/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-key": DKEY },
    body: JSON.stringify({ goal: GOAL, kind: "sourcing" }),
  })).json();
  if (!opened.caseId) throw new Error(`could not open a case: ${JSON.stringify(opened)}`);
  console.log(dim(`  case opened, ${opened.steps} steps planned`));

  if (!await approveNextRfq(opened.caseId)) throw new Error("no RFQ appeared to approve");
  console.log(dim("  RFQ approved"));

  for (const [from, text] of REPLIES) {
    await fetch(`${BASE}/api/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-key": DKEY },
      body: JSON.stringify({ case: opened.caseId, from, body: text }),
    });
    process.stdout.write(dim(`  ${from} replied\n`));
  }

  // Wait for the memory step and the comparison to land.
  let data = {};
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const rows = await (await db(`cases?select=data&id=eq.${opened.caseId}`)).json();
    data = rows[0]?.data ?? {};
    if (Object.keys(data).some((k) => k.includes("relationship_memory"))) break;
    process.stdout.write(dim("."));
  }

  const pick = (needle) => {
    const hit = Object.entries(data).find(([k]) => k.includes(needle));
    return hit ? String(hit[1]) : "";
  };
  return { caseId: opened.caseId, memory: pick("relationship_memory"), compare: pick("ops_po") };
}

/** Write the taught fact exactly as agents/reply.ts does, so it is a real memory. */
async function teach() {
  const biz = await (await db("businesses?select=id&key=eq.demo-import")).json();
  await db("context_notes", {
    method: "POST",
    body: JSON.stringify({
      business_id: biz[0].id,
      tags: ["suppliers", "history"],
      content: TAUGHT_FACT,
      source: `learned from ${TAUGHT_SUPPLIER}`,
    }),
  });
  await db("decision_log", {
    method: "POST",
    body: JSON.stringify({
      business_id: biz[0].id, actor: "agent:relationship_memory", action: "learned",
      reason: TAUGHT_FACT.slice(0, 200), meta: { counterparty: TAUGHT_SUPPLIER },
    }),
  });
}

// ---------------------------------------------------------------------------
console.log(bold("\n  Does memory change the decision?"));
console.log(dim("  Same goal, same supplier replies. Only the history differs.\n"));

// Clean slate: run 1 must have nothing to remember.
const { execFileSync } = await import("node:child_process");
execFileSync("node", ["--env-file=.env.local", "scripts/demo-reset.mjs", "--forget"],
  { stdio: "pipe" });
console.log(dim("  forgot everything learned so far\n"));

const before = await runOnce("RUN 1 — knowing nothing about these suppliers");

console.log(bold("\nTEACHING ONE FACT"));
console.log(dim(`  ${TAUGHT_FACT}`));
await teach();

const after = await runOnce("RUN 2 — identical question, identical replies");

// --- the evidence ----------------------------------------------------------
const show = (title, text) => {
  console.log(bold(`\n${title}`));
  console.log("  " + (text || "(nothing)").replace(/\s+/g, " ").slice(0, 620));
};
show("What memory said in RUN 1", before.memory);
show("What memory said in RUN 2", after.memory);
show("RUN 1 recommendation", before.compare);
show("RUN 2 recommendation", after.compare);

const concern = /three weeks late|weeks late|did not tell us|had to chase|chased them/i;
const absentBefore = !concern.test(before.memory);
const presentAfter = after.memory.includes(TAUGHT_SUPPLIER) && concern.test(after.memory);

// The failure this caught on its first run: with nothing observed, the agent
// called a supplier "reliable" anyway. Nothing in the database supported it.
const invented = /good reputation|reputation for reliability|known to be reliable|dependable/i;
const inventedBefore = invented.test(before.memory);
const inventedAfter = invented.test(after.memory);
const changed = before.compare.trim() !== after.compare.trim();

console.log(bold("\n  Evidence"));
console.log(`  ${absentBefore ? "PASS" : "FAIL"}  run 1 did not know about the incident`);
console.log(`  ${presentAfter ? "PASS" : "FAIL"}  run 2 named ${TAUGHT_SUPPLIER} and cited it — only memory could supply that`);
console.log(`  ${!inventedBefore && !inventedAfter ? "PASS" : "FAIL"}  no invented reputation claims in either run`);
console.log(`  note  the recommendation ${changed ? "changed" : "did NOT change"} between runs`);
console.log();

if (!absentBefore || !presentAfter) {
  console.error("Memory did not demonstrably reach the decision. Do not claim it on stage.\n");
  process.exit(1);
}
if (inventedBefore || inventedAfter) {
  console.error("An agent characterised a supplier it had never observed. Fix the prompt before demoing.\n");
  process.exit(1);
}
