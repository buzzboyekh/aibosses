// Feed a supplier reply into an open case.
//
//   npm run reply -- --case <id> --from "Supplier A" "quote text..."
//   npm run reply -- --case <id> --force "..."   # stop waiting for the rest
//
// Real inbound email will POST the same endpoint from a provider webhook.

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
const caseId = flag("case");
const from = flag("from") ?? "supplier";
const force = argv.includes("--force");
const skip = new Set(["--case", "--from", "--force", caseId, flag("from")].filter(Boolean));
const body = argv.filter((a) => !a.startsWith("--") && !skip.has(a)).join(" ");

if (!caseId || !body) {
  console.error('usage: npm run reply -- --case <id> --from "Supplier A" "the reply text"');
  process.exit(1);
}

const BASE = process.env.DEPLOY_URL ?? "https://aibosses.vercel.app";
const KEY = process.env.DASHBOARD_KEY;
if (!KEY) throw new Error("DASHBOARD_KEY missing from .env.local");

const res = await fetch(`${BASE}/api/replies`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-demo-key": KEY },
  body: JSON.stringify({ case: caseId, from, body, force }),
});
const out = await res.json();
if (!res.ok) { console.error(res.status, out); process.exit(1); }

const p = out.parsed;
console.log(`\n  read from ${from}:`);
console.log(`    price     ${p.currency ?? ""} ${p.unit_price ?? "not given"}`);
console.log(`    MOQ       ${p.moq ?? "not given"}`);
console.log(`    lead time ${p.lead_time_days ? p.lead_time_days + " days" : "not given"}`);
console.log(`    incoterm  ${p.incoterm ?? "not given"}`);
if (p.missing?.length) console.log(`    still missing: ${p.missing.join(", ")}`);
if (p.notes) console.log(`    notes: ${p.notes}`);
console.log(out.advanced
  ? "\n  everything it was waiting for is in — the case moved on\n"
  : `\n  still waiting on ${out.waitingFor} more\n`);
