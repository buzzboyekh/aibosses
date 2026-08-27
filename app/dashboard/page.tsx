// Mission control: the approval queue and the audit trail on one page.
// Deliberately two tables and nothing else — this is what gets shown on stage
// while the operator taps Approve on his phone.

import { notFound } from "next/navigation";
import { serverDb } from "../../context/buildContext";

export const dynamic = "force-dynamic"; // always live, never a cached snapshot
export const revalidate = 0;

type Approval = {
  id: string; title: string; action_type: string; state: string;
  decided_by: string | null; created_at: string;
  payload: { body?: string; missing?: string[] };
};
type LogRow = {
  id: number; actor: string; action: string;
  reason: string | null; created_at: string;
};
type CaseRow = {
  id: string; title: string; goal: string; state: string; kind: string; updated_at: string;
};
type StepRow = {
  case_id: string; seq: number; role_key: string; action_type: string | null;
  intent: string; status: string;
};
type Role = {
  key: string; name: string; autonomy_level: number;
  clean_approvals: number; promote_threshold: number;
};

const STATE_COLOR: Record<string, string> = {
  pending_approval: "#b45309",
  approved: "#047857",
  executed: "#047857",
  auto_executed: "#4338ca",
  rejected: "#b91c1c",
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  // This page renders customer quotes, supplier terms and the full audit
  // trail with a service-role client, so it must not be world-readable: the
  // production URL ends up on a slide and in the public SITCON archive.
  const expected = process.env.DASHBOARD_KEY;
  if (!expected || searchParams?.key !== expected) notFound();

  const db = serverDb();
  const [{ data: approvals }, { data: log }, { data: roles }, { data: cases }, { data: steps }] = await Promise.all([
    db.from("approvals").select("id,title,action_type,state,decided_by,created_at,payload")
      .order("created_at", { ascending: false }).limit(15),
    db.from("decision_log").select("id,actor,action,reason,created_at")
      .order("id", { ascending: false }).limit(60),
    db.from("agent_roles").select("key,name,autonomy_level,clean_approvals,promote_threshold")
      .order("key"),
    db.from("cases").select("id,title,goal,state,kind,updated_at")
      .order("updated_at", { ascending: false }).limit(6),
    db.from("case_steps").select("case_id,seq,role_key,action_type,intent,status")
      .order("seq"),
  ]);

  const pending = (approvals ?? []).filter((a: Approval) => a.state === "pending_approval");

  // The log is append-only, so a reset writes a marker rather than deleting.
  // Show this session; older history is still in the table.
  const allLog = (log ?? []) as LogRow[];
  const markerAt = allLog.findIndex((e) => e.action === "session_reset");
  const sessionLog = markerAt === -1 ? allLog : allLog.slice(0, markerAt);
  const earlier = markerAt === -1 ? 0 : allLog.length - markerAt - 1;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 20px 64px", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Mission Control</h1>
      <p style={{ color: "#666", marginTop: 4, fontSize: 14 }}>
        Demo Import Trading Co. · {pending.length} waiting on you
      </p>

      <h2 style={sectionStyle}>The workforce</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {(roles ?? []).map((r: Role) => (
          <div key={r.key} style={cardStyle}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              {r.autonomy_level === 1 ? (
                <span style={{ color: "#4338ca", fontWeight: 600 }}>Level 1 · acts alone</span>
              ) : (
                <>Level 0 · drafts only · {r.clean_approvals}/{r.promote_threshold} to promotion</>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={sectionStyle}>
        Jobs
        <span style={{ ...hintStyle }}>work that takes more than one step</span>
      </h2>
      {(cases ?? []).length === 0 ? (
        <p style={emptyStyle}>
          No jobs open. Give the company a goal and it will plan the steps itself.
        </p>
      ) : (
        (cases as CaseRow[]).map((c) => {
          const mine = ((steps ?? []) as StepRow[]).filter((s) => s.case_id === c.id);
          const done = mine.filter((s) => s.status === "done").length;
          return (
            <div key={c.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{c.title}</span>
                <span style={{ fontSize: 12, color: CASE_COLOR[c.state] ?? "#666", fontWeight: 600 }}>
                  {c.state} · {done}/{mine.length}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#666", margin: "4px 0 10px" }}>{c.goal}</div>
              {mine.map((s) => (
                <div key={s.seq} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
                  <span style={{ width: 16, color: STEP_COLOR[s.status] ?? "#999" }}>
                    {STEP_MARK[s.status] ?? "?"}
                  </span>
                  <span style={{ width: 150, color: "#555" }}>{s.role_key}</span>
                  <span style={{ flex: 1, color: "#333" }}>
                    {s.intent}
                    {s.action_type ? null : (
                      <span style={{ color: "#999" }}> · internal, no approval needed</span>
                    )}
                  </span>
                  {s.status === "awaiting_approval" && (
                    <span style={{ color: "#b45309", whiteSpace: "nowrap" }}>waiting on you</span>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}

      <h2 style={sectionStyle}>Approval queue</h2>
      {pending.length === 0 ? (
        <p style={emptyStyle}>Nothing waiting. Drafts land here before anything is sent.</p>
      ) : (
        pending.map((a: Approval) => (
          <div key={a.id} style={cardStyle}>
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            <div style={{ fontSize: 12, color: "#666", margin: "4px 0 8px" }}>
              {a.action_type} · {time(a.created_at)}
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#333" }}>
              {(a.payload?.body ?? "").slice(0, 400)}
            </div>
            {a.payload?.missing?.length ? (
              <div style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>
                Agent flagged missing: {a.payload.missing.join("; ")}
              </div>
            ) : null}
          </div>
        ))
      )}

      <h2 style={sectionStyle}>Decision log</h2>
      <p style={{ fontSize: 12, color: "#666", marginTop: -6 }}>
        Append-only. Every action, who took it, and why.
        {earlier > 0 ? ` Showing this session; ${earlier} earlier entries are kept below the last reset.` : ""}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {sessionLog.map((e: LogRow) => (
            <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "7px 8px", color: "#888", whiteSpace: "nowrap", width: 70 }}>
                {time(e.created_at)}
              </td>
              <td style={{ padding: "7px 8px", whiteSpace: "nowrap", width: 150 }}>{e.actor}</td>
              <td style={{ padding: "7px 8px", width: 110 }}>
                <span style={{ color: STATE_COLOR[e.action] ?? "#333", fontWeight: 600 }}>
                  {e.action}
                </span>
              </td>
              <td style={{ padding: "7px 8px", color: "#555" }}>{e.reason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const STEP_MARK: Record<string, string> = {
  done: "✓", running: "•", awaiting_approval: "⏸", awaiting_reply: "⏳",
  pending: "·", failed: "✕", skipped: "–",
};
const STEP_COLOR: Record<string, string> = {
  done: "#047857", awaiting_approval: "#b45309", failed: "#b91c1c", running: "#4338ca",
};
const CASE_COLOR: Record<string, string> = {
  running: "#4338ca", waiting: "#b45309", done: "#047857", blocked: "#b91c1c",
};
const hintStyle: React.CSSProperties = {
  textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "#aaa", marginLeft: 10,
};
const sectionStyle: React.CSSProperties = {
  fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "#888", margin: "28px 0 10px", fontWeight: 600,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5", borderRadius: 10, padding: "12px 14px", marginBottom: 10,
};
const emptyStyle: React.CSSProperties = {
  border: "1px dashed #ccc", borderRadius: 10, padding: 18,
  textAlign: "center", color: "#888", fontSize: 13,
};
