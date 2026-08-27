// The brain has been read-only. That is the difference between a system that
// works today and one that gets better: right now every conversation starts
// from the same seeded facts, and nothing an agent learns survives it.
//
// After a decision, we write back what was learned about the counterparty:
// what they ordered, what they pushed back on, what we promised. Those notes
// become context for the next conversation.
//
// Two rules. Facts only, never opinions the owner did not approve. And every
// learned fact records where it came from, so a wrong one can be traced and
// removed rather than quietly poisoning future drafts.

import { SupabaseClient } from "@supabase/supabase-js";

export interface LearnedFact {
  tags: string[];
  content: string;
}

const SYSTEM = [
  "You extract durable facts about a counterparty from one interaction.",
  "",
  'Reply with JSON only: {"facts": [{"tags": ["history"], "content": "..."}]}',
  "",
  "A durable fact is something still true next month and useful next time:",
  "- what they buy, in what sizes and quantities",
  "- terms they asked for or refused",
  "- constraints they stated (budget, deadline, port, certification)",
  "- how they behave (pays late, always negotiates, wants Chinese)",
  "",
  "NOT durable, never return these:",
  "- what happened in this one message (that is in the log already)",
  "- anything you are guessing at",
  "- opinions about whether they are a good customer",
  "- prices we quoted (they change; they are in the approval record)",
  "",
  "Return an empty list if nothing here will matter next month. That is the",
  "normal case. Most interactions teach you nothing.",
].join("\n");

/**
 * The tags each business's roles actually subscribe to. A fact tagged anything
 * else is retrievable by nobody, because buildContext selects on tag overlap.
 * The two businesses have different vocabularies, so this is per-business.
 */
export async function tagVocabulary(
  db: SupabaseClient,
  businessId: string
): Promise<string[]> {
  const { data } = await db
    .from("agent_roles").select("context_tags").eq("business_id", businessId);
  const all = new Set<string>();
  for (const r of (data ?? []) as { context_tags: string[] }[]) {
    for (const t of r.context_tags ?? []) all.add(t);
  }
  return [...all].sort();
}

/** Keep only tags a role can actually retrieve; fall back to one that exists. */
export function validateTags(tags: unknown, vocabulary: string[]): string[] {
  const allowed = new Set(vocabulary);
  const kept = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string" && allowed.has(t)).slice(0, 2)
    : [];

  // Everything learned is, by definition, history. Union it in rather than
  // treating it as a fallback: a fact tagged only "pricing" validates fine and
  // is still invisible to relationship_memory, which subscribes to
  // suppliers and history.
  const out = [...kept];
  if (vocabulary.includes("history") && !out.includes("history")) out.push("history");
  if (out.length) return out.slice(0, 3);
  return vocabulary.slice(0, 1);
}

export async function extractFacts(
  interaction: string,
  vocabulary: string[]
): Promise<LearnedFact[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              SYSTEM +
              "\n\nTag each fact with one or more of EXACTLY these, and nothing else:\n" +
              vocabulary.join(", ") +
              "\nA tag outside that list makes the fact unreadable. If none fits, use history.",
          },
          { role: "user", content: interaction.slice(0, 3000) },
        ],
      }),
    });
    if (!res.ok) return [];
    const j = await res.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    if (!Array.isArray(parsed.facts)) return [];
    return parsed.facts
      .filter((f: unknown): f is LearnedFact =>
        !!f && typeof f === "object" &&
        typeof (f as LearnedFact).content === "string" &&
        (f as LearnedFact).content.trim().length > 8)
      .slice(0, 4) // a single interaction should not teach us five new things
      .map((f: LearnedFact) => ({
        tags: validateTags(f.tags, vocabulary),
        content: f.content.trim(),
      }));
  } catch {
    return []; // learning is never allowed to break the reply
  }
}

/** Write learned facts to the brain, skipping ones we already know. */
export async function remember(
  db: SupabaseClient,
  businessKey: string,
  counterparty: string,
  interaction: string
): Promise<number> {
  const { data: business } = await db
    .from("businesses").select("id").eq("key", businessKey).single();
  if (!business) return 0;

  const vocabulary = await tagVocabulary(db, business.id);
  const facts = await extractFacts(interaction, vocabulary);
  if (!facts.length) return 0;

  const { data: existing } = await db
    .from("context_notes").select("content").eq("business_id", business.id);
  const known = new Set((existing ?? []).map((n: { content: string }) => n.content.toLowerCase().trim()));

  const fresh = facts.filter((f) => !known.has(f.content.toLowerCase().trim()));
  if (!fresh.length) return 0;

  await db.from("context_notes").insert(
    fresh.map((f) => ({
      business_id: business.id,
      tags: f.tags,
      content: f.content,
      source: `learned from ${counterparty}`,
    }))
  );

  await db.from("decision_log").insert({
    business_id: business.id,
    actor: "agent:relationship_memory",
    action: "learned",
    reason: fresh.map((f) => f.content).join(" · ").slice(0, 300),
    meta: { counterparty, count: fresh.length },
  });

  return fresh.length;
}
