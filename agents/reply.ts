// Replies coming back in.
//
// A sourcing case sends an RFQ and then waits. Until now it waited forever:
// the engine had an `awaiting_reply` state that nothing ever set and nothing
// ever cleared. A supplier answering is the other half of asking.
//
// A reply is read into structured fields so later steps can compare offers
// like for like, rather than three agents each re-reading the same email.

import { SupabaseClient } from "@supabase/supabase-js";
import { advanceCase } from "./runner";
import { tagVocabulary, validateTags } from "./remember";
import type { CaseStep } from "../context/types";

export interface ParsedReply {
  supplier: string | null;
  unit_price: number | null;
  currency: string | null;
  moq: number | null;
  lead_time_days: number | null;
  incoterm: string | null;
  notes: string | null;
  missing: string[];
}

const SYSTEM = [
  "Read a supplier's reply to a request for quotation and pull out the terms.",
  "",
  'Reply with JSON only: {"supplier": string|null, "unit_price": number|null,',
  '"currency": string|null, "moq": number|null, "lead_time_days": number|null,',
  '"incoterm": string|null, "notes": string|null, "missing": string[]}',
  "",
  "- unit_price is a number only, no currency symbol, no thousands separator.",
  "- lead_time_days: if they say a range, take the LONGER end. If they say",
  "  weeks, convert. If they do not say, null.",
  "- missing: which of unit price, MOQ, lead time and incoterm they did not",
  "  give. A quote is not comparable until all four are known.",
  "- Never infer a number they did not write. Absent means null, not a guess.",
  "- notes: anything a buyer would want to know that is not one of the fields",
  "  (certification, substitutions, validity, conditions). One or two lines.",
].join("\n");

export async function parseReply(body: string): Promise<ParsedReply> {
  const empty: ParsedReply = {
    supplier: null, unit_price: null, currency: null, moq: null,
    lead_time_days: null, incoterm: null, notes: null,
    missing: ["unit price", "MOQ", "lead time", "incoterm"],
  };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return empty;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: body.slice(0, 4000) },
        ],
      }),
    });
    if (!res.ok) return empty;
    const j = await res.json();
    const o = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    // A supplier saying "no minimum" is MOQ 1, not 0. Zero reads as "unknown"
    // downstream and made the comparison say MOQ 1 anyway, from a different
    // guess. Decide it here, once.
    const rawMoq = num(o.moq);
    const moq = rawMoq === 0 ? 1 : rawMoq;

    return {
      supplier: str(o.supplier),
      unit_price: num(o.unit_price),
      currency: str(o.currency),
      moq,
      lead_time_days: num(o.lead_time_days),
      incoterm: str(o.incoterm),
      notes: str(o.notes),
      missing: Array.isArray(o.missing)
        ? o.missing.filter((m: unknown): m is string => typeof m === "string")
        : [],
    };
  } catch {
    return empty;
  }
}

/**
 * Turn one parsed reply into durable facts about that supplier.
 *
 * These come from the structured fields, not from prose, so they are cheap and
 * consistent: did they quote completely, what lead time do they actually
 * state, what is their real minimum, and how fast did they answer. Two or
 * three short facts per reply, not one per field.
 *
 * Tagged `suppliers` and `history` on purpose: those are the tags `ops_po` and
 * `relationship_memory` subscribe to, so the next sourcing case can read them.
 */
