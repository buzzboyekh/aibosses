import crypto from "node:crypto";

/**
 * LINE signs every webhook request with HMAC-SHA256 over the RAW body.
 * Without this check anyone who learns the URL can post fake approvals, so
 * this runs before anything else in the handler.
 *
 * Must be given the raw body string, not a re-serialised object: JSON.stringify
 * of a parsed body can reorder keys or change spacing and the signature fails.
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null | undefined,
  channelSecret: string
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on mismatched lengths.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Postback payload. Kept tiny on purpose: LINE caps postback data at 300 chars. */
export function encodePostback(action: "approve" | "reject", approvalId: string): string {
  return `a=${action}&id=${approvalId}`;
}

export function decodePostback(
  data: string
): { action: "approve" | "reject"; approvalId: string } | null {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  const approvalId = params.get("id");
  if ((action !== "approve" && action !== "reject") || !approvalId) return null;
  return { action, approvalId };
}
