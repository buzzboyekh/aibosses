"use client";

// Joining a pool. Same shape as /documents' UploadForm: React 18 here has no
// useFormStatus, so pending and result state are hand-rolled with
// useTransition, and the server action is called directly so its return value
// can be shown rather than thrown at a crash screen.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinPool, type JoinResult } from "./actions";
import { DEMO_KEY_FIELD } from "../demoGuard";
import * as ui from "../ui";

export default function JoinForm(
  { poolId, unit, demoKey }: { poolId: string; unit: string; demoKey: string }
) {
  const [result, setResult] = useState<JoinResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("pool_id", poolId);
    // Re-checked server-side: gating the page does not gate the action.
    formData.set(DEMO_KEY_FIELD, demoKey);

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
    <div style={{ marginTop: 18, borderTop: `1px solid ${ui.color.line}`, paddingTop: 16 }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
      >
        <label style={ui.label}>
          店名
          <input name="buyer_ref" placeholder="例如 鼎泰" required disabled={isPending} style={ui.input} />
        </label>
        <label style={{ ...ui.label, flex: "0 1 150px" }}>
          數量（{unit}）
          <input
            name="quantity" type="number" min="0.1" step="0.1" placeholder="15"
            required disabled={isPending}
            style={{ ...ui.input, fontFamily: ui.font.mono, fontVariantNumeric: "tabular-nums" }}
          />
        </label>
        <button type="submit" disabled={isPending} style={isPending ? ui.buttonBusy : ui.button}>
          {isPending ? "加入中…" : "加入併單"}
        </button>
      </form>

      {result && <Banner result={result} />}
    </div>
  );
}

function Banner({ result }: { result: JoinResult }) {
  if (result.status === "validation_error") {
    return <div style={ui.bannerWarn}>{result.message}</div>;
  }
  if (result.status === "error") {
    return <div style={ui.bannerBad}>加入失敗：{result.message}</div>;
  }
  if (!result.filled) {
    return <div style={ui.bannerPlain}>已加入。還沒湊滿，湊滿前價格仍是原價。</div>;
  }
  return (
    <div style={ui.bannerGood}>
      <b>湊滿了 ✓</b> 全部參與的餐廳都改用級距價。
      {result.agentDrafted
        ? " 採購單已草擬，送到老闆 LINE 等核准。"
        : " 但採購單草擬失敗，併單資料已存，可從 dashboard 重試。"}
    </div>
  );
}
