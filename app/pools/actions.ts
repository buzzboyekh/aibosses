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
import type { PriceList } from "../../agents/pricing";
import { memberPrices, poolOutcome, poolStatus } from "../../pools/compute";
import type { DemandPool, MemberPrice, PoolCommitment, PoolStatus } from "../../pools/types";

const BUSINESS_KEY = process.env.BUSINESS_KEY ?? "demo-import";

export interface PoolView {
  pool: DemandPool;
  status: PoolStatus;
  members: MemberPrice[];
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
    return {
      pool,
      status: poolStatus(pool, mine),
      members: priceList ? memberPrices(priceList, pool, mine) : [],
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
    const poolId = (formData.get("pool_id") as string | null)?.trim();
    const buyerRef = (formData.get("buyer_ref") as string | null)?.trim();
    const quantity = Number(formData.get("quantity"));

    if (!poolId) return { status: "validation_error", message: "缺少併單編號" };
    if (!buyerRef) return { status: "validation_error", message: "請填店名" };
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { status: "validation_error", message: "請填一個大於 0 的數量" };
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

    if (outcome === "filled") {
      await db.from("demand_pools")
        .update({ state: "filled", updated_at: new Date().toISOString() })
        .eq("id", poolId);
      agentDrafted = await draftPurchaseOrder(db, pool as DemandPool, all, priceList);
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

  const task = [
    `${pool.delivery_date} 到貨的 ${pool.item} 併單已經湊滿，草擬一封給供應商的採購單。`,
    "",
    "以下數字已經由程式算好，直接引用，不要重算：",
    `- 品項：${pool.item}`,
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
