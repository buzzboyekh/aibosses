// The one rule of the context system: agents never read the database directly.
// Every agent call goes through buildContext(), and the snapshot it returns is
// stored on the approval row — so every decision is reconstructable later,
// including what the agent knew at the time.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentRole,
  Business,
  BuiltContext,
  ContextNote,
  ContextSnapshot,
  DocumentRecord,
} from "./types";

// Server-side only. The service key must never reach the browser.
export function serverDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

const RECENT_DOCS = 10;

export async function buildContext(
  db: SupabaseClient,
  businessKey: string,
  roleKey: string,
  task: string
): Promise<BuiltContext> {
  const { data: business, error: bErr } = await db
    .from("businesses").select("*").eq("key", businessKey).single();
  if (bErr || !business) throw new Error(`business not found: ${businessKey}`);

  const { data: role, error: rErr } = await db
    .from("agent_roles").select("*")
    .eq("business_id", business.id).eq("key", roleKey).single();
  if (rErr || !role) throw new Error(`role not found: ${roleKey}`);

  // Facts this role is allowed to know: tag overlap.
  const { data: notes } = await db
    .from("context_notes").select("*")
    .eq("business_id", business.id)
    .overlaps("tags", role.context_tags)
    .order("created_at", { ascending: false })
    .limit(20);

  // Recent extracted documents (the working set for import/export flows).
  const { data: docs } = await db
    .from("documents").select("id, doc_type, extracted, created_at")
    .eq("business_id", business.id)
    .not("extracted", "is", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_DOCS);

  // The queries above select a subset of columns, so these rows are NOT full
  // ContextNote / DocumentRecord objects. Type them as what was actually asked for.
  type NoteRow = Pick<ContextNote, "tags" | "content">;
  type DocRow = Pick<DocumentRecord, "id" | "doc_type" | "extracted">;

  const snapshot: ContextSnapshot = {
    role_key: role.key,
    business_key: business.key,
    task,
    notes: (notes ?? []).map((n: NoteRow) => ({ tags: n.tags, content: n.content })),
    documents: (docs ?? []).map((d: DocRow) => ({
      id: d.id, doc_type: d.doc_type, extracted: d.extracted,
    })),
    assembled_at: new Date().toISOString(),
  };

  const contextBlock = [
    `# Business: ${business.name}`,
    `# Task\n${task}`,
    `# Business facts you must respect`,
    ...snapshot.notes.map((n) => `- [${n.tags.join(",")}] ${n.content}`),
    `# Recent documents (extracted)`,
    ...snapshot.documents.map(
      (d) => `- ${d.doc_type} ${d.id}: ${JSON.stringify(d.extracted)}`
    ),
  ].join("\n");

  return {
    systemPrompt: role.system_prompt,
    contextBlock,
    snapshot,
    role: role as AgentRole,
    business: business as Business,
  };
}
