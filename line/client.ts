// Thin LINE Messaging API client. Only what the approval loop needs.
//
// We use PUSH, not reply tokens: a reply token is single-use and expires in
// ~1 minute, and our agent chain (LLM call + document parsing) can outlast it.
// Push always works and costs one message from the OA quota.

const LINE_API = "https://api.line.me/v2/bot";

function token(): string {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
  return t;
}

export async function pushMessage(to: string, messages: unknown[]): Promise<void> {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    // Surfaced in logs rather than thrown into the webhook path: a failed
    // notification must never make us return non-200 and trigger LINE retries.
    console.error("[line] push failed", res.status, await res.text());
  }
}

export async function replyMessage(replyToken: string, messages: unknown[]): Promise<void> {
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error("[line] reply failed", res.status, await res.text());
}
