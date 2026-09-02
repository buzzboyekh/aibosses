"use server";

// Server actions for demand pooling. Service-role only, same rule as
// /documents: serverDb() never reaches a client component, so the page calls
// these instead.
//
// The split that matters: this file talks to the database and to the agent.
// Every number shown to a kitchen is computed in pools/compute.ts, which has
// no database and no model in it — so the arithmetic behind "you saved
// NT$619" can be checked against the price list by hand.

import { revalidatePath } from "next/cache";
import { serverDb } from "../../context/buildContext";
import { runAgent } from "../../agents/run";
import { computeQuote, type PriceList } from "../../agents/pricing";
import { memberPrices, poolOutcome, poolStatus } from "../../pools/compute";
import type { DemandPool, MemberPrice, PoolCommitment, PoolStatus } from "../../pools/types";
import { formHasDemoKey } from "../demoGuard";

const BUSINESS_KEY = process.env.BUSINESS_KEY ?? "demo-import";

// A filled pool ends in a LINE push, and the push quota is finite.
//
// Buyer names deliberately never reach the purchase-order prompt — the draft
// tells the supplier a total, not who ordered what. The item name does, and
// only the seed script writes it today, but fencing it costs nothing and keeps
// that true if pools ever become user-creatable. Same treatment as the
// customer text in line/inquiry.ts.
const FENCE = '"' + '""';
const asData = (s: string, max = 60) => s.slice(0, max).split(FENCE).join("'''");

export interface PoolView {
  pool: DemandPool;
  status: PoolStatus;
  members: MemberPrice[];
  /** Unit price once the pool reaches target_qty. Shown while it is still
   *  short, so the page says what joining actually achieves instead of
   *  implying a discount nobody has earned yet. Null if the item is not on
   *  the price list. */
  targetUnitPrice: number | null;
}

export type JoinResult =
  | { status: "ok"; filled: boolean; agentDrafted: boolean }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getBusiness(db: ReturnType<typeof serverDb>) {
  const { data, error } = await db
    .from("businesses")
    .select("id, config")
    .eq("key", BUSINESS_KEY)
    .single();
  if (error || !data) throw new Error(`business not found: ${BUSINESS_KEY}`);
  const priceList = (data.config as { price_list?: PriceList } | null)?.price_list ?? null;
  return { id: data.id as string, priceList };
}

/** Open pools with everyone's price already worked out. */
export async function listOpenPools(): Promise<PoolView[]> {
  const db = serverDb();
  const { id: businessId, priceList } = await getBusiness(db);

  const { data: pools, error } = await db
    .from("demand_pools")
    .select("*")
    .eq("business_id", businessId)
    .in("state", ["open", "filled"])
    .order("delivery_date", { ascending: true });
  if (error) throw new Error(`讀取併單失敗: ${error.message}`);
  if (!pools?.length) return [];

  const { data: commitments } = await db
    .from("pool_commitments")
    .select("*")
    .in("pool_id", pools.map((p: DemandPool) => p.id));

  return (pools as DemandPool[]).map((pool) => {
    const mine = ((commitments ?? []) as PoolCommitment[]).filter((c) => c.pool_id === pool.id);
    const atTarget = priceList
      ? computeQuote(priceList, {
          size: pool.item, quantity: 1, currency: "TWD", tierQuantity: pool.target_qty,
        })
      : null;
    return {
      pool,
      status: poolStatus(pool, mine),
      members: priceList ? memberPrices(priceList, pool, mine) : [],
      targetUnitPrice: atTarget?.unit_price ?? null,
    };
  });
}

/**
 * A kitchen joins a pool. The commitment counts immediately — the price it was
 * quoted is conditional on the pool actually reaching the tier, so there is
 * nothing to hold back. If this join is what fills the pool, the Sourcing
 * capability drafts the purchase order and the owner approves it on LINE, the
 * same as every other outbound action.
 */
