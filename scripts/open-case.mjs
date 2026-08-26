// Give the company a job and watch it plan and work through it.
//
//   npm run case -- "Source 1000 pcs of 195/65R15 at the best total landed cost for a Rotterdam customer, and get a purchase order ready"

const goal = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
if (!goal) throw new Error('give it a goal: npm run case -- "..."');

const BASE = process.env.DEPLOY_URL ?? "https://aibosses.vercel.app";
const KEY = process.env.DASHBOARD_KEY;
if (!KEY) throw new Error("DASHBOARD_KEY missing from .env.local");

const res = await fetch(`${BASE}/api/cases`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-demo-key": KEY },
  body: JSON.stringify({ goal, kind: "sourcing" }),
});
const out = await res.json();
console.log(res.status, JSON.stringify(out, null, 2));
if (!res.ok) process.exit(1);

// Poll the plan as it works through.
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await (await fetch(`${BASE}/api/cases?key=${KEY}`)).json();
  const kase = s.cases?.find((c) => c.id === out.caseId);
  const steps = (s.steps ?? []).filter((x) => x.case_id === out.caseId);
  console.clear();
  console.log(`\n  ${kase?.title ?? out.title}   [${kase?.state}]\n`);
  for (const st of steps) {
    const mark = { done: "✓", running: "•", awaiting_approval: "⏸", pending: " ", failed: "✕", skipped: "–" }[st.status] ?? "?";
    console.log(`  ${mark} ${st.seq}. ${st.role_key.padEnd(22)} ${st.intent.slice(0, 60)}`);
    if (st.status === "awaiting_approval") console.log(`      ${" ".repeat(24)}waiting for you to approve on LINE`);
  }
  if (kase?.state === "done" || kase?.state === "blocked") break;
}
console.log();
