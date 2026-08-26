// Open a case: give it a goal, the orchestrator plans it, the runner starts it.
//
//   POST /api/cases   { "goal": "...", "kind": "sourcing" }
//
// Guarded by the operator key: cases create approvals and push to a phone.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { serverDb } from "../../../context/buildContext";
import { openCase, advanceCase } from "../../../agents/runner";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.DASHBOARD_KEY;
  if (!key || req.headers.get("x-demo-key") !== key) {
    return new NextResponse("not found", { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const goal = String(body.goal ?? "").trim();
  if (!goal) return NextResponse.json({ error: "goal required" }, { status: 400 });

  const db = serverDb();
  const opened = await openCase(db, {
    businessKey: process.env.BUSINESS_KEY ?? "demo-import",
    kind: String(body.kind ?? "general"),
    goal,
    counterparty: body.counterparty ? String(body.counterparty) : null,
    data: typeof body.data === "object" && body.data ? body.data : {},
    openedBy: "operator",
  });
  if (!opened) return NextResponse.json({ error: "could not plan this goal" }, { status: 422 });

  // Planning is fast; working the case is not. Answer with the plan, then run.
  const work = advanceCase(db, opened.caseId, process.env.LINE_OWNER_USER_ID ?? null)
    .catch((err) => console.error("[cases] advance failed", err));
  try { waitUntil(work); } catch { await work; }

  return NextResponse.json(opened);
}

export async function GET(req: NextRequest) {
  const key = process.env.DASHBOARD_KEY;
  if (!key || req.nextUrl.searchParams.get("key") !== key) {
    return new NextResponse("not found", { status: 404 });
  }
  const db = serverDb();
  const { data: cases } = await db
    .from("cases").select("id,title,goal,state,kind,updated_at")
    .order("updated_at", { ascending: false }).limit(10);
  const { data: steps } = await db
    .from("case_steps").select("case_id,seq,role_key,action_type,intent,status")
    .order("seq");
  return NextResponse.json({ cases, steps });
}