async function rememberSupplier(
  db: SupabaseClient,
  businessId: string,
  supplierName: string,
  parsed: ParsedReply,
  hoursToReply: number | null
): Promise<number> {
  const facts: string[] = [];

  if (parsed.missing.length) {
    facts.push(
      `${supplierName} quoted without giving ${parsed.missing.join(" or ")}. ` +
      `Ask for it up front next time; a quote is not comparable without it.`
    );
  } else if (parsed.unit_price !== null) {
    facts.push(`${supplierName} gives complete quotes: price, MOQ, lead time and incoterm together.`);
  }

  if (parsed.lead_time_days !== null) {
    facts.push(`${supplierName} states a lead time of about ${parsed.lead_time_days} days.`);
  }
  if (parsed.moq !== null && parsed.moq > 1) {
    facts.push(`${supplierName} has a minimum order of ${parsed.moq}.`);
  }
  if (hoursToReply !== null && hoursToReply >= 0) {
    const speed = hoursToReply < 24 ? "within a day" : `after about ${Math.round(hoursToReply / 24)} days`;
    facts.push(`${supplierName} answered a request for quotation ${speed}.`);
  }
  if (parsed.notes) {
    facts.push(`${supplierName}: ${parsed.notes}`);
  }
  if (!facts.length) return 0;

  const vocabulary = await tagVocabulary(db, businessId);
  const tags = validateTags(["suppliers", "history"], vocabulary);

  const { data: existing } = await db
    .from("context_notes").select("content").eq("business_id", businessId);
  const known = new Set(
    (existing ?? []).map((n: { content: string }) => n.content.toLowerCase().trim())
  );
  const fresh = facts.filter((c) => !known.has(c.toLowerCase().trim())).slice(0, 4);
  if (!fresh.length) return 0;

  await db.from("context_notes").insert(
    fresh.map((content) => ({
      business_id: businessId, tags, content,
      source: `learned from ${supplierName}`,
    }))
  );

  await db.from("decision_log").insert({
    business_id: businessId,
    actor: "agent:relationship_memory",
    action: "learned",
    reason: fresh.join(" · ").slice(0, 300),
    meta: { counterparty: supplierName, count: fresh.length },
  });

  return fresh.length;
}

/**
 * Take a reply, attach it to the case, and work the case forward if it now has
 * everything it was waiting for.
 */
export async function ingestReply(
  db: SupabaseClient,
  args: {
    caseId: string;
    from: string;
    body: string;
    ownerUserId?: string | null;
    force?: boolean; // stop waiting even if not everyone has answered
  }
): Promise<{ parsed: ParsedReply; advanced: boolean; waitingFor: number }> {
  const { data: kase } = await db
    .from("cases").select("*").eq("id", args.caseId).single();
  if (!kase) throw new Error("case not found");

  const parsed = await parseReply(args.body);

  const replies = Array.isArray(kase.data?.replies) ? kase.data.replies : [];
  const next = [...replies, { from: args.from, received_at: new Date().toISOString(), ...parsed }];

  await db.from("cases").update({
    data: { ...(kase.data ?? {}), replies: next },
    updated_at: new Date().toISOString(),
  }).eq("id", args.caseId);

  // What this reply teaches us about the supplier, kept beyond this case.
  const supplierName = args.from;
  const rfqSentAt = typeof kase.data?.rfq_sent_at === "string" ? kase.data.rfq_sent_at : null;
  const hoursToReply = rfqSentAt
    ? (Date.now() - new Date(rfqSentAt).getTime()) / 36e5
    : null;
  try {
    await rememberSupplier(db, kase.business_id, supplierName, parsed, hoursToReply);
  } catch (err) {
    console.error("[reply] could not record what this teaches us", err);
  }

  await db.from("decision_log").insert({
    business_id: kase.business_id,
    actor: "system",
    action: "reply_received",
    reason: parsed.unit_price
      ? `${parsed.supplier ?? args.from}: ${parsed.currency ?? ""} ${parsed.unit_price}` +
        (parsed.missing.length ? ` (still missing: ${parsed.missing.join(", ")})` : "")
      : `${args.from}: no price given`,
    meta: { case_id: args.caseId },
  });

  // How many were we expecting? One per supplier we wrote to.
  const { data: business } = await db
    .from("businesses").select("config").eq("id", kase.business_id).single();
  const suppliers = (((business?.config as { contacts?: { role: string }[] } | null)?.contacts ?? [])
    .filter((c) => c.role === "supplier").length) || 1;
  const waitingFor = Math.max(0, suppliers - next.length);

  const { data: steps } = await db
    .from("case_steps").select("*").eq("case_id", args.caseId).order("seq");
  const waiting = ((steps ?? []) as CaseStep[]).find((s) => s.status === "awaiting_reply");

  if (waiting && (args.force || waitingFor === 0)) {
    await db.from("case_steps").update({
      status: "done",
      output: { replies: next.length, note: args.force ? "moved on before everyone replied" : "all replies in" },
      completed_at: new Date().toISOString(),
    }).eq("id", waiting.id);
    await db.from("cases").update({ state: "running" }).eq("id", args.caseId);
    await advanceCase(db, args.caseId, args.ownerUserId ?? null);
    return { parsed, advanced: true, waitingFor: 0 };
  }

  return { parsed, advanced: false, waitingFor };
}
