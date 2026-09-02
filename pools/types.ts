// Demand pooling: several kitchens wanting the same ingredient for the same
// delivery date, combined into one order that reaches a volume none of them
// reaches alone.
//
// This is the answer to "how are you different from a wholesaler". A
// wholesaler's 30-40% is largely payment for aggregating demand. We do the
// aggregation in code, show the arithmetic, and charge a fee the buyer can
// check — see docs and the pitch.

export type PoolState = "open" | "filled" | "ordered" | "expired" | "cancelled";

/** A commitment is provisional until the pool closes. Nothing is binding
 *  before then, and the price is quoted as conditional for exactly that
 *  reason: we never promise a tier the pool has not actually reached. */
export type CommitmentState = "pending" | "committed" | "withdrawn";

export interface DemandPool {
  id: string;
  business_id: string;
  /** Matches a `size` in the business config's price_list. */
  item: string;
  /** The shared delivery date. Kitchens only pool if they want it the same day. */
  delivery_date: string;
  /** The volume we are trying to reach — normally the next price tier. */
  target_qty: number;
  /** The supplier's own minimum. Below this there is no order at all. */
  moq: number;
  state: PoolState;
  closes_at: string;
  created_at: string;
  updated_at: string;
}

export interface PoolCommitment {
  id: string;
  pool_id: string;
  /** Which kitchen. A LINE user id or a client name; not a real account system yet. */
  buyer_ref: string;
  quantity: number;
  state: CommitmentState;
  approval_id: string | null;
  created_at: string;
}

/** Everything the UI and the agent need to know about where a pool stands.
 *  Computed, never stored — storing it would let it drift from the truth. */
export interface PoolStatus {
  item: string;
  committedQty: number;
  targetQty: number;
  moq: number;
  /** How much more is needed to reach the target tier. 0 once reached. */
  remainingToTarget: number;
  reachedMoq: boolean;
  reachedTarget: boolean;
  memberCount: number;
}

/** What one kitchen pays, and what pooling saved it. Both figures come from
 *  the same price list, so the saving is checkable rather than asserted. */
export interface MemberPrice {
  buyerRef: string;
  quantity: number;
  aloneUnitPrice: number;
  pooledUnitPrice: number;
  savingPerUnit: number;
  savingTotal: number;
  currency: string;
  /** The tier the pool qualified for, and the one this kitchen would have got alone. */
  pooledTier: number;
  aloneTier: number;
}
