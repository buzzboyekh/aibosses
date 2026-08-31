// The pooling maths, tested. This is the number the whole "we are not a
// wholesaler" claim rests on: a kitchen pays the tier the POOL reached, for
// the quantity IT ordered. Get the two the wrong way round and every member is
// silently overcharged, so that case is tested explicitly.
// Run: node test/pools.test.mjs

import assert from "node:assert/strict";
import {
  countingCommitments, memberPrices, nextTierTarget, poolOutcome, poolStatus,
} from "./pools-compute.mjs";

// Mirrors scripts/seed-food-sourcing.mjs.
const LIST = {
  margin_pct: 18,
  floor_margin_pct: 10,
  validity_days: 3,
  fx: { USD: 0.031 },
  lines: [
    { size: "石斑魚", currency: "TWD", supplier_ref: "屏東枋寮契作魚塭",
      tiers: [{ min_qty: 10, unit_cost: 420 }, { min_qty: 50, unit_cost: 385 }],
      lead_time_days: [1, 2] },
    { size: "白蝦", currency: "TWD", supplier_ref: "東港漁會",
      tiers: [{ min_qty: 10, unit_cost: 320 }, { min_qty: 100, unit_cost: 285 }],
      lead_time_days: [1, 2] },
  ],
};

const pool = (over = {}) => ({
  id: "p1", business_id: "b1", item: "石斑魚", delivery_date: "2026-09-10",
  target_qty: 50, moq: 10, state: "open",
  closes_at: "2026-09-08T15:00:00Z",
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  ...over,
});
const commit = (buyer, quantity, state = "committed") => ({
  id: `c-${buyer}`, pool_id: "p1", buyer_ref: buyer, quantity, state,
  approval_id: null, created_at: "2026-09-01T00:00:00Z",
});

// Four kitchens, 15kg each: 60kg, past the 50kg tier none of them reaches alone.
const FOUR = [commit("鼎泰", 15), commit("欣葉", 15), commit("樂天", 15), commit("神旺", 15)];

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test("a full pool puts every member on the pool's tier", () => {
  const prices = memberPrices(LIST, pool(), FOUR);
  assert.equal(prices.length, 4);
  for (const p of prices) {
    assert.equal(p.pooledTier, 50, "tier should come from the pool's 60kg");
    assert.equal(p.pooledUnitPrice, 454.3); // 385 * 1.18
  }
});

test("each kitchen is charged for its OWN quantity, not the pool's", () => {
  // The catastrophic-and-invisible bug: pricing 15kg as if it were 60kg.
  const prices = memberPrices(LIST, pool(), FOUR);
  for (const p of prices) assert.equal(p.quantity, 15);
  assert.equal(prices[0].savingTotal, 619.5); // 41.3 saved per kg x 15kg
});

test("the saving is a comparison against the same price list, not a claim", () => {
  const [p] = memberPrices(LIST, pool(), FOUR);
  assert.equal(p.aloneTier, 10);
  assert.equal(p.aloneUnitPrice, 495.6);  // 420 * 1.18, the 10kg tier
  assert.equal(p.pooledUnitPrice, 454.3); // 385 * 1.18, the 50kg tier
  assert.equal(p.savingPerUnit, 41.3);
});

test("pending and withdrawn commitments do not count toward the volume", () => {
  const mixed = [commit("鼎泰", 15), commit("欣葉", 15, "pending"), commit("樂天", 15, "withdrawn")];
  assert.equal(countingCommitments(mixed).length, 1);
  assert.equal(poolStatus(pool(), mixed).committedQty, 15);
});

test("a pool short of target reports exactly how much is missing", () => {
  const s = poolStatus(pool(), [commit("鼎泰", 15), commit("欣葉", 23)]);
  assert.equal(s.committedQty, 38);
  assert.equal(s.remainingToTarget, 12);
  assert.equal(s.reachedTarget, false);
  assert.equal(s.reachedMoq, true);
  assert.equal(s.memberCount, 2);
});

test("a reached target reports nothing remaining, never a negative", () => {
  const s = poolStatus(pool(), FOUR);
  assert.equal(s.committedQty, 60);
  assert.equal(s.remainingToTarget, 0);
  assert.equal(s.reachedTarget, true);
});

test("the target to chase is the next tier above what is committed", () => {
  assert.equal(nextTierTarget(LIST, "石斑魚", 0), 10);
  assert.equal(nextTierTarget(LIST, "石斑魚", 15), 50);
  assert.equal(nextTierTarget(LIST, "白蝦", 40), 100);
});

test("there is no target left once the best tier is reached", () => {
  assert.equal(nextTierTarget(LIST, "石斑魚", 60), null);
  assert.equal(nextTierTarget(LIST, "not a real item", 10), null);
});

test("a pool stays open before its deadline", () => {
  const before = new Date("2026-09-07T00:00:00Z");
  assert.equal(poolOutcome(pool(), [commit("鼎泰", 15)], before), "open");
});

test("reaching the target fills the pool immediately, deadline or not", () => {
  const before = new Date("2026-09-07T00:00:00Z");
  assert.equal(poolOutcome(pool(), FOUR, before), "filled");
});

test("past the deadline it still ships if the supplier's minimum is met", () => {
  const after = new Date("2026-09-09T00:00:00Z");
  // 38kg: short of the 50kg tier, but over the supplier's 10kg minimum.
  const short = [commit("鼎泰", 15), commit("欣葉", 23)];
  assert.equal(poolOutcome(pool(), short, after), "filled");
});

test("past the deadline under the supplier's minimum, it expires", () => {
  const after = new Date("2026-09-09T00:00:00Z");
  assert.equal(poolOutcome(pool(), [commit("鼎泰", 4)], after), "expired");
});

test("an item that is not on the price list yields no member prices", () => {
  const prices = memberPrices(LIST, pool({ item: "松露" }), FOUR);
  assert.deepEqual(prices, []);
});

console.log(`\n${passed}/13 passed`);
