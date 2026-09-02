// The pooling arithmetic. Pure: no database, no model, no clock beyond what is
// handed in. Every number a kitchen sees on the pool page comes from here, so
// a judge (or a supplier) can check it against the price list.

import { computeQuote, findLine, type PriceList } from "../agents/pricing";
import type { DemandPool, MemberPrice, PoolCommitment, PoolStatus } from "./types";

/** Commitments that actually count toward the volume. A withdrawn one does
 *  not, and neither does a pending one — a kitchen has to have approved
 *  joining before its quantity can be promised to a supplier. */
export function countingCommitments(commitments: PoolCommitment[]): PoolCommitment[] {
  return commitments.filter((c) => c.state === "committed");
}

export function poolStatus(pool: DemandPool, commitments: PoolCommitment[]): PoolStatus {
  const counting = countingCommitments(commitments);
  const committedQty = counting.reduce((sum, c) => sum + c.quantity, 0);
  return {
    item: pool.item,
    committedQty,
    targetQty: pool.target_qty,
    moq: pool.moq,
    remainingToTarget: Math.max(0, round3(pool.target_qty - committedQty)),
    reachedMoq: committedQty >= pool.moq,
    reachedTarget: committedQty >= pool.target_qty,
    memberCount: counting.length,
  };
}

/**
 * What each member pays, and what the pool saved them.
 *
 * The whole mechanism is one line: the tier comes from the pool's total, the
 * quantity charged is the member's own. `aloneUnitPrice` re-runs the same
 * function without the pool, which is what makes the saving a comparison
 * rather than a claim.
 */
export function memberPrices(
  list: PriceList,
  pool: DemandPool,
  commitments: PoolCommitment[],
  currency = "TWD"
): MemberPrice[] {
  const counting = countingCommitments(commitments);
  const poolQty = counting.reduce((sum, c) => sum + c.quantity, 0);

  const out: MemberPrice[] = [];
  for (const c of counting) {
    const pooled = computeQuote(list, {
      size: pool.item, quantity: c.quantity, currency, tierQuantity: poolQty,
    });
    const alone = computeQuote(list, { size: pool.item, quantity: c.quantity, currency });
    if (!pooled || !alone) continue; // item not on the price list; nothing to show

    const savingPerUnit = round2(alone.unit_price - pooled.unit_price);
    out.push({
      buyerRef: c.buyer_ref,
      quantity: c.quantity,
      aloneUnitPrice: alone.unit_price,
      pooledUnitPrice: pooled.unit_price,
      savingPerUnit,
      savingTotal: round2(savingPerUnit * c.quantity),
      currency: pooled.price_currency,
      pooledTier: pooled.tier_applied,
      aloneTier: alone.tier_applied,
    });
  }
  return out;
}

/**
 * The volume worth aiming at: the next tier above what is already committed.
 * Returns null when the pool is already at the best tier the list offers —
 * there is then nothing further to chase and the pool should just close.
 */
export function nextTierTarget(list: PriceList, item: string, committedQty: number): number | null {
  const line = findLine(list, item);
  if (!line) return null;
  const above = [...line.tiers]
    .sort((a, b) => a.min_qty - b.min_qty)
    .find((t) => t.min_qty > committedQty);
  return above ? above.min_qty : null;
}

/**
 * Should this pool still be open? Deterministic so the same inputs always give
 * the same answer, and `now` is a parameter so it can be tested without
 * waiting for a clock.
 */
export function poolOutcome(
  pool: DemandPool,
  commitments: PoolCommitment[],
  now: Date
): "open" | "filled" | "expired" {
  const { reachedTarget, reachedMoq } = poolStatus(pool, commitments);
  if (reachedTarget) return "filled";
  if (now < new Date(pool.closes_at)) return "open";
  // Deadline passed. It can still go ahead if the supplier's own minimum is
  // met — just at a worse tier than we hoped, which is honest and still better
  // than each kitchen ordering alone.
  return reachedMoq ? "filled" : "expired";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
