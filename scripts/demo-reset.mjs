// Put the demo back to its opening state WITHOUT deleting anything.
//
// The old version deleted decision_log rows, which quietly contradicted the
// thing we claim on stage: that the log is append-only and every action is on
// the record. Eric noticed the row count go down. If a judge can make rows
// disappear, the audit trail is not an audit trail.
//
// So this deletes nothing. It resets autonomy, closes out anything still open,
// and writes a `session_reset` marker. Views show entries since the most
// recent marker, which gives a clean demo and an intact history.
//
// `--forget` additionally clears learned facts. Off by default, and needed only
// for the memory A/B: learned facts survive every rehearsal, so by the third
// practice run the "before" half is no longer clean and the comparison means
// nothing. It deletes only rows in `context_notes` whose source marks them as
// learned. That is memory, not the audit trail, and the `learned` entries in
// `decision_log` still record that it happened.
//
//   npm run demo:reset
//   npm run demo:reset -- --forget

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const api = async (path, method, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r;
};

const forget = process.argv.includes("--forget");
const businesses = await (await fetch(`${url}/rest/v1/businesses?select=id`, { headers: H })).json();

// 1. Every agent back to draft-only with a clean counter.
await api("agent_roles?id=not.is.null", "PATCH", { autonomy_level: 0, clean_approvals: 0 });

// 2. Anything still waiting is closed out rather than removed, so the record
//    of it having existed survives.
const now = new Date().toISOString();
await api("approvals?state=eq.pending_approval", "PATCH", {
  state: "rejected", decided_by: "system",
  decision_reason: "superseded by a demo reset", decided_at: now,
});
await api("cases?state=in.(planning,running,waiting,blocked)", "PATCH", {
  state: "cancelled", updated_at: now, closed_at: now,
});
await api("case_steps?status=in.(pending,running,awaiting_approval,awaiting_reply)", "PATCH", {
  status: "skipped", completed_at: now,
});

// 2a. Pools, same treatment: closed out, not deleted. A pool left open or
//     filled from an earlier run stays on /pools, so the second rehearsal put
//     two grouper cards on screen. `cancelled` drops them from the page while
//     the row survives. Tolerated if migration 004 has not been applied yet.
let poolsClosed = 0;
try {
  const stale = await (await fetch(
    `${url}/rest/v1/demand_pools?select=id&state=in.(open,filled)`, { headers: H }
  )).json();
  if (Array.isArray(stale) && stale.length) {
    await api("demand_pools?state=in.(open,filled)", "PATCH", {
      state: "cancelled", updated_at: now,
    });
    poolsClosed = stale.length;
  }
} catch {
  /* table not there yet — nothing to close */
}

// 2b. Only when explicitly asked: forget what was learned about counterparties.
let forgotten = 0;
if (forget) {
  const before = await (await fetch(
    `${url}/rest/v1/context_notes?select=id&source=like.learned from*`, { headers: H }
  )).json();
  forgotten = before.length;
  if (forgotten) {
    await api("context_notes?source=like.learned from*", "DELETE");
  }
  for (const b of businesses) {
    await api("decision_log", "POST", {
      business_id: b.id, actor: "system", action: "session_reset",
      reason: `forgot ${forgotten} learned facts — deliberate, for a before/after comparison`,
    });
  }
}

// 3. The marker. Everything after this is the new session.
for (const b of businesses) {
  await api("decision_log", "POST", {
    business_id: b.id, actor: "system", action: "session_reset",
    reason: "demo reset — history above this line is from an earlier run",
  });
}

const roles = await (await fetch(`${url}/rest/v1/agent_roles?select=name,autonomy_level,clean_approvals,promote_threshold`, { headers: H })).json();
const log = await (await fetch(`${url}/rest/v1/decision_log?select=id`, { headers: H })).json();
console.log(forget
  ? `demo reset — forgot ${forgotten} learned facts, kept everything else`
  : "demo reset — nothing deleted");
for (const r of roles) console.log(`  ${r.name}: level ${r.autonomy_level}, ${r.clean_approvals}/${r.promote_threshold}`);
if (poolsClosed) console.log(`  pools closed out: ${poolsClosed} (re-seed with scripts/seed-pools.mjs)`);
console.log(`  decision_log intact: ${log.length} rows (view starts after the new marker)`);
