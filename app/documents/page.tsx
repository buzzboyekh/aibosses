// /documents — stage 2: upload -> Storage -> real OpenAI extraction ->
// `documents` row. On a completed invoice/packing-list pair, a mismatch is
// compared deterministically (documents/compare.ts) and, if real, handed to
// the doc_check agent to draft a customer notice for the owner to approve.

import { uploadDocument, listRecentDocuments } from "./actions";
import type { DocType } from "../../documents/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "commercial_invoice", label: "商業發票 Commercial Invoice" },
  { value: "packing_list", label: "裝箱單 Packing List" },
  { value: "rfq", label: "RFQ" },
  { value: "supplier_quote", label: "Supplier Quote" },
  { value: "other", label: "其他" },
];

export default async function DocumentsPage() {
  const docs = await listRecentDocuments();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>文件核對 Document Check</h1>
      <p style={{ color: "#666", marginTop: 4, fontSize: 14 }}>
        上傳發票跟裝箱單，AI 自動讀欄位並互相比對；同一個訂單參考碼的兩份文件對不上時，
        會草擬一封通知客人的訊息送到老闆的 LINE 等待核准。
      </p>

      <h2 style={sectionStyle}>上傳文件</h2>
      <form action={uploadDocument} style={cardStyle}>
        <div style={rowStyle}>
          <label style={labelStyle}>
            訂單參考碼
            <input
              name="order_ref"
              placeholder="例如客戶名或訂單號，用來把發票跟裝箱單配成一組"
              required
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            文件類型
            <select name="doc_type" required style={inputStyle}>
              <option value="">請選擇</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ ...labelStyle, marginTop: 12 }}>
          檔案（PDF 或圖片）
          <input name="file" type="file" accept="application/pdf,image/*" required style={inputStyle} />
        </label>

        <button type="submit" style={buttonStyle}>
          上傳並讓 AI 讀取
        </button>
      </form>

      <h2 style={sectionStyle}>最近上傳的文件</h2>
      {docs.length === 0 ? (
        <p style={emptyStyle}>還沒有任何文件。上面傳一份試試看。</p>
      ) : (
        docs.map((d) => (
          <div key={d.id} style={cardStyle}>
            <div style={{ fontWeight: 600 }}>
              {d.order_ref ?? "（無訂單參考碼）"} · {d.doc_type}
            </div>
            <div style={{ fontSize: 12, color: "#666", margin: "4px 0 8px" }}>
              {new Date(d.created_at).toLocaleString("zh-TW")} · {d.storage_path}
            </div>
            <pre
              style={{
                fontSize: 12,
                background: "#f7f7f7",
                padding: 8,
                borderRadius: 6,
                overflowX: "auto",
                margin: 0,
              }}
            >
              {d.extracted ? JSON.stringify(d.extracted, null, 2) : "(extracted 是 null)"}
            </pre>
          </div>
        ))
      )}
    </main>
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
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4, fontSize: 12,
  color: "#555", flex: "1 1 240px",
};
const inputStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 14, border: "1px solid #ddd",
  borderRadius: 6, fontFamily: "inherit",
};
const buttonStyle: React.CSSProperties = {
  marginTop: 14, padding: "8px 16px", fontSize: 14, fontWeight: 600,
  background: "#111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
};
