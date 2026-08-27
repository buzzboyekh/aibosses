// The two invariants that decide whether memory is real.
//
// Both of these were broken in production and neither was caught by anything:
// learned facts landed on tags no role subscribes to (measured: 3 of 3
// unreadable), and a flat recency limit meant accumulating history silently
// evicted the seeded pricing rules.
//
// Run: node test/memory.test.mjs

import assert from "node:assert/strict";
import { validateTags } from "./remember.mjs";

// The real vocabulary, as the live roles use it.
const VOCAB = ["clients", "customs", "docs", "history", "incoterms", "pricing",
  "routes", "routing", "schedules", "specs", "stock", "suppliers", "tone"];

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("keeps tags a role can actually retrieve", () => {
  assert.deepEqual(validateTags(["suppliers", "history"], VOCAB), ["suppliers", "history"]);
});

test("drops invented tags — these are what production actually produced", () => {
  // Observed live: every one of these made its fact unreadable forever.
  for (const invented of [["buying", "quantity", "size"], ["payment behavior"], ["constraints"]]) {
    const out = validateTags(invented, VOCAB);
    assert.deepEqual(out, ["history"], `${invented} should fall back, got ${out}`);
    assert.ok(out.includes("history"));
    assert.ok(out.every((t) => VOCAB.includes(t)));
  }
});

test("keeps the good tags, drops the bad, and always adds history", () => {
  // history is unioned in deliberately: a fact tagged only "pricing" is
  // invisible to relationship_memory, which subscribes to suppliers+history.
  assert.deepEqual(validateTags(["suppliers", "payment behavior"], VOCAB),
    ["suppliers", "history"]);
  assert.ok(validateTags(["pricing"], VOCAB).includes("history"));
});

test("never returns a tag outside the vocabulary, whatever it is given", () => {
  for (const junk of [null, undefined, "suppliers", 42, [], [1, 2], [{}], ["", " "]]) {
    const out = validateTags(junk, VOCAB);
    assert.ok(Array.isArray(out) && out.length > 0, `empty for ${JSON.stringify(junk)}`);
    assert.ok(out.every((t) => VOCAB.includes(t)), `escaped vocabulary: ${out}`);
  }
});

test("caps at three tags so one fact cannot claim every subscription", () => {
  // At most two validated tags plus history, so the ceiling is three and the
  // floor is whatever survives validation.
  for (const input of [
    ["suppliers", "history", "pricing", "tone", "docs"],
    ["pricing", "tone", "docs", "specs"],
  ]) {
    const out = validateTags(input, VOCAB);
    assert.ok(out.length <= 3, `${out.length} tags from ${input}`);
    assert.ok(out.includes("history"), `history missing from ${out}`);
    assert.equal(new Set(out).size, out.length, `duplicate tags in ${out}`);
  }
});

test("adapts to a business whose vocabulary lacks history", () => {
  const other = ["specs", "stock"];
  const out = validateTags(["payment behavior"], other);
  assert.ok(out.every((t) => other.includes(t)), `escaped: ${out}`);
  assert.equal(out.length, 1);
});

// The context budget: seeded rules and learned facts must not compete.
function budget(core, learned, coreLimit = 14, learnedLimit = 8) {
  return [...core.slice(0, coreLimit), ...learned.slice(0, learnedLimit)];
}

test("learned facts cannot evict the business rules", () => {
  const core = Array.from({ length: 15 }, (_, i) => `rule ${i}`);
  const learned = Array.from({ length: 50 }, (_, i) => `learned ${i}`);
  const out = budget(core, learned);
  const rules = out.filter((x) => x.startsWith("rule"));
  assert.equal(rules.length, 14, "rules must survive an avalanche of history");
  assert.ok(out.length <= 22, `prompt would bloat: ${out.length} facts`);
});

test("a business with no history yet still gets all its rules", () => {
  const out = budget(["a", "b", "c"], []);
  assert.deepEqual(out, ["a", "b", "c"]);
});


// --- the memory step's place in a plan -------------------------------------
// Left to the planner this role was never once chosen: told to keep plans
// short, it always picked something more obviously useful. So the position is
// decided in code, and these are the rules it must follow.
const { withMemoryStep } = await import("./plan.mjs");

const rfqPlan = () => [
  { role_key: "ops_po", action_type: "send_rfq", intent: "ask suppliers" },
  { role_key: "ops_po", action_type: null, intent: "compare offers" },
  { role_key: "ops_po", action_type: "send_po", intent: "commit" },
];

test("memory lands after the RFQ and before the comparison", () => {
  const out = withMemoryStep(rfqPlan());
  const at = out.findIndex((s) => s.role_key === "relationship_memory");
  assert.equal(at, 1, "must sit between asking and comparing");
  assert.equal(out[at + 1].intent, "compare offers");
});

test("the memory step is internal — outbound would stall the job", () => {
  const step = withMemoryStep(rfqPlan()).find((s) => s.role_key === "relationship_memory");
  assert.equal(step.action_type, null);
});

test("left alone when there is nothing to remember about", () => {
  const noRfq = [
    { role_key: "sales_quote", action_type: "send_quote", intent: "quote them" },
    { role_key: "ops_po", action_type: null, intent: "check stock" },
  ];
  assert.deepEqual(withMemoryStep(noRfq), noRfq);
});

test("does not add a second one if the planner already chose it", () => {
  const already = [
    { role_key: "ops_po", action_type: "send_rfq", intent: "ask" },
    { role_key: "relationship_memory", action_type: null, intent: "check history" },
  ];
  assert.equal(
    withMemoryStep(already).filter((s) => s.role_key === "relationship_memory").length, 1
  );
});

test("goes after the LAST request for quotation, not the first", () => {
  const two = [
    { role_key: "ops_po", action_type: "send_rfq", intent: "first round" },
    { role_key: "ops_po", action_type: "send_rfq", intent: "second round" },
    { role_key: "ops_po", action_type: null, intent: "compare" },
  ];
  const out = withMemoryStep(two);
  assert.equal(out.findIndex((s) => s.role_key === "relationship_memory"), 2);
});

test("a plan cannot grow without bound", () => {
  const long = Array.from({ length: 7 }, (_, i) => ({
    role_key: "ops_po", action_type: i === 0 ? "send_rfq" : null, intent: `step ${i}`,
  }));
  assert.ok(withMemoryStep(long).length <= 7);
});

console.log(`\n${passed}/14 passed`);
