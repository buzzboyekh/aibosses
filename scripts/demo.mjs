// The demo, driven from one place. Press Enter between beats.
//
// Why this exists: rehearsing by hand means a different demo every time, and
// on stage the operator should be talking, not typing. This runs the exact
// sequence, prints what to say, and waits for you.
//
//   npm run demo            full run, reset first
//   npm run demo -- --no-reset      keep existing history on screen
//   npm run demo -- --auto          no waiting, for recording the fallback video

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import crypto from "node:crypto";

const AUTO = process.argv.includes("--auto");
const NO_RESET = process.argv.includes("--no-reset");
const BASE = process.env.DEPLOY_URL ?? "https://aibosses.vercel.app";
const { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, LINE_CHANNEL_SECRET: SECRET, DASHBOARD_KEY: DKEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, LINE_CHANNEL_SECRET: SECRET, DASHBOARD_KEY: DKEY }))
  if (!v) throw new Error(`${k} missing from .env.local`);
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const rl = AUTO ? null : createInterface({ input: stdin, output: stdout });
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

async function beat(say, run) {
  console.log("\n" + bold("SAY: ") + say);
  if (rl) await rl.question(dim("   [enter to fire] "));
  else await sleep(2000);
  await run();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A customer message, signed exactly as LINE would sign it. */
async function customerSays(text, userId = "Ustage00000000000000000000000001") {
  const body = JSON.stringify({
    destination: "stage",
    events: [{ type: "message", source: { type: "user", userId }, message: { type: "text", text } }],
  });
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  const r = await fetch(`${BASE}/api/line/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Line-Signature": sig },
    body,
  });
  console.log(dim(`   -> webhook ${r.status}`));
}

async function waitForDraft(sinceIso, label) {
  const started = Date.now();
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const secs = Math.round((Date.now() - started) / 1000);
    process.stdout.write(`\r   ${dim(`agent working… ${secs}s`)}   `);
    const rows = await (await fetch(`${URL_}/rest/v1/approvals?select=title,payload,created_at&created_at=gt.${sinceIso}&order=created_at.desc&limit=1`, { headers: H })).json();
    if (rows.length) {
      process.stdout.write("\r" + " ".repeat(40) + "\r");
      console.log(cyan(`   ${label}: ${rows[0].title}`));
      console.log(dim("   " + String(rows[0].payload?.body ?? "").split("\n").slice(0, 4).join("\n   ")));
      return rows[0];
    }
  }
  console.log("\n   " + dim("no draft appeared — check `vercel logs`, then use the fallback video"));
  return null;
}

const now = () => new Date().toISOString();

/** Approve whatever is pending, exactly as tapping the card does. */
async function approvePending() {
  const rows = await (await fetch(
    `${URL_}/rest/v1/approvals?select=id&state=eq.pending_approval&order=created_at.desc&limit=1`,
    { headers: H }
  )).json();
  if (!rows.length) { console.log(dim("   nothing pending to approve")); return false; }
  const owner = process.env.LINE_OWNER_USER_ID;
  if (!owner) { console.log(dim("   LINE_OWNER_USER_ID unset, cannot auto-approve")); return false; }
  const body = JSON.stringify({
    destination: "demo",
    events: [{ type: "postback", source: { type: "user", userId: owner },
               postback: { data: `a=approve&id=${rows[0].id}` } }],
  });
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  await fetch(`${BASE}/api/line/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Line-Signature": sig }, body,
  });
  console.log(dim("   approved"));
  await sleep(6000);
  return true;
}

console.log(bold("\n  AI Bosses — demo runner"));
console.log(dim(`  ${BASE}   dashboard: ${BASE}/dashboard?key=${DKEY}\n`));

if (!NO_RESET) {
  // Delegate to the real reset. This used to DELETE decision_log inline, which
  // silently undid the append-only guarantee the whole pitch rests on.
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["--env-file=.env.local", "scripts/demo-reset.mjs"], { stdio: "pipe" });
  console.log(dim("  reset: every agent back to Level 0, nothing deleted"));
}

// ---- Act 1: a customer asks, an agent quotes, the owner approves -----------
let t = now();
await beat(
  "A customer messages the company on LINE. Not a portal they had to learn.",
  () => customerSays("Hi, price for 1000 pcs 195/65R15 delivered Rotterdam please, in USD. How long is shipping?")
);
await waitForDraft(t, "drafted");
console.log(bold("\nSAY: ") + "That price is not the model's guess. It read the request, our code picked the volume tier and applied the margin, and the model only wrote the Chinese around it. Landed cost, margin and FX rate are all on the card.");
console.log(bold("SAY: ") + "And nothing has left the building. It is waiting on me.");
if (rl) await rl.question(dim("   [approve it on your phone, then enter] "));
else await approvePending();

// ---- Act 2: the documents disagree ----------------------------------------
t = now();
await beat(
  "Second beat: the paperwork disagrees with itself. This is the one that costs real money at a border.",
  () => customerSays("Attaching our invoice and packing list for order TW-4471 — invoice says 1000 pcs, packing list says 980 pcs. Please confirm.")
);
await waitForDraft(t, "drafted");
if (rl) await rl.question(dim("   [approve, then enter] "));
else await approvePending();

// ---- Act 3: it warns before anyone asks ------------------------------------
t = now();
await beat(
  "Third beat: nobody asked for this one. The shipment slipped and the agent noticed.",
  async () => {
    const r = await fetch(`${BASE}/api/demo/delay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-key": DKEY },
      body: JSON.stringify({ reference: "TW-4471", destination: "Rotterdam", cause: "port congestion at Kaohsiung", days: 8, cargo: "1000 x 195/65R15" }),
    });
    console.log(dim(`   -> ${r.status}`));
  }
);
await waitForDraft(t, "drafted unprompted");

// ---- Close: the audit trail -------------------------------------------------
const log = await (await fetch(`${URL_}/rest/v1/decision_log?select=actor,action,reason&order=id.asc`, { headers: H })).json();
console.log(bold("\nSAY: ") + "Every one of those is on the record: who did it, and why.");
console.log();
for (const e of log) console.log("   " + e.actor.padEnd(24) + e.action.padEnd(11) + dim((e.reason ?? "").slice(0, 60)));
console.log(bold("\nSAY: ") + "Approve a few more times and that agent promotes itself and stops asking. Reject once and it goes back to asking. That is the whole product: you do not have to trust it, it earns it, and you can take it away.");
console.log(dim(`\n  dashboard: ${BASE}/dashboard?key=${DKEY}\n`));
rl?.close();
