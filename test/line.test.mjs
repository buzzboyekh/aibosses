// Tests for webhook signature verification and postback encoding.
// These guard the two ways the approval loop can be attacked or corrupted:
// a forged webhook, and a postback payload that does not round-trip.
// Run: node test/line.test.mjs

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyLineSignature, encodePostback, decodePostback } from "./line-verify.mjs";

const SECRET = "test-channel-secret";
const sign = (body, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

await test("accepts a correctly signed body", async () => {
  const body = JSON.stringify({ events: [{ type: "postback" }] });
  assert.equal(verifyLineSignature(body, sign(body), SECRET), true);
});

await test("rejects a tampered body", async () => {
  const body = JSON.stringify({ events: [{ type: "postback" }] });
  const sig = sign(body);
  const tampered = JSON.stringify({ events: [{ type: "postback", evil: true }] });
  assert.equal(verifyLineSignature(tampered, sig, SECRET), false);
});

await test("rejects a signature made with the wrong secret", async () => {
  const body = "{}";
  assert.equal(verifyLineSignature(body, sign(body, "attacker-secret"), SECRET), false);
});

await test("rejects missing signature, and never throws on odd input", async () => {
  assert.equal(verifyLineSignature("{}", null, SECRET), false);
  assert.equal(verifyLineSignature("{}", undefined, SECRET), false);
  assert.equal(verifyLineSignature("{}", "", SECRET), false);
  assert.equal(verifyLineSignature("{}", "short", SECRET), false); // length mismatch
  assert.equal(verifyLineSignature("{}", sign("{}"), ""), false);  // no secret configured
});

await test("signature is whitespace-sensitive (raw body, not re-serialised)", async () => {
  const raw = '{"a":1}';
  const reserialised = JSON.stringify(JSON.parse('{ "a" : 1 }')); // same object, different bytes
  const sig = sign('{ "a" : 1 }');
  assert.equal(verifyLineSignature('{ "a" : 1 }', sig, SECRET), true);
  assert.equal(verifyLineSignature(raw, sig, SECRET), false,
    "proves we must sign the raw body, which is why the route uses req.text()");
  assert.equal(reserialised, raw);
});

await test("postback round-trips and stays under LINE's 300 char cap", async () => {
  const id = "0f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";
  for (const action of ["approve", "reject"]) {
    const data = encodePostback(action, id);
    assert.ok(data.length < 300, `postback data ${data.length} chars`);
    assert.deepEqual(decodePostback(data), { action, approvalId: id });
  }
});

await test("postback decoder rejects junk instead of guessing", async () => {
  assert.equal(decodePostback(""), null);
  assert.equal(decodePostback("a=approve"), null);          // no id
  assert.equal(decodePostback("id=123"), null);             // no action
  assert.equal(decodePostback("a=delete&id=123"), null);    // unknown action
  assert.equal(decodePostback("a=APPROVE&id=123"), null);   // case must match
});

console.log(`\n${passed}/7 passed`);
