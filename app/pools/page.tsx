// /pools — the aggregation, made visible.
//
// This is the page that answers "how are you different from a wholesaler".
// A wholesaler's margin is largely payment for combining small orders into one
// big one. Here the combining is arithmetic, and both numbers are on screen:
// what a kitchen would pay alone, and what it pays because three others wanted
// the same fish on the same day.

import { listOpenPools, type PoolView } from "./actions";
import PoolCard from "./PoolCard";
import * as ui from "../ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PoolsPage() {
  // A failure loading the list must not take down the page — the same reason
  // /documents wraps its own list read.
  let pools: PoolView[] = [];
  let loadError: string | null = null;
  try {
    pools = await listOpenPools();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main style={ui.page}>
      <h1 style={ui.title}>併單 Demand Pooling</h1>
      <p style={ui.lede}>
        一間廚房叫 15 公斤，吃不到產地的量價。四間廚房同一天要同一批貨，就吃得到。
        級距由併單總量決定，每間店只付自己那份——中盤商收的 30%，賣的就是這件事。
      </p>

      <div style={{ marginTop: 32 }}>
        {loadError ? (
          <p style={ui.errorNote}>{loadError}</p>
        ) : pools.length === 0 ? (
          <p style={ui.empty}>目前沒有進行中的併單。</p>
        ) : (
          pools.map((v) => <PoolCard key={v.pool.id} view={v} />)
        )}
      </div>
    </main>
  );
}
