// One job, told end to end: the goal, the plan, every draft, every decision,
// and — the part nothing else shows — exactly what each agent knew when it
// acted. The pitch claims every decision is reconstructable; this is where
// that claim is one click instead of a database query.
//
// Read-only. Same key gate as the dashboard.

import { notFound } from "next/navigation";
import { serverDb } from "../../../context/buildContext";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Step = {
  id: string; seq: number; role_key: string; action_type: string | null;
  intent: string; status: string; output: { body?: string } | null;
  approval_id: string | null; blocked_reason: string | null;
};
type Approval = {
  id: string; case_step_id: string | null; title: string; state: string;
  decided_by: string | null; decision_reason: string | null;
  payload: { body?: string; missing?: string[]; correction?: string };
  context_snapshot: {
    task?: string;
    notes?: { tags: string[]; content: string; source?: string | null }[];
    computed?: string;
    correction?: string;
    assembled_at?: string;
  } | null;
};
type LogRow = { id: number; actor: string; action: string; reason: string | null; created_at: string };

const STATE_COLOR: Record<string, string> = {
  done: "#047857", executed: "#047857", approved: "#047857",
  awaiting_approval: "#b45309", awaiting_reply: "#b45309", waiting: "#b45309",
  failed: "#b91c1c", rejected: "#b91c1c", blocked: "#b91c1c",
  running: "#4338ca", auto_executed: "#4338ca",
};
const MARK: Record<string, string> = {
  done: "✓", running: "•", awaiting_approval: "⏸", awaiting_reply: "⏳",
  pending: "·", failed: "✕", skipped: "–",
};
const isLearned = (s?: string | null) => typeof s === "string" && s.startsWith("learned from");

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