export async function joinPool(formData: FormData): Promise<JoinResult> {
  try {
    if (!formHasDemoKey(formData)) {
      return { status: "validation_error", message: "沒有操作權限：這個頁面要帶 demo key 才能用" };
    }

    const poolId = (formData.get("pool_id") as string | null)?.trim();
    const buyerRef = (formData.get("buyer_ref") as string | null)?.trim();
    const quantity = Number(formData.get("quantity"));

    if (!poolId) return { status: "validation_error", message: "缺少併單編號" };
    if (!buyerRef) return { status: "validation_error", message: "請填店名" };
    if (buyerRef.length > 60) return { status: "validation_error", message: "店名太長，60 字以內" };
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { status: "validation_error", message: "請填一個大於 0 的數量" };
    }
    // An unbounded quantity fills any pool in one request, which fires the
    // purchase order and spends a LINE push.
    if (quantity > 10000) {
      return { status: "validation_error", message: "數量看起來不合理，請確認" };
    }

    const db = serverDb();
    const { id: businessId, priceList } = await getBusiness(db);

    const { data: pool, error: poolErr } = await db
      .from("demand_pools")
      .select("*")
      .eq("id", poolId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (poolErr || !pool) return { status: "error", message: "找不到這筆併單" };
    if (pool.state !== "open") {
      return { status: "validation_error", message: "這筆併單已經結單了" };
    }
    // The deadline is part of the offer. Without this a pool stays joinable
    // forever as long as nothing has closed it, and the conditional price we
    // quoted ("this rate if we reach 50kg by Tuesday") stops being true.
    if (new Date(pool.closes_at) <= new Date()) {
      return { status: "validation_error", message: "這筆併單已經過了截止時間" };
    }

    // upsert so a kitchen changing its mind updates its line rather than
    // failing on the (pool_id, buyer_ref) unique constraint.
    const { error: upsertErr } = await db
      .from("pool_commitments")
      .upsert(
        { pool_id: poolId, buyer_ref: buyerRef, quantity, state: "committed" },
        { onConflict: "pool_id,buyer_ref" }
      );
    if (upsertErr) return { status: "error", message: `加入失敗: ${upsertErr.message}` };

    const { data: commitments } = await db
      .from("pool_commitments").select("*").eq("pool_id", poolId);
    const all = (commitments ?? []) as PoolCommitment[];

    const outcome = poolOutcome(pool as DemandPool, all, new Date());
    let agentDrafted = false;
    let iFilledIt = false;

    if (outcome === "filled") {
      // Guarded update, the same shape as context/decide.ts's double-tap
      // guard: the row only moves if it is still `open`, and we act on the
      // returned rows rather than assuming. Two kitchens joining at the same
      // moment both compute "filled", and without this both would go on to
      // draft a purchase order — two POs to the same supplier for one order.
      const { data: won, error: claimErr } = await db
        .from("demand_pools")
        .update({ state: "filled", updated_at: new Date().toISOString() })
        .eq("id", poolId)
        .eq("state", "open")
        .select("id");
      if (claimErr) return { status: "error", message: `結單失敗: ${claimErr.message}` };
      iFilledIt = (won?.length ?? 0) > 0;

      // Only the caller that actually flipped the row drafts the PO. The other
      // one still succeeded at joining, and says so.
      if (iFilledIt) {
        agentDrafted = await draftPurchaseOrder(db, pool as DemandPool, all, priceList);
      }
    }

    revalidatePath("/pools");
    return { status: "ok", filled: outcome === "filled", agentDrafted };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

/**
 * The pool reached its volume, so there is a real order to place. The agent
 * writes the message; the figures in the task are computed, not derived by the
 * model. A failure here must not undo the join — the commitment is already
 * recorded and the owner can retry from the dashboard.
 */
async function draftPurchaseOrder(
  db: ReturnType<typeof serverDb>,
  pool: DemandPool,
  commitments: PoolCommitment[],
  priceList: PriceList | null
): Promise<boolean> {
  const status = poolStatus(pool, commitments);
  const prices = priceList ? memberPrices(priceList, pool, commitments) : [];
  const tier = prices[0]?.pooledTier ?? status.committedQty;

  const item = asData(pool.item);
  const task = [
    `${pool.delivery_date} 到貨的 ${item} 併單已經湊滿，草擬一封給供應商的採購單。`,
    "",
    "以下數字已經由程式算好，直接引用，不要重算：",
    `- 品項：${item}`,
    `- 總數量：${status.committedQty}（${status.memberCount} 間餐廳合併）`,
    `- 適用級距：${tier} 起`,
    `- 到貨日：${pool.delivery_date}`,
    "",
    "採購單要寫明品項、總數量、到貨日與驗收方式。不要透露個別餐廳的名稱或各自的數量。",
  ].join("\n");

  try {
    await runAgent(db, {
      businessKey: BUSINESS_KEY,
      roleKey: "ops_po",
      actionType: "send_po",
      task,
      notifyUserId: process.env.LINE_OWNER_USER_ID,
    });
    return true;
  } catch (err) {
    console.error("[pools] runAgent failed after a pool filled", err);
    return false;
  }
}
