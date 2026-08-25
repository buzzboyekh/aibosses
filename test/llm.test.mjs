// The model does not always obey "JSON only". These tests cover the shapes it
// actually returns in practice, so one stray sentence does not kill a draft.
// Run: node test/llm.test.mjs

import assert from "node:assert/strict";
import { parseDraft } from "./llm-parse.mjs";

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };
const good = { title: "Quote for 500 tyres", body: "Dear buyer, ...", reason: "customer asked" };

test("parses clean JSON", () => {
  const d = parseDraft(JSON.stringify(good));
  assert.equal(d.title, "Quote for 500 tyres");
  assert.deepEqual(d.missing, []);
});

test("recovers JSON from a ```json fence", () => {
  const d = parseDraft("```json\n" + JSON.stringify(good) + "\n```");
  assert.equal(d.body, "Dear buyer, ...");
});

test("recovers JSON wrapped in chatter", () => {
  const d = parseDraft("Sure! Here is the draft:\n" + JSON.stringify(good) + "\nHope that helps.");
  assert.equal(d.title, "Quote for 500 tyres");
});

test("keeps the missing-facts list", () => {
  const d = parseDraft(JSON.stringify({ ...good, missing: ["MOQ", "ship date"] }));
  assert.deepEqual(d.missing, ["MOQ", "ship date"]);
});

test("drops non-string entries in missing instead of crashing", () => {
  const d = parseDraft(JSON.stringify({ ...good, missing: ["MOQ", 42, null] }));
  assert.deepEqual(d.missing, ["MOQ"]);
});

test("fills a blank reason rather than showing nothing", () => {
  const d = parseDraft(JSON.stringify({ ...good, reason: "" }));
  assert.equal(d.reason, "no reason given");
});

test("rejects a draft with no body — never queue an empty approval", () => {
  assert.throws(() => parseDraft(JSON.stringify({ title: "x", body: "" })), /missing title or body/);
});

test("rejects non-JSON with a readable error", () => {
  assert.throws(() => parseDraft("I cannot help with that."), /did not return JSON/);
});

console.log(`\n${passed}/8 passed`);
