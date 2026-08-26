// Pull the orderable facts out of a customer message. One cheap call, no
// prose, no arithmetic: just what did they ask for, so code can price it.

export interface QuoteRequest {
  size: string | null;
  quantity: number | null;
  destination: string | null;
  currency: string | null;
}

const SYSTEM = [
  "Extract what a customer is asking to buy. Reply with JSON only:",
  '{"size": string|null, "quantity": number|null, "destination": string|null, "currency": string|null}',
  "- size: a tyre size such as 195/65R15, exactly as written, or null",
  "- quantity: a number of units, or null",
  "- destination: city or port, or null",
  "- currency: USD, GBP or TWD if they named one, else null",
  "Never guess. Anything not stated is null.",
].join("\n");

export async function extractQuoteRequest(message: string): Promise<QuoteRequest> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: message.slice(0, 1200) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`extract ${res.status}`);
  const j = await res.json();
  const raw = j.choices?.[0]?.message?.content ?? "{}";
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(raw); } catch { /* fall through to nulls */ }
  const qty = typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : null;
  return {
    size: typeof o.size === "string" && o.size.trim() ? o.size.trim() : null,
    quantity: qty,
    destination: typeof o.destination === "string" && o.destination.trim() ? o.destination.trim() : null,
    currency: typeof o.currency === "string" && o.currency.trim() ? o.currency.trim().toUpperCase() : null,
  };
}
