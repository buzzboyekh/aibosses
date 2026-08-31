// Pull the orderable facts out of a customer message. One cheap call, no
// prose, no arithmetic: just what did they ask for, so code can price it.

export interface QuoteRequest {
  /** The line being ordered, matched against price_list[].size in the business
   *  config. Still called `size` because that is the key the pricing engine
   *  keys on; for a food business it holds the ingredient name. */
  size: string | null;
  quantity: number | null;
  destination: string | null;
  currency: string | null;
}

const SYSTEM = [
  "Extract what a kitchen is asking to buy. Reply with JSON only:",
  '{"size": string|null, "quantity": number|null, "destination": string|null, "currency": string|null}',
  "- size: the ingredient being ordered, as its common Chinese name and nothing",
  "  else (石斑魚, 白蝦, 台灣鯛魚片, 高麗菜, 溫體豬後腿肉, 池上米), or null.",
  "  Drop any grade, cut or packaging words around it.",
  "- quantity: the number of kilograms or units, or null",
  "- destination: the restaurant, hotel or delivery address, or null",
  "- currency: TWD or USD if they named one, else null",
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
