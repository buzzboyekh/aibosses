"use client";

// The first (and, as of writing, only) client component in this repo —
// needed because showing the upload's real outcome (loading, an error, or
// the actual comparison result) requires calling the server action directly
// and reading what it returns. React 18 here has no useFormStatus /
// useActionState to get that through a plain <form action={fn}>, so the
// pending/result state is hand-rolled with useTransition + useState.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument, type UploadResult } from "./actions";
import type { DocType, ExtractedDoc } from "../../documents/types";

// The stored doc_type values are unchanged (db/schema.sql's check constraint
// still governs them) — only the labels are in the language of a receiving
// dock: a delivery note IS a packing list, a請款單 IS a commercial invoice.
const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "packing_list", label: "送貨單 Delivery Note" },
  { value: "commercial_invoice", label: "請款單 / 發票 Invoice" },
  { value: "rfq", label: "詢價單 RFQ" },
  { value: "supplier_quote", label: "供應商報價 Supplier Quote" },
  { value: "other", label: "其他" },
];

// Matches next.config.mjs's serverActions.bodySizeLimit — fail fast on an
// oversized phone photo instead of letting Next's framework-level 413 reach
// the operator as a confusing rejected promise.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STAGE_LABEL: Record<string, string> = {
  config: "設定",
  upload: "檔案上傳",
  extract: "AI 讀取",
  db: "資料庫寫入",
};

export default function UploadForm() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return; // guards a fast double-Enter

    const form = e.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
    if (file && file.size > MAX_FILE_BYTES) {
      setResult({
        status: "validation_error",
        message: `檔案太大（${(file.size / 1024 / 1024).toFixed(1)}MB）。上限 10MB，換一張壓縮過的照片再試。`,
      });
      return;
    }

    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const res = await uploadDocument(formData);
        setResult(res);
        if (res.status.startsWith("success")) {
          form.reset();
          router.refresh(); // pick up the revalidated "recent documents" list below
        }
      } catch (err) {
        // A 413 (body over Next's own limit) or a network drop rejects the
        // call before any UploadResult exists — this catch is load-bearing.
        setResult({
          status: "error",
          stage: "upload",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={rowStyle}>
          <label style={labelStyle}>
            訂單參考碼
            <input
              name="order_ref"
              placeholder="例如客戶名或訂單號，用來把發票跟裝箱單配成一組"
              required
              disabled={isPending}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            文件類型
            <select name="doc_type" required disabled={isPending} style={inputStyle}>
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
          <input
            name="file"
            type="file"
            accept="application/pdf,image/*"
            required
            disabled={isPending}
            style={inputStyle}
          />
        </label>

        <button type="submit" disabled={isPending} style={isPending ? buttonStylePending : buttonStyle}>
          {isPending ? "AI 讀取中…請稍候" : "上傳並讓 AI 讀取"}
        </button>
      </form>

      {result && <ResultBanner result={result} />}
    </>
  );
}

function ResultBanner({ result }: { result: UploadResult }) {
  switch (result.status) {
    case "validation_error":
      return <div style={{ ...bannerStyle, ...amberBanner }}>{result.message}</div>;

    case "error":
      return (
        <div style={{ ...bannerStyle, ...redBanner }}>
          {STAGE_LABEL[result.stage] ?? result.stage}失敗：{result.message}
        </div>
      );

    case "success_no_pair":
      return (
        <div style={{ ...bannerStyle, ...neutralBanner }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>已儲存，AI 讀取結果如下</div>
          <Summary doc={result.extracted} />
          <div style={{ marginTop: 6, color: "#666" }}>
            尚無配對文件可比對——上傳同一個訂單參考碼的另一份文件後會自動比對。
          </div>
        </div>
      );

    case "success_pair_matched":
      return (
        <div style={{ ...bannerStyle, ...greenBanner }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>✓ 兩份文件核對一致</div>
          <Summary doc={result.extracted} />
        </div>
      );

    case "success_pair_mismatched":
      return (
        <div style={{ ...bannerStyle, ...amberBanner }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⚠ 抓到差異</div>
          {result.mismatches.map((m, i) => (
            <div key={i} style={{ fontSize: 13, margin: "3px 0" }}>
              {m.field}：請款單 {m.invoiceValue} ／ 送貨單 {m.packingListValue}
            </div>
          ))}
          <div style={{ marginTop: 8, fontWeight: 600 }}>
            {result.agentDrafted
              ? "已送出核准卡到老闆 LINE，等待確認"
              : "差異已記錄，但通知老闆失敗（文件已儲存，不影響資料）"}
          </div>
        </div>
      );
  }
}

function Summary({ doc }: { doc: ExtractedDoc }) {
  const parts = [
    doc.seller && `賣方 ${doc.seller}`,
    doc.buyer && `買方 ${doc.buyer}`,
    doc.invoice_number && `單號 ${doc.invoice_number}`,
    doc.date && `日期 ${doc.date}`,
    doc.packages !== null && `${doc.packages} 箱`,
    doc.gross_weight !== null && `${doc.gross_weight}${doc.gross_weight_unit ?? ""}`,
    doc.line_items.length > 0 && `${doc.line_items.length} 個品項`,
  ].filter(Boolean);

  return (
    <div style={{ fontSize: 13 }}>
      {parts.length > 0 ? parts.join(" · ") : "（沒有讀到任何欄位）"}
      {doc.missing_fields.length > 0 && (
        <div style={{ color: "#b45309", marginTop: 4 }}>缺漏欄位：{doc.missing_fields.join("、")}</div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5", borderRadius: 10, padding: "14px 16px", marginBottom: 10,
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
const buttonStylePending: React.CSSProperties = {
  ...buttonStyle, background: "#999", cursor: "not-allowed",
};
const bannerStyle: React.CSSProperties = {
  marginTop: 10, padding: "10px 14px", borderRadius: 8, fontSize: 14, border: "1px solid",
};
const neutralBanner: React.CSSProperties = { background: "#f7f7f7", borderColor: "#e5e5e5", color: "#333" };
const greenBanner: React.CSSProperties = { background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" };
const amberBanner: React.CSSProperties = { background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" };
const redBanner: React.CSSProperties = { background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" };