export default async function CasePage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { key?: string };
}) {
  const expected = process.env.DASHBOARD_KEY;
  if (!expected || searchParams?.key !== expected) notFound();

  const db = serverDb();
  const { data: kase } = await db.from("cases").select("*").eq("id", params.id).single();
  if (!kase) notFound();

  const { data: stepsRaw } = await db
    .from("case_steps").select("*").eq("case_id", params.id).order("seq");
  const steps = (stepsRaw ?? []) as Step[];

  const approvalIds = steps.map((s) => s.approval_id).filter(Boolean) as string[];
  const { data: approvalsRaw } = approvalIds.length
    ? await db.from("approvals").select("*").in("id", approvalIds)
    : { data: [] };
  const approvals = new Map(((approvalsRaw ?? []) as Approval[]).map((a) => [a.id, a]));

  const { data: logA } = await db
    .from("decision_log").select("id,actor,action,reason,created_at")
    .contains("meta", { case_id: params.id });
  const { data: logB } = approvalIds.length
    ? await db.from("decision_log").select("id,actor,action,reason,created_at")
        .in("approval_id", approvalIds)
    : { data: [] };
  const log = [...(logA ?? []), ...(logB ?? [])]
    .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => a.id - b.id) as LogRow[];

  return (
    <main style={wrap}>
      <a href={`/dashboard?key=${searchParams.key}`} style={backLink}>← Mission Control</a>
      <h1 style={h1}>{kase.title}</h1>
      <p style={meta}>
        <span style={{ color: STATE_COLOR[kase.state] ?? "#111", fontWeight: 600 }}>{kase.state}</span>
        {" · "}{kase.kind}{kase.counterparty ? ` · for ${kase.counterparty}` : ""}
      </p>
      <p style={goal}>{kase.goal}</p>

      <h2 style={h2}>The work</h2>
      {steps.length === 0 && <p style={empty}>No steps planned yet.</p>}
      {steps.map((s) => {
        const a = s.approval_id ? approvals.get(s.approval_id) : undefined;
        const body = a?.payload?.body ?? s.output?.body ?? "";
        const snap = a?.context_snapshot;
        const rules = (snap?.notes ?? []).filter((n) => !isLearned(n.source));
        const observed = (snap?.notes ?? []).filter((n) => isLearned(n.source));
        return (
          <div key={s.id} style={card}>
            <div style={cardHead}>
              <span style={{ color: STATE_COLOR[s.status] ?? "#666", width: 18 }}>
                {MARK[s.status] ?? "?"}
              </span>
              <span style={{ fontWeight: 600 }}>{s.seq}. {s.role_key}</span>
              <span style={pill}>
                {s.action_type ?? "internal — no approval needed"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: STATE_COLOR[s.status] ?? "#666" }}>
                {s.status}
              </span>
            </div>
            <div style={intent}>{s.intent}</div>
            {s.blocked_reason && (
              <div style={{ ...longText, color: "#b91c1c" }}>{s.blocked_reason}</div>
            )}
            {body && (
              <div style={longText}>{body.slice(0, 1600)}</div>
            )}
            {a?.payload?.missing?.length ? (
              <div style={missing}>Agent flagged missing: {a.payload.missing.join("; ")}</div>
            ) : null}
            {a && (
              <div style={decision}>
                Decision: <b style={{ color: STATE_COLOR[a.state] ?? "#111" }}>{a.state}</b>
                {a.decided_by ? ` by ${a.decided_by}` : ""}
                {a.decision_reason ? ` — ${a.decision_reason}` : ""}
                {a.payload?.correction ? (
                  <div style={{ marginTop: 4 }}>Operator said: “{a.payload.correction}”</div>
                ) : null}
              </div>
            )}
            {snap && (
              <details style={details}>
                <summary style={summary}>
                  What this agent knew when it acted
                  {snap.assembled_at ? ` · ${TIME.format(new Date(snap.assembled_at))}` : ""}
                </summary>
                {rules.length > 0 && (
                  <>
                    <div style={snapHead}>Business rules it was given ({rules.length})</div>
                    <ul style={snapList}>
                      {rules.map((n, i) => <li key={i}>{n.content}</li>)}
                    </ul>
                  </>
                )}
                {observed.length > 0 && (
                  <>
                    <div style={snapHead}>Observations from past dealings ({observed.length})</div>
                    <ul style={snapList}>
                      {observed.map((n, i) => (
                        <li key={i}>{n.content} <span style={src}>({n.source})</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {snap.computed && (
                  <>
                    <div style={snapHead}>Figures computed in code, not by the model</div>
                    <pre style={pre}>{snap.computed}</pre>
                  </>
                )}
                {rules.length === 0 && observed.length === 0 && !snap.computed && (
                  <div style={{ ...snapHead, fontWeight: 400 }}>Nothing beyond the task itself.</div>
                )}
              </details>
            )}
          </div>
        );
      })}

      <h2 style={h2}>Everything on the record for this job</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <tbody>
            {log.length === 0 && (
              <tr><td style={{ padding: "10px 8px", color: "#666" }}>Nothing logged yet.</td></tr>
            )}
            {log.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={tdTime}>{TIME.format(new Date(e.created_at))}</td>
                <td style={tdActor}>{e.actor}</td>
                <td style={{ padding: "6px 8px", color: STATE_COLOR[e.action] ?? "#333", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {e.action}
                </td>
                <td style={{ padding: "6px 8px", color: "#555", overflowWrap: "break-word" }}>
                  {e.reason ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 860, margin: "0 auto", padding: "28px 20px 64px", color: "#111",
};
const backLink: React.CSSProperties = { fontSize: 13, color: "#666" };
const h1: React.CSSProperties = { fontSize: 22, margin: "14px 0 2px", textWrap: "balance" };
const meta: React.CSSProperties = { fontSize: 13, color: "#666", margin: 0 };
const goal: React.CSSProperties = {
  fontSize: 14, color: "#333", margin: "10px 0 0", maxWidth: "65ch", overflowWrap: "break-word",
};
const h2: React.CSSProperties = {
  fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "#666", margin: "30px 0 10px", fontWeight: 600,
};
const empty: React.CSSProperties = { color: "#666", fontSize: 13 };
const card: React.CSSProperties = {
  border: "1px solid #949494", borderRadius: 10, padding: "12px 14px", marginBottom: 10,
};
const cardHead: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap",
};
const pill: React.CSSProperties = {
  fontSize: 11, color: "#555", border: "1px solid #949494", borderRadius: 999,
  padding: "1px 8px", whiteSpace: "nowrap",
};
const intent: React.CSSProperties = { fontSize: 13, color: "#555", margin: "6px 0 0" };
const longText: React.CSSProperties = {
  fontSize: 13, whiteSpace: "pre-wrap", color: "#333", marginTop: 10,
  overflowWrap: "break-word", minWidth: 0,
};
const missing: React.CSSProperties = { fontSize: 12, color: "#b45309", marginTop: 8 };
const decision: React.CSSProperties = {
  fontSize: 13, color: "#333", marginTop: 10, paddingTop: 8, borderTop: "1px solid #eee",
};
const details: React.CSSProperties = { marginTop: 10 };
const summary: React.CSSProperties = { fontSize: 12.5, color: "#4338ca", cursor: "pointer" };
const snapHead: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#555", margin: "10px 0 4px",
};
const snapList: React.CSSProperties = { fontSize: 12.5, color: "#444", paddingLeft: 18, margin: 0 };
const src: React.CSSProperties = { color: "#666" };
const pre: React.CSSProperties = {
  fontSize: 12, background: "#f5f5f5", padding: "8px 10px", borderRadius: 6,
  overflowX: "auto", whiteSpace: "pre-wrap", overflowWrap: "break-word",
};
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const tdTime: React.CSSProperties = {
  padding: "6px 8px", color: "#666", whiteSpace: "nowrap", width: 78,
  fontVariantNumeric: "tabular-nums",
};
const tdActor: React.CSSProperties = { padding: "6px 8px", whiteSpace: "nowrap", width: 190 };
