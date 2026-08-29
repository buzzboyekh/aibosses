// Stage 2: read an uploaded invoice or packing list with OpenAI vision and
// return the shape documents/types.ts declares. Never invents a value — any
// field the model could not read comes back null and is named in
// missing_fields (hard rule from Kun's spec, echoed in the doc_check prompt
// in db/seed.sql).

import type { DocType, ExtractedDoc, LineItem } from "./types";

const MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o";

const DOC_TYPE_LABEL: Record<DocType, string> = {
  commercial_invoice: "commercial invoice",
  packing_list: "packing list",
  rfq: "RFQ",
  supplier_quote: "supplier quote",
  other: "trade document",
};

function buildPrompt(docType: DocType): string {
  return [
    `This is a ${DOC_TYPE_LABEL[docType]} from a Taiwan import/export trading company.`,
    `Extract these fields. Reply with JSON only, no markdown fence:`,
    `{"seller": string|null, "buyer": string|null, "invoice_number": string|null, "date": string|null,`,
    ` "line_items": [{"description": string|null, "part_number": string|null, "quantity": number|null, "unit_price": number|null, "total": number|null}],`,
    ` "gross_weight": number|null, "gross_weight_unit": string|null, "packages": number|null,`,
    ` "missing_fields": string[]}`,
    `Rules:`,
    `- If a field is not on the document, use null. Never guess or estimate a value.`,
    `- List every field you could not find, in your own words, in missing_fields.`,
    `- line_items is [] if the document has no line-item table (some packing lists only show totals).`,
  ].join("\n");
}

export async function extractDocument(
  bytes: Uint8Array,
  mimeType: string,
  docType: DocType
): Promise<ExtractedDoc> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const base64 = Buffer.from(bytes).toString("base64");
  const isPdf = mimeType === "application/pdf";
  const content = isPdf
    ? [
        {
          type: "file",
          file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` },
        },
        { type: "text", text: buildPrompt(docType) },
      ]
    : [
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        { type: "text", text: buildPrompt(docType) },
      ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`文件辨識失敗 OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) throw new Error("文件辨識失敗：OpenAI 沒有回傳內容");
  return parseExtractedDoc(raw);
}

/** Same recovery trick as agents/llm.ts's parseDraft: models sometimes wrap JSON in prose. */
export function parseExtractedDoc(raw: string): ExtractedDoc {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  else {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error(`文件辨識沒有回傳合法 JSON: ${raw.slice(0, 200)}`);
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const lineItems: LineItem[] = Array.isArray(obj.line_items)
    ? obj.line_items.map((entry): LineItem => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          description: str(item.description),
          part_number: str(item.part_number),
          quantity: num(item.quantity),
          unit_price: num(item.unit_price),
          total: num(item.total),
        };
      })
    : [];

  const missing = Array.isArray(obj.missing_fields)
    ? obj.missing_fields.filter((m): m is string => typeof m === "string")
    : [];

  return {
    seller: str(obj.seller),
    buyer: str(obj.buyer),
    invoice_number: str(obj.invoice_number),
    date: str(obj.date),
    line_items: lineItems,
    gross_weight: num(obj.gross_weight),
    gross_weight_unit: str(obj.gross_weight_unit),
    packages: num(obj.packages),
    missing_fields: missing,
  };
}
