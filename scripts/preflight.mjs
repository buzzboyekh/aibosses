// Prove the whole thing is green before you record or go on stage.
//
// Every check here exists because something actually went wrong once: an
// OpenAI account with no credit, a webhook that returned 200 while doing
// nothing, learned facts evicting the pricing rules, agents silently promoted
// past the approval card by three clean rehearsals. Discovering any of those
// mid-take wastes the take.
//
//   npm run preflight
//
// Reads only. It never sends a LINE message, because push quota is finite and
// a preflight that consumes the thing it is measuring is not a preflight.

import crypto from "node:crypto";

const BASE = process.env.DEPLOY_URL ?? "https://aibosses.vercel.app";
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;

const results = [];
const ok = (name, detail) => results.push({ level: "ok", name, detail });
const warn = (name, detail, fix) => results.push({ level: "warn", name, detail, fix });
const bad = (name, detail, fix) => results.push({ level: "bad", name, detail, fix });

// --- 1. environment ---------------------------------------------------------
const NEEDED = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY",
  "LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_OWNER_USER_ID",
  "DASHBOARD_KEY",
];
const missing = NEEDED.filter((k) => !process.env[k]);
if (missing.length) {
  bad("environment", `missing ${missing.join(", ")}`,
    "add them to .env.local, then `npx vercel env pull` if they are also missing on the deployment");
} else {
  ok("environment", `all ${NEEDED.length} variables present`);
}

const { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: SKEY,
        LINE_CHANNEL_SECRET: SECRET, LINE_CHANNEL_ACCESS_TOKEN: LTOK,
        DASHBOARD_KEY: DKEY, OPENAI_API_KEY: OKEY } = process.env;
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

// --- 2. the deployment ------------------------------------------------------
try {
  const get = await fetch(`${BASE}/api/line/webhook`);
  if (get.ok) ok("deployment", `${BASE} reachable, webhook answers`);
  else bad("deployment", `webhook GET returned ${get.status}`, "redeploy: npx vercel deploy --prod");
} catch (err) {
  bad("deployment", `${BASE} unreachable (${String(err).slice(0, 60)})`, "check the URL and your connection");
}

// --- 3. the signature path, both directions --------------------------------
// A webhook that accepts anything is worse than one that is down: it looks fine
// and lets anyone post approvals.
if (SECRET) {
  const body = JSON.stringify({ destination: "preflight", events: [] });
  const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
  const signed = await fetch(`${BASE}/api/line/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Line-Signature": sig }, body,
  });
  const unsigned = await fetch(`${BASE}/api/line/webhook`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  if (signed.ok && unsigned.status === 401) ok("webhook security", "signed accepted, unsigned rejected");
  else if (!signed.ok) bad("webhook security", `a correctly signed request was rejected (${signed.status})`,
    "LINE_CHANNEL_SECRET on the deployment does not match the one here; re-add it and redeploy");
  else bad("webhook security", `an UNSIGNED request was accepted (${unsigned.status})`,
    "the deployment is missing LINE_CHANNEL_SECRET — anyone could post approvals");
}

// --- 4. LINE push quota, read only -----------------------------------------
if (LTOK) {
  try {
    const lh = { Authorization: `Bearer ${LTOK}` };
    const [q, c] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", { headers: lh }).then((r) => r.json()),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers: lh }).then((r) => r.json()),
    ]);
    const limit = q?.type === "limited" ? q.value : Infinity;
    const used = c?.totalUsage ?? 0;
    const left = limit - used;
    const runs = Math.floor(left / 5); // a full demo costs about five pushes
    if (!Number.isFinite(limit)) ok("LINE quota", "unlimited plan");
    else if (left < 20) bad("LINE quota", `${left} of ${limit} left — about ${runs} runs`,
      "upgrade the LINE plan, or rehearse against a second throwaway Official Account");
    else if (left < 60) warn("LINE quota", `${left} of ${limit} left — about ${runs} runs`,
      "enough for the event, but stop casual rehearsing on this account");
    else ok("LINE quota", `${left} of ${limit} left — about ${runs} runs`);
  } catch {
    warn("LINE quota", "could not read it", "check LINE_CHANNEL_ACCESS_TOKEN is still valid");
  }
}

// --- 5. the model has credit ------------------------------------------------
// An account with a valid key and no balance is exactly how this failed before.
if (OKEY) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OKEY}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL ?? "gpt-4o-mini", max_tokens: 1,
      messages: [{ role: "user", content: "ok" }] }),
  });
  if (r.ok) ok("model", "key works and the account has credit");
  else {
    const t = (await r.text()).slice(0, 120);
    bad("model", `${r.status} ${t}`, r.status === 429
      ? "the OpenAI account is out of credit — top it up at platform.openai.com/settings/organization/billing"
      : "check OPENAI_API_KEY");
  }
}

// --- 6. the data the demo depends on ---------------------------------------
if (SB && SKEY) {
  const q = (p) => fetch(`${SB}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
  try {
    const roles = await q("agent_roles?select=name,autonomy_level,clean_approvals&business_id=not.is.null");
    const promoted = roles.filter((r) => r.autonomy_level !== 0);
    // Three clean rehearsals promote a role, and a promoted role stops sending
    // the approval card. The demo then has no second act and gives no error.
    if (promoted.length) bad("agent autonomy",
      `${promoted.map((r) => r.name).join(", ")} already promoted`,
      "npm run demo:reset — otherwise the approval card will not appear");
    else ok("agent autonomy", `all ${roles.length} agents at Level 0`);

    const pending = await q("approvals?select=id&state=eq.pending_approval");
    if (pending.length > 2) warn("approval queue", `${pending.length} left over`,
      "npm run demo:reset, so the queue on screen is only what you just did");
    else ok("approval queue", `${pending.length} pending`);

    const notes = await q("context_notes?select=content,source");
    const core = notes.filter((n) => !String(n.source ?? "").startsWith("learned from"));
    const hasMargin = core.some((n) => n.content.includes("12 percent"));
    if (!hasMargin) bad("business rules", "the margin rule is not reaching the agents",
      "reseed: run db/seed.sql, or check the context budget in buildContext.ts");
    else ok("business rules", `${core.length} core rules present, margin rule reachable`);
  } catch (err) {
    bad("database", String(err).slice(0, 80), "check SUPABASE_URL and the service key");
  }
}

// --- report -----------------------------------------------------------------
console.log(bold("\n  Preflight\n"));
for (const r of results) {
  const tag = r.level === "ok" ? green("  ok  ") : r.level === "warn" ? amber(" warn ") : red(" FAIL ");
  console.log(`${tag} ${r.name.padEnd(18)} ${dim(r.detail)}`);
  if (r.fix) console.log(`       ${" ".repeat(18)} ${amber("→ " + r.fix)}`);
}

const failed = results.filter((r) => r.level === "bad").length;
const warned = results.filter((r) => r.level === "warn").length;
console.log(failed
  ? red(bold(`\n  ${failed} blocking. Fix before recording.\n`))
  : green(bold(`\n  Ready to record${warned ? ` (${warned} worth knowing)` : ""}.\n`)));
process.exit(failed ? 1 : 0);
