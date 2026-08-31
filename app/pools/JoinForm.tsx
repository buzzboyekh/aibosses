"use client";

// Joining a pool. Same shape as /documents' UploadForm: React 18 here has no
// useFormStatus, so pending and result state are hand-rolled with
// useTransition, and the server action is called directly so its return value
// can be shown rather than thrown at a crash screen.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinPool, type JoinResult } from "./actions";

export default function JoinForm({ poolId, unit }: { poolId: string; unit: string }) {
  const [result, setResult] = useState<JoinResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("pool_id", poolId);

    startTransition(async () => {
      try {
        const res = await joinPool(formData);
        setResult(res);
        if (res.status === "ok") {
          form.reset();
          router.refresh();
        }
      } catch (err) {
        setResult({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={labelStyle}>
          店名
          <input name="buyer_ref" placeholder="例如 鼎泰" required disabled={isPending} style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flex: "0 1 140px" }}>
          數量（{unit}）
          <input
            name="quantity" type="number" min="0.1" step="0.1"
            placeholder="15" required disabled={isPending} style={inputStyle}
          />
        </label>
        <button type="submit" disabled={isPending} style={isPending ? buttonPending : buttonStyle}>
          {isPending ? "加入中…" : "加入併單"}
        </button>
      </form>

      {result && <Banner result={result} />}
    </div>
  );
}

function Banner({ result }: { result: JoinResult }) {
  if (result.status === "validation_error") {
    return <div style={{ ...banner, ...amber }}>{result.message}</div>;
  }
  if (result.status === "error") {
    return <div style={{ ...banner, ...red }}>加入失敗：{result.message}</div>;
  }
  if (!result.filled) {
    return <div style={{ ...banner, ...neutral }}>已加入。還沒湊滿，湊滿前價格仍是原價。</div>;
  }
  return (
    <div style={{ ...banner, ...green }}>
      <b>湊滿了 ✓</b> 全部參與的餐廳都改用級距價。
      {result.agentDrafted
        ? " 採購單已草擬，送到老闆 LINE 等核准。"
        : " 但採購單草擬失敗，併單資料已存,可從 dashboard 重試。"}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555", flex: "1 1 160px",
};
const inputStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 14, border: "1px solid #ddd", borderRadius: 6, fontFamily: "inherit",
};
const buttonStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14, fontWeight: 600, background: "#111",
  color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
};
const buttonPending: React.CSSProperties = { ...buttonStyle, background: "#999", cursor: "not-allowed" };
const banner: React.CSSProperties = {
  marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid",
};
const neutral: React.CSSProperties = { background: "#f7f7f7", borderColor: "#e5e5e5", color: "#333" };
const green: React.CSSProperties = { background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" };
const amber: React.CSSProperties = { background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" };
const red: React.CSSProperties = { background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" };
