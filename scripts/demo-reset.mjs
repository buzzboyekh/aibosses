// Put the demo back to its opening state. Run before every rehearsal and once
// more immediately before going on stage.
//
// Why this exists: promote_threshold is 3, so three successful rehearsals
// promote the quoting agent to Level 1 and the approval card stops appearing.
// The demo then has no second act and gives no error explaining why.
//
//   node --env-file=.env.local scripts/demo-reset.mjs
//   node --env-file=.env.local scripts/demo-reset.mjs --keep-log

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const keepLog = process.argv.includes("--keep-log");

const patch = async (path, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
};
const del = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: "DELETE", headers: H });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
};

// Roles back to draft-only with a clean counter.
await patch("agent_roles?id=not.is.null", { autonomy_level: 0, clean_approvals: 0 });

if (!keepLog) {
  // decision_log first: it references approvals.
  await del("decision_log?id=not.is.null");
  await del("approvals?id=not.is.null");
}

const roles = await (await fetch(`${url}/rest/v1/agent_roles?select=name,autonomy_level,clean_approvals,promote_threshold`, { headers: H })).json();
const pending = await (await fetch(`${url}/rest/v1/approvals?select=id&state=eq.pending_approval`, { headers: H })).json();
const log = await (await fetch(`${url}/rest/v1/decision_log?select=id`, { headers: H })).json();

console.log("demo reset" + (keepLog ? " (log kept)" : ""));
for (const r of roles) console.log(`  ${r.name}: level ${r.autonomy_level}, ${r.clean_approvals}/${r.promote_threshold}`);
console.log(`  pending approvals: ${pending.length} · log rows: ${log.length}`);
