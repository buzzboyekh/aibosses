// The pricing maths, tested. This is the part of the demo where a judge can
// check the number in their head, so it must not be able to drift.
// Run: node test/pricing.test.mjs

import assert from "node:assert/strict";
import { computeQuote, findLine, normaliseSize, quoteBlock } from "./pricing.mjs";

// Real tyre-sourcing figures, supplier identities generalised.
const LIST = {
  margin_pct: 12,
  floor_margin_pct: 8,
  validity_days: 14,
  fx: { USD: 1.27, TWD: 40.5 },
  lines: [
    { size: "195/65R15", currency: "GBP", supplier_ref: "Supplier A",
      tiers: [{ min_qty: 500, unit_cost: 14.23 }, { min_qty: 1000, unit_cost: 12.81 }],
      lead_time_days: [40, 45] },
    { size: "195/55R16", currency: "GBP", supplier_ref: "Supplier B",
      tiers: [{ min_qty: 1, unit_cost: 13.57 }], lead_time_days: [40, 45] },
  ],
};

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("picks the volume tier the quantity actually qualifies for", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 1000, currency: "GBP" });
  assert.equal(q.unit_cost, 12.81);
  assert.equal(q.tier_applied, 1000);
});

test("does not give the volume price to a smaller order", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 600, currency: "GBP" });
  assert.equal(q.unit_cost, 14.23);
  assert.equal(q.tier_applied, 500);
});

test("margin arithmetic is exact — this is the bug that started it", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 1000, currency: "GBP" });
  assert.equal(q.unit_price, 14.35);            // 12.81 * 1.12
  assert.equal(q.total_price, 14350);
});

test("currency conversion is explicit and correct", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 1000, currency: "USD" });
  assert.equal(q.fx_rate, 1.27);
  assert.equal(q.unit_price, 18.22);            // 14.35 * 1.27, NOT the 15.95 a model guessed
  assert.equal(q.price_currency, "USD");
});

test("no FX line when quoting in the cost currency", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 1000, currency: "GBP" });
  assert.equal(q.fx_rate, null);
});

test("flags an order below MOQ instead of quietly quoting it", () => {
  const q = computeQuote(LIST, { size: "195/65R15", quantity: 50, currency: "GBP" });
  assert.equal(q.below_moq, true);
  assert.equal(q.moq, 500);
  assert.match(quoteBlock(q), /below this line's MOQ/);
});

test("tyre sizes match however the customer typed them", () => {
  assert.equal(normaliseSize("195/65 r15"), "195/65R15");
  assert.equal(normaliseSize("195/65-15"), "195/65R15");
  for (const s of ["195/65R15", "195/65 r15", "195/65-15"]) {
    assert.ok(findLine(LIST, s), `should match ${s}`);
  }
});

test("returns null for a size we do not stock, rather than improvising", () => {
  assert.equal(computeQuote(LIST, { size: "999/99R99", quantity: 100 }), null);
});

test("returns null for nonsense quantities", () => {
  for (const n of [0, -5, NaN]) {
    assert.equal(computeQuote(LIST, { size: "195/55R16", quantity: n }), null);
  }
});

test("the block tells the model not to recalculate", () => {
  const b = quoteBlock(computeQuote(LIST, { size: "195/55R16", quantity: 100, currency: "USD" }));
  assert.match(b, /do not recalculate/);
  assert.match(b, /UNIT PRICE TO QUOTE/);
  assert.match(b, /FX used/);
});

console.log(`\n${passed}/10 passed`);
