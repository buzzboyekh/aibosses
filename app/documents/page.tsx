// /documents — stage 2: upload -> Storage -> real OpenAI extraction ->
// `documents` row. On a completed invoice/packing-list pair, a mismatch is
// compared deterministically (documents/compare.ts) and, if real, handed to
// the doc_check agent to draft a customer notice for the owner to approve.

import { listRecentDocuments, type DocumentRow } from "./actions";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocumentsPage() {
  // Loading the recent-documents list is a read, not something the operator
  // triggers — a failure here (a DB blip, a schema mismatch) must not take
  // down the whole page, including the upload form above it, which doesn't
  // depend on this call at all.
  let docs: DocumentRow[] = [];
  let listError: string | null = null;
  try {
    docs = await listRecentDocuments();
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>收貨核對 Document Check</h1>
      <p style={{ color: "#666", marginTop: 4, fontSize: 14 }}>
        上傳送貨單跟請款單，AI 自動讀欄位並互相比對；同一個訂單參考碼的兩份文件對不上時，
        會草擬一封通知供應商的訊息送到老闆的 LINE 等待核准。
      </p>

      <h2 style={sectionStyle}>上傳文件</h2>
      <UploadForm />

      <h2 style={sectionStyle}>最近上傳的文件</h2>
      {listError ? (
        <p style={{ ...emptyStyle, borderColor: "#fecaca", color: "#b91c1c" }}>{listError}</p>
      ) : docs.length === 0 ? (
        <p style={emptyStyle}>還沒有任何文件。上面傳一份試試看。</p>
      ) : (
        docs.map((d) => <DocumentCard key={d.id} doc={d} />)
      )}
    </main>
  );
}

// `extracted` is `Record<string, unknown> | null` — historical rows aren't
// guaranteed to match documents/types.ts's ExtractedDoc exactly, so this
// reads defensively rather than casting. A render-time crash on this list
// is itself a stability risk.
function DocumentCard({ doc }: { doc: DocumentRow }) {
  const e = (doc.extracted ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const missing = Array.isArray(e.missing_fields) ? e.missing_fields.filter((m) => typeof m === "string") : [];
  const lineItemCount = Array.isArray(e.line_items) ? e.line_items.length : 0;

  const parts = [
    str(e.seller) && `賣方 ${str(e.seller)}`,
    str(e.buyer) && `買方 ${str(e.buyer)}`,
    str(e.invoice_number) && `單號 ${str(e.invoice_number)}`,
    str(e.date) && `日期 ${str(e.date)}`,
    num(e.packages) !== null && `${num(e.packages)} 箱`,
    num(e.gross_weight) !== null && `${num(e.gross_weight)}${str(e.gross_weight_unit) ?? ""}`,
    lineItemCount > 0 && `${lineItemCount} 個品項`,
  ].filter(Boolean);

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600 }}>
        {doc.order_ref ?? "（無訂單參考碼）"} · {doc.doc_type}
      </div>
      <div style={{ fontSize: 12, color: "#666", margin: "4px 0 8px" }}>
        {new Date(doc.created_at).toLocaleString("zh-TW")} · {doc.storage_path}
      </div>
      {doc.extracted ? (
        <div style={{ fontSize: 13 }}>
          {parts.length > 0 ? parts.join(" · ") : "（沒有讀到任何欄位）"}
          {missing.length > 0 && (
            <div style={{ color: "#b45309", marginTop: 4 }}>缺漏欄位：{missing.join("、")}</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#999" }}>(extracted 是 null)</div>
      )}
      {doc.extracted && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: "#888", cursor: "pointer" }}>原始 JSON</summary>
          <pre
            style={{
              fontSize: 12,
              background: "#f7f7f7",
              padding: 8,
              borderRadius: 6,
              overflowX: "auto",
              margin: "6px 0 0",
            }}
          >
            {JSON.stringify(doc.extracted, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "#888", margin: "28px 0 10px", fontWeight: 600,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5", borderRadius: 10, padding: "14px 16px", marginBottom: 10,
};
const emptyStyle: React.CSSProperties = {
  border: "1px dashed #ccc", borderRadius: 10, padding: 18,
  textAlign: "center", color: "#888", fontSize: 13,
};
