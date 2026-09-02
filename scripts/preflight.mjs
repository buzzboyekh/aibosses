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
// BUSINESS_KEY is in here because leaving it unset does not fail loudly: the
// app falls back to one business, the seed scripts write to another, and the
// first anyone knows is an empty page on the projector.
const NEEDED = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY",
  "LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_OWNER_USER_ID",
  "DASHBOARD_KEY", "BUSINESS_KEY",
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
    const runs = Math.floor(left / 7); // counted the call sites: ~7 pushes per full run
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
// Test whichever provider will ACTUALLY run: agents/llm.ts picks Anthropic when
// its key is present. Testing OpenAI unconditionally would post a Claude model
// id to OpenAI and report a false failure on a healthy system.
const provider = process.env.LLM_PROVIDER ??
  (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
{
  const akey = process.env.ANTHROPIC_API_KEY;
  if (provider === "anthropic" && !akey) {
    bad("model", "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is unset", "set the key or unset LLM_PROVIDER");
  } else if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": akey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.LLM_MODEL ?? "claude-sonnet-4-5", max_tokens: 1,
        messages: [{ role: "user", content: "ok" }] }),
    });
    if (r.ok) ok("model", `anthropic, ${process.env.LLM_MODEL ?? "claude-sonnet-4-5"}, has credit`);
    else bad("model", `anthropic ${r.status} ${(await r.text()).slice(0, 100)}`, "check ANTHROPIC_API_KEY and its balance");
  } else if (!OKEY) {
    bad("model", "OPENAI_API_KEY unset", "add it to .env.local");
  } else {
    const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OKEY}` },
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
    });
    if (r.ok) ok("model", `openai, ${model}, key works and the account has credit`);
    else {
      const t = (await r.text()).slice(0, 120);
      bad("model", `openai ${r.status} ${t}`, r.status === 429
        ? "the account is out of credit — top up at platform.openai.com/settings/organization/billing"
        : "check OPENAI_API_KEY, and that LLM_MODEL is an OpenAI model id");
    }
  }
}

// Email fails soft by design, so a supplier-email beat degrades silently on
// camera unless someone says so here.
if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
  warn("email", "not configured — supplier drafts will say so rather than send",
    "fine for the demo; set RESEND_API_KEY and EMAIL_FROM if you want real sends");
} else {
  ok("email", "configured");
}

// --- 6. the data the demo depends on ---------------------------------------
if (SB && SKEY) {
  const q = (p) => fetch(`${SB}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
  try {
    // Everything below is scoped to the ONE business the demo will show.
    // Unscoped, these counted every business in the database, so a second
    // config turned "all 6 agents at Level 0" into "all 12" and a promoted
    // agent in the business nobody is demoing would have blocked a good run.
    const bkey = process.env.BUSINESS_KEY;
    const [biz] = bkey ? await q(`businesses?select=id,name,config&key=eq.${bkey}`) : [];
    if (!biz) {
      bad("business", `BUSINESS_KEY=${bkey ?? "(unset)"} matches no row`,
        "set BUSINESS_KEY to a seeded business — the pages read this and will otherwise be empty");
    } else {
      ok("business", `${bkey} — ${biz.name}`);
      const scope = `business_id=eq.${biz.id}`;

      const roles = await q(`agent_roles?select=name,autonomy_level,clean_approvals&${scope}`);
      const promoted = roles.filter((r) => r.autonomy_level !== 0);
      // Three clean rehearsals promote a role, and a promoted role stops sending
      // the approval card. The demo then has no second act and gives no error.
      if (promoted.length) bad("agent autonomy",
        `${promoted.map((r) => r.name).join(", ")} already promoted`,
        "npm run demo:reset — otherwise the approval card will not appear");
      else ok("agent autonomy", `all ${roles.length} agents at Level 0`);

      const pending = await q(`approvals?select=id&state=eq.pending_approval&${scope}`);
      if (pending.length > 2) warn("approval queue", `${pending.length} left over`,
        "npm run demo:reset, so the queue on screen is only what you just did");
      else ok("approval queue", `${pending.length} pending`);

      // The margin figure comes from this business's own price list rather than
      // a hardcoded "12 percent", which was the tyre number and would have
      // reported a false failure the moment the config changed industry.
      const notes = await q(`context_notes?select=content,source&${scope}`);
      const core = notes.filter((n) => !String(n.source ?? "").startsWith("learned from"));
      const marginPct = biz.config?.price_list?.margin_pct;
      const hasMargin = marginPct === undefined
        ? core.some((n) => /\d+ percent/.test(n.content))
        : core.some((n) => n.content.includes(`${marginPct} percent`));
      if (!hasMargin) bad("business rules",
        `the margin rule (${marginPct ?? "?"}%) is not reaching the agents`,
        "reseed this business, or check the context budget in buildContext.ts");
      else ok("business rules", `${core.length} core rules present, margin rule reachable`);

      // The pooling page is act one of the new demo, and an unseeded pool is
      // an empty screen rather than an error — exactly the failure that is
      // invisible until you are standing in front of it.
      const pools = await q(`demand_pools?select=id,item,state&${scope}&state=eq.open`);
      if (Array.isArray(pools) && pools.length) {
        ok("demand pools", `${pools.length} open (${pools.map((p) => p.item).join(", ")})`);
      } else if (Array.isArray(pools)) {
        warn("demand pools", "none open — /pools will be empty",
          "node --env-file=.env.local scripts/seed-pools.mjs");
      } else {
        warn("demand pools", "table missing — migration 004 not applied",
          "run db/migrations/004_demand_pools.sql in the Supabase SQL editor");
      }
    }
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
