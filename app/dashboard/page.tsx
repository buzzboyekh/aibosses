// Mission control: the approval queue and the audit trail on one page.
// Deliberately two tables and nothing else — this is what gets shown on stage
// while the operator taps Approve on his phone.

import { notFound } from "next/navigation";
import { serverDb } from "../../context/buildContext";
import * as ui from "../ui";

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

// Only exceptions and outcomes are coloured. Routine operations (routed,
// drafted, planned, learned) stay neutral, so a judge scanning the log sees
// the things that went wrong rather than a wall of colour. delivery_failed
// used to render the same neutral black as a normal step, which is exactly
// backwards.
const STATE_COLOR: Record<string, string> = {
  pending_approval: ui.color.warn,
  approved: ui.color.good,
  executed: ui.color.good,
  delivered: ui.color.good,
  step_done: ui.color.good,
  auto_executed: ui.color.active,
  promoted: ui.color.active,
  demoted: ui.color.warn,
  delivery_skipped: ui.color.warn,
  rejected: ui.color.bad,
  delivery_failed: ui.color.bad,
  step_failed: ui.color.bad,
};

// Intl rather than a hardcoded format, and no fixed locale: the operator's
// own settings decide. 24-hour because this is an ops log, not a consumer app.
const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
function time(iso: string) {
  return TIME.format(new Date(iso));
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

  // Everything on this page is scoped to one business. It was not: the queries
  // asked for every row in each table, so once a second config was seeded the
  // page listed twelve agents with each capability twice — and, worse than the
  // cosmetics, mixed another company's approvals and audit trail into this
  // one's. The company name was hardcoded to the trading company for the same
  // reason; it comes from the row now.
  const { data: business } = await db
    .from("businesses").select("id,name")
    .eq("key", process.env.BUSINESS_KEY ?? "demo-import").maybeSingle();
  const businessId = (business?.id as string | undefined) ?? null;
  if (!businessId) notFound();

  const [{ data: approvals }, { data: log }, { data: roles }, { data: cases }] = await Promise.all([
    db.from("approvals").select("id,title,action_type,state,decided_by,created_at,payload")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }).limit(15),
    db.from("decision_log").select("id,actor,action,reason,created_at")
      .eq("business_id", businessId)
      .order("id", { ascending: false }).limit(60),
    db.from("agent_roles").select("key,name,autonomy_level,clean_approvals,promote_threshold")
      .eq("business_id", businessId)
      .order("key"),
    db.from("cases").select("id,title,goal,state,kind,updated_at")
      .eq("business_id", businessId)
      .order("updated_at", { ascending: false }).limit(6),
  ]);

  // case_steps has no business_id of its own, so it is scoped through the
  // cases just fetched — which also stops this from growing unbounded.
  const caseIds = ((cases ?? []) as CaseRow[]).map((c) => c.id);
  const { data: steps } = caseIds.length
    ? await db.from("case_steps").select("case_id,seq,role_key,action_type,intent,status")
        .in("case_id", caseIds).order("seq")
    : { data: [] as StepRow[] };

  const pending = (approvals ?? []).filter((a: Approval) => a.state === "pending_approval");

  // The log is append-only, so a reset writes a marker rather than deleting.
  // Show this session; older history is still in the table.
  const allLog = (log ?? []) as LogRow[];
  const markerAt = allLog.findIndex((e) => e.action === "session_reset");
  const sessionLog = markerAt === -1 ? allLog : allLog.slice(0, markerAt);
  const earlier = markerAt === -1 ? 0 : allLog.length - markerAt - 1;

  return (
    <main style={{ ...ui.page, maxWidth: 1000 }}>
      <h1 style={ui.title}>Mission Control</h1>
      <p style={{ ...ui.lede, maxWidth: "none" }}>
        {business?.name ?? "—"} ·{" "}
        <span style={{ color: pending.length ? ui.color.warn : ui.color.muted, fontWeight: 650 }}>
          {pending.length} waiting on you
        </span>
      </p>

      <h2 style={ui.section}>The workforce</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
        {(roles ?? []).map((r: Role) => (
          <div key={r.key} style={{ ...ui.card, padding: "14px 16px" }}>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{r.name}</div>
            <div style={{ ...ui.meta, marginTop: 5 }}>
              {r.autonomy_level === 1 ? (
                <span style={{ color: ui.color.active, fontWeight: 650 }}>Level 1 · acts alone</span>
              ) : (
                <>
                  Level 0 · drafts only ·{" "}
                  <span style={{ ...ui.figureSm, fontSize: 13 }}>
                    {r.clean_approvals}/{r.promote_threshold}
                  </span>{" "}
                  to promotion
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={ui.section}>
        Jobs
        <span style={hintStyle}>work that takes more than one step</span>
      </h2>
      {(cases ?? []).length === 0 ? (
        <p style={ui.empty}>
          No jobs open. Give the company a goal and it will plan the steps itself.
        </p>
      ) : (
        (cases as CaseRow[]).map((c) => {
          const mine = ((steps ?? []) as StepRow[]).filter((s) => s.case_id === c.id);
          const done = mine.filter((s) => s.status === "done").length;
          return (
            <div key={c.id} style={ui.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <a
                  href={`/case/${c.id}?key=${searchParams?.key ?? ""}`}
                  style={{ fontWeight: 650, fontSize: 16, color: ui.color.ink }}
                >
                  {c.title}
                </a>
                <span style={{ fontSize: 13, color: CASE_COLOR[c.state] ?? ui.color.muted, fontWeight: 650 }}>
                  {c.state} · <span style={{ ...ui.figureSm, fontSize: 13 }}>{done}/{mine.length}</span>
                </span>
              </div>
              <div style={{ ...ui.meta, margin: "5px 0 12px" }}>{c.goal}</div>
              {mine.map((s) => (
                <div key={s.seq} style={{ display: "flex", gap: 10, fontSize: 14, padding: "4px 0" }}>
                  <span style={{ width: 16, color: STEP_COLOR[s.status] ?? ui.color.muted }}>
                    {STEP_MARK[s.status] ?? "?"}
                  </span>
                  <span style={{ width: 160, color: ui.color.muted }}>{s.role_key}</span>
                  <span style={{ flex: 1, color: ui.color.ink, minWidth: 0, overflowWrap: "break-word" }}>
                    {s.intent}
                    {s.action_type ? null : (
                      <span style={{ color: ui.color.faint }}> · internal, no approval needed</span>
                    )}
                  </span>
                  {s.status === "awaiting_approval" && (
                    <span style={{ color: ui.color.warn, whiteSpace: "nowrap", fontWeight: 650 }}>
                      waiting on you
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}

      <h2 style={ui.section}>Approval queue</h2>
      {pending.length === 0 ? (
        <p style={ui.empty}>Nothing waiting. Drafts land here before anything is sent.</p>
      ) : (
        pending.map((a: Approval) => (
          <div key={a.id} style={{ ...ui.card, borderLeft: `4px solid ${ui.color.warn}` }}>
            <div style={{ fontWeight: 650, fontSize: 16 }}>{a.title}</div>
            <div style={{ ...ui.meta, margin: "5px 0 10px" }}>
              {a.action_type} ·{" "}
              <span style={{ ...ui.figureSm, fontSize: 13 }}>{time(a.created_at)}</span>
            </div>
            <div style={{
              ...ui.body, whiteSpace: "pre-wrap", color: ui.color.ink,
              overflowWrap: "break-word", minWidth: 0,
            }}>
              {(a.payload?.body ?? "").slice(0, 400)}
            </div>
            {a.payload?.missing?.length ? (
              <div style={{ fontSize: 13, color: ui.color.warn, marginTop: 10 }}>
                Agent flagged missing: {a.payload.missing.join("; ")}
              </div>
            ) : null}
          </div>
        ))
      )}

      {/* The close of the pitch is this table, so it gets the weight. The
          machine's own record — when, who, what — is set in mono; `reason` is
          the agent's prose and stays in the UI face, which keeps the two kinds
          of claim visually separate. */}
      <h2 style={ui.section}>Decision log</h2>
      <p style={{ ...ui.meta, marginTop: -6 }}>
        Append-only. Every action, who took it, and why.
        {earlier > 0 ? ` Showing this session; ${earlier} earlier entries are kept below the last reset.` : ""}
      </p>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {sessionLog.length === 0 && (
            <tr><td style={{ padding: "14px 8px", color: ui.color.muted }} colSpan={4}>
              Nothing yet this session. Every agent action will appear here.
            </td></tr>
          )}
          {sessionLog.map((e: LogRow) => (
            <tr key={e.id} style={{ borderBottom: `1px solid ${ui.color.line}` }}>
              <td style={{
                ...ui.figureSm, fontSize: 13, padding: "9px 8px",
                color: ui.color.muted, whiteSpace: "nowrap", width: 82,
              }}>
                {time(e.created_at)}
              </td>
              <td style={{
                ...ui.figureSm, fontSize: 13, padding: "9px 8px",
                whiteSpace: "nowrap", width: 168,
              }}>
                {e.actor}
              </td>
              <td style={{ padding: "9px 8px", width: 120 }}>
                <span style={{
                  ...ui.figureSm, fontSize: 13, fontWeight: 650,
                  color: STATE_COLOR[e.action] ?? ui.color.ink,
                }}>
                  {e.action}
                </span>
              </td>
              <td style={{ padding: "9px 8px", color: ui.color.muted, overflowWrap: "break-word" }}>
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

const STEP_MARK: Record<string, string> = {
  done: "✓", running: "•", awaiting_approval: "⏸", awaiting_reply: "⏳",
  pending: "·", failed: "✕", skipped: "–",
};
// Semantics come from app/ui.ts now, which carries forward the contrast pass
// this file had already been through: every one is >= 4.5:1 on white, and
// #888/#999/#aaa were 3.54/2.85/2.32 and failed it.
const STEP_COLOR: Record<string, string> = {
  done: ui.color.good, awaiting_approval: ui.color.warn,
  failed: ui.color.bad, running: ui.color.active,
};
const CASE_COLOR: Record<string, string> = {
  running: ui.color.active, waiting: ui.color.warn,
  done: ui.color.good, blocked: ui.color.bad,
};
const hintStyle: React.CSSProperties = {
  textTransform: "none", letterSpacing: 0, fontWeight: 400,
  color: ui.color.muted, marginLeft: 10,
};
