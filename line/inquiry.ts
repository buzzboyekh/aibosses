// Customer inquiry -> quoting agent -> approval card on the owner's phone.
// Split out so handlers.ts does not import the agent stack at module load.

import { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "../agents/run";

export async function runAgentForInquiry(
  db: SupabaseClient,
  customerUserId: string,
  message: string,
  ownerUserId: string
): Promise<void> {
  await runAgent(db, {
    businessKey: process.env.BUSINESS_KEY ?? "demo-import",
    roleKey: "sales_quote",
    actionType: "send_quote",
    task: `A customer sent this inquiry over LINE. Draft the reply with a quote.\n\nCustomer message:\n"""\n${message}\n"""`,
    notifyUserId: ownerUserId,
  });
}
