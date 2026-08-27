// Public front page. Deliberately shows NO customer data: the roster, the
// autonomy state and the aggregate counts only. Anything with a quote, a
// supplier term or a customer message in it lives behind /dashboard?key=.

import { serverDb } from "../context/buildContext";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Role = {
  key: string; name: string; action_types: string[];
  autonomy_level: number; clean_approvals: number; promote_threshold: number;
};

const WHAT_IT_DOES: Record<string, string> = {
  orchestrator: "Routes work to the right capability, escalates what fits none.",
  doc_check: "Reads documents and cross-checks them against each other.",
  ops_po: "Finds supply options, compares them honestly, drafts the ask.",
  monitoring: "Notices when reality drifts from the plan, before anyone asks.",
  sales_quote: "Drafts anything that leaves the building, in the right language.",
  relationship_memory: "Remembers how every counterparty actually behaves.",
};
const IN_LOGISTICS: Record<string, string> = {
  orchestrator: "assigns the shipment task",
  doc_check: "invoice vs packing list",
  ops_po: "carrier rates, supplier quotes, POs",
  monitoring: "port delay, ETA slip, reroute",
  sales_quote: "quotes, delay notices, replies",
  relationship_memory: "which supplier ships late",
};
const ORDER = ["orchestrator", "sales_quote", "doc_check", "ops_po", "monitoring", "relationship_memory"];

export default async function Home() {
  const db = serverDb();
  const [{ data: roles }, { count: decisions }, { count: pending }] = await Promise.all([
    db.from("agent_roles").select("key,name,action_types,autonomy_level,clean_approvals,promote_threshold"),
    db.from("decision_log").select("id", { count: "exact", head: true }),
    db.from("approvals").select("id", { count: "exact", head: true }).eq("state", "pending_approval"),
  ]);

  const sorted = (roles ?? []).sort(
    (a: Role, b: Role) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)
  );

  return (
    <main style={wrap}>
      <div style={inner}>
        <div style={kicker}>Chill Agent · FUTUREMODE BUILDMODE 2026</div>
        <h1 style={h1}>AI Bosses</h1>
        <p style={lede}>
          An AI workforce that runs a logistics company&rsquo;s back office. Every desk
          has an agent, all of them share one brain, and a human approves anything
          that leaves the building.
        </p>

        <div style={stats}>
          <Stat value={String(sorted.length)} label="agents on staff" />
          <Stat value={String(decisions ?? 0)} label="decisions logged" />
          <Stat value={String(pending ?? 0)} label="waiting on the owner" />
        </div>

        <h2 style={h2}>The staff</h2>
        {sorted.length === 0 ? (
          <p style={{ ...cardBody, color: "#9a9a9a" }}>
            No agents configured yet.
          </p>
        ) : (
        <div style={grid}>
          {sorted.map((r: Role) => (
            <div key={r.key} style={card}>
              <div style={cardHead}>
                <span style={cardName}>{r.name}</span>
                {r.autonomy_level === 1 ? (
                  <span style={{ ...pill, background: "#1e1b4b", color: "#a5b4fc" }}>
                    Level 1 · acts alone
                  </span>
                ) : (
                  <span style={{ ...pill, background: "#1c1917", color: "#a8a29e" }}>
                    Level 0 · drafts only
                  </span>
                )}
              </div>
              <p style={cardBody}>{WHAT_IT_DOES[r.key] ?? ""}</p>
              <div style={cardMeta}>In logistics: {IN_LOGISTICS[r.key] ?? ""}</div>
              {r.autonomy_level === 0 && (
                <div
                  style={progressWrap}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={r.promote_threshold}
                  aria-valuenow={r.clean_approvals}
                  aria-label={`${r.name}: ${r.clean_approvals} of ${r.promote_threshold} clean approvals before it can act alone`}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      ...progressBar,
                      width: `${Math.min(100, (r.clean_approvals / r.promote_threshold) * 100)}%`,
                    }}
                  />
                  <span style={progressLabel}>
                    {r.clean_approvals}/{r.promote_threshold} clean approvals to promotion
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        <h2 style={h2}>How it works</h2>
        <ol style={steps}>
          <li><b>A customer messages the company on LINE.</b> Not a portal they have to learn. The channel they already use.</li>
          <li><b>The right agent picks it up</b>, pulls only the business facts its role is allowed to see, and drafts the reply.</li>
          <li><b>The owner approves on his phone.</b> Nothing reaches a customer before that, and every step is written to an append-only log.</li>
          <li><b>Agents earn autonomy.</b> After a run of clean approvals a capability starts acting alone. One rejection takes it back.</li>
        </ol>

        <div style={footer}>
          Operator view is private. Ask the operator for the mission control link.
        </div>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={statValue}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh", background: "#0a0a0a", color: "#fafafa",
  fontFamily: "system-ui, -apple-system, sans-serif", padding: "56px 20px 80px",
};
const inner: React.CSSProperties = { maxWidth: 860, margin: "0 auto" };
const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9a9a9a",
};
const h1: React.CSSProperties = {
  fontSize: 44, margin: "10px 0 0", letterSpacing: "-0.02em", textWrap: "balance",
};
const lede: React.CSSProperties = {
  fontSize: 17, lineHeight: 1.6, color: "#a3a3a3", maxWidth: 620, marginTop: 14,
};
const stats: React.CSSProperties = {
  display: "flex", gap: 44, margin: "36px 0 8px", flexWrap: "wrap",
};
const statValue: React.CSSProperties = {
  fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums",
};
const statLabel: React.CSSProperties = { fontSize: 12, color: "#9a9a9a", marginTop: 2 };
const h2: React.CSSProperties = {
  fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "#9a9a9a", margin: "44px 0 14px", fontWeight: 600,
};
const grid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12,
};
const card: React.CSSProperties = {
  border: "1px solid #262626", borderRadius: 12, padding: "16px 18px", background: "#111",
};
const cardHead: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
};
const cardName: React.CSSProperties = {
  fontWeight: 600, fontSize: 15, minWidth: 0, overflowWrap: "break-word",
};
const pill: React.CSSProperties = {
  fontSize: 10, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", fontWeight: 600,
};
const cardBody: React.CSSProperties = { fontSize: 13.5, color: "#d4d4d4", margin: "10px 0 0", lineHeight: 1.5 };
const cardMeta: React.CSSProperties = { fontSize: 12, color: "#9a9a9a", marginTop: 8 };
const progressWrap: React.CSSProperties = {
  marginTop: 12, height: 3, background: "#262626", borderRadius: 999, position: "relative",
};
const progressBar: React.CSSProperties = {
  height: 3, background: "#4f46e5", borderRadius: 999, display: "block",
};
const progressLabel: React.CSSProperties = {
  position: "absolute", top: 8, left: 0, fontSize: 11, color: "#9a9a9a",
  fontVariantNumeric: "tabular-nums",
};
const steps: React.CSSProperties = {
  fontSize: 14.5, lineHeight: 1.75, color: "#d4d4d4", paddingLeft: 20, margin: 0,
};
const footer: React.CSSProperties = {
  marginTop: 52, paddingTop: 18, borderTop: "1px solid #262626", fontSize: 12, color: "#9a9a9a",
};
