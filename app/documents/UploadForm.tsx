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
import * as ui from "../ui";

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
      <form onSubmit={handleSubmit} style={ui.card}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label style={ui.label}>
            訂單參考碼
            <input
              name="order_ref"
              placeholder="例如客戶名或訂單號，用來把送貨單跟請款單配成一組"
              required
              disabled={isPending}
              style={ui.input}
            />
          </label>
          <label style={ui.label}>
            文件類型
            <select name="doc_type" required disabled={isPending} style={ui.input}>
              <option value="">請選擇</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ ...ui.label, marginTop: 14 }}>
          檔案（PDF 或圖片）
          <input
            name="file"
            type="file"
            accept="application/pdf,image/*"
            required
            disabled={isPending}
            style={ui.input}
          />
        </label>

        <button
          type="submit"
          disabled={isPending}
          style={{ ...(isPending ? ui.buttonBusy : ui.button), marginTop: 16 }}
        >
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
      return <div style={ui.bannerWarn}>{result.message}</div>;

    case "error":
      return (
        <div style={ui.bannerBad}>
          {STAGE_LABEL[result.stage] ?? result.stage}失敗：{result.message}
        </div>
      );

    case "success_no_pair":
      return (
        <div style={ui.bannerPlain}>
          <div style={{ fontWeight: 650, marginBottom: 6 }}>已儲存，AI 讀取結果如下</div>
          <Summary doc={result.extracted} />
          <div style={{ marginTop: 8, color: ui.color.muted, fontSize: 14 }}>
            尚無配對文件可比對——上傳同一個訂單參考碼的另一份文件後會自動比對。
          </div>
        </div>
      );

    case "success_pair_matched":
      return (
        <div style={ui.bannerGood}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>✓ 兩份文件核對一致</div>
          <Summary doc={result.extracted} />
        </div>
      );

    case "success_pair_mismatched":
      // The two conflicting figures ARE the demo beat, so they get display
      // size and the mono face — same treatment as the pooled price on
      // /pools, and for the same reason: code found this, not a model.
      return (
        <div style={ui.bannerWarn}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>⚠ 抓到差異</div>

          {result.mismatches.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap",
                padding: "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${ui.color.warnLine}`,
              }}
            >
              <div style={{ flex: "1 1 150px", fontSize: 14, paddingBottom: 4 }}>{m.field}</div>
              <Figure caption="請款單" value={m.invoiceValue} />
              <Figure caption="送貨單" value={m.packingListValue} />
            </div>
          ))}

          <div style={{ marginTop: 12, fontWeight: 650, fontSize: 14 }}>
            {result.agentDrafted
              ? "已送出核准卡到老闆 LINE，等待確認"
              : "差異已記錄，但通知老闆失敗（文件已儲存，不影響資料）"}
          </div>
        </div>
      );
  }
}

function Figure({ caption, value }: { caption: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: ui.color.muted, marginBottom: 2 }}>{caption}</div>
      <div style={{ ...ui.figure, fontSize: 26, color: ui.color.warn }}>{value}</div>
    </div>
  );
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
    <div style={{ fontSize: 14 }}>
      {parts.length > 0 ? parts.join(" · ") : "（沒有讀到任何欄位）"}
      {doc.missing_fields.length > 0 && (
        <div style={{ color: ui.color.warn, marginTop: 6 }}>
          缺漏欄位：{doc.missing_fields.join("、")}
        </div>
      )}
    </div>
  );
}
