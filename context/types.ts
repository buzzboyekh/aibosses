// Chill Agent — shared contract for the context system.
// This file is the fence between the three workstreams: backend, frontend,
// and agents all import these types. Change it only via PR.

export type ApprovalState =
  | "drafted"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "auto_executed";

export type ActionType =
  // Outbound Communication
  | "send_quote"           // reply to a customer inquiry with a quote
  | "send_customer_email"  // any other outbound customer message
  // Sourcing & Negotiation
  | "send_rfq"             // ask suppliers to quote
  | "send_po"              // purchase order to a supplier
  // Document Intelligence
  | "flag_doc_mismatch"    // documents disagree; drafts the notice
  | "suggest_hs_code"      // suggestion only, never a duty amount
  // Monitoring & Exceptions
  | "send_status_update"   // proactive update before the customer asks
  | "propose_reroute"      // a lane is broken; propose an alternative
  // Relationship Memory
  | "flag_supplier_risk"   // a counterparty is behaving badly
  // Orchestration
  | "escalate_to_owner";   // does not fit any capability; a human decides

export type DocType =
  | "rfq"
  | "supplier_quote"
  | "commercial_invoice"
  | "packing_list"
  | "other";

export interface Business {
  id: string;
  key: string;
  name: string;
  config: Record<string, unknown>;
  created_at: string;
}

export interface AgentRole {
  id: string;
  business_id: string;
  key: string;
  name: string;
  system_prompt: string;
  action_types: ActionType[];
  context_tags: string[];
  autonomy_level: 0 | 1;
  promote_threshold: number;
  clean_approvals: number;
}

export interface Approval {
  id: string;
  business_id: string;
  role_id: string;
  action_type: ActionType;
  title: string;
  payload: Record<string, unknown>;
  context_snapshot: ContextSnapshot;
  state: ApprovalState;
  decided_by: "owner" | "auto" | null;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
}

export interface DecisionLogEntry {
  id: number;
  business_id: string;
  actor: string; // 'agent:<roleKey>' | 'owner' | 'system'
  action:
    | "routed"
    | "drafted"
    | "approved"
    | "rejected"
    | "executed"
    | "promoted"
    | "demoted"
    | "auto_executed";
  reason: string | null;
  approval_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  business_id: string;
  storage_path: string;
  doc_type: DocType;
  extracted: Record<string, unknown> | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ContextNote {
  id: string;
  business_id: string;
  tags: string[];
  content: string;
  source: string | null;
  created_at: string;
}

/** Exactly what the agent knew when it drafted. Stored on the approval row. */
export interface ContextSnapshot {
  role_key: string;
  business_key: string;
  task: string;
  notes: Pick<ContextNote, "tags" | "content">[];
  documents: Pick<DocumentRecord, "id" | "doc_type" | "extracted">[];
  /** Figures computed in code and handed to the model, kept so a quote can be audited. */
  computed?: string;
  assembled_at: string;
}

/** Return shape of buildContext() — feed straight into the LLM call. */
export interface BuiltContext {
  systemPrompt: string;
  contextBlock: string; // human-readable block injected into the user message
  snapshot: ContextSnapshot;
  role: AgentRole;
  business: Business;
}
