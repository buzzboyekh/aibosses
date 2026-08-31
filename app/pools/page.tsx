// /pools — the aggregation, made visible.
//
// This is the page that answers "how are you different from a wholesaler".
// A wholesaler's margin is largely payment for combining small orders into one
// big one. Here the combining is arithmetic, and both numbers are on screen:
// what this kitchen would pay alone, and what it pays because three others
// wanted the same fish on the same day.

import { listOpenPools, type PoolView } from "./actions";
import JoinForm from "./JoinForm";

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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>併單 Demand Pooling</h1>
      <p style={{ color: "#666", marginTop: 4, fontSize: 14 }}>
        一間廚房叫 15 公斤，吃不到產地的量價。四間廚房同一天要同一批貨，就吃得到。
        級距由併單總量決定，每間店只付自己那份——中盤商收的 30%，賣的就是這件事。
      </p>

      {loadError ? (
        <p style={{ ...emptyStyle, borderColor: "#fecaca", color: "#b91c1c", marginTop: 24 }}>
          {loadError}
        </p>
      ) : pools.length === 0 ? (
        <p style={{ ...emptyStyle, marginTop: 24 }}>目前沒有進行中的併單。</p>
      ) : (
        pools.map((v) => <PoolCard key={v.pool.id} view={v} />)
      )}
    </main>
  );
}

function PoolCard({ view }: { view: PoolView }) {
  const { pool, status, members } = view;
  const pct = Math.min(100, (status.committedQty / status.targetQty) * 100);
  const totalSaving = members.reduce((sum, m) => sum + m.savingTotal, 0);
  const currency = members[0]?.currency ?? "TWD";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{pool.item}</span>
        <span style={{ fontSize: 12, color: status.reachedTarget ? "#047857" : "#b45309", fontWeight: 600 }}>
          {status.reachedTarget ? "已湊滿" : `還差 ${status.remainingToTarget}`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#666", margin: "4px 0 10px" }}>
        {pool.delivery_date} 到貨 · {status.memberCount} 間店 · 截止{" "}
        {new Date(pool.closes_at).toLocaleString("zh-TW")}
      </div>

      <div style={progressWrap}>
        <div style={{ ...progressBar, width: `${pct}%`, background: status.reachedTarget ? "#047857" : "#4338ca" }} />
      </div>
      <div style={{ fontSize: 12, color: "#666", margin: "6px 0 12px", fontVariantNumeric: "tabular-nums" }}>
        {status.committedQty} / {status.targetQty}
        {status.reachedMoq ? "" : `（供應商最低 ${status.moq}，未達不成單）`}
      </div>

      {members.length > 0 && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#888", fontSize: 11, textAlign: "left" }}>
                <th style={th}>店家</th>
                <th style={thNum}>數量</th>
                <th style={thNum}>自己買</th>
                <th style={thNum}>併單價</th>
                <th style={thNum}>省下</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.buyerRef} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{m.buyerRef}</td>
                  <td style={tdNum}>{m.quantity}</td>
                  <td style={{ ...tdNum, color: "#999", textDecoration: "line-through" }}>
                    {m.aloneUnitPrice}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>{m.pooledUnitPrice}</td>
                  <td style={{ ...tdNum, color: "#047857" }}>
                    {m.savingTotal > 0 ? `${currency} ${m.savingTotal}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalSaving > 0 && (
            <div style={{ fontSize: 13, marginTop: 8, color: "#047857", fontWeight: 600 }}>
              這批合計省下 {currency} {Math.round(totalSaving * 100) / 100}
              <span style={{ color: "#888", fontWeight: 400 }}>
                {" "}· 級距 {members[0].pooledTier} 起，單買是 {members[0].aloneTier} 起
              </span>
            </div>
          )}
        </>
      )}

      {pool.state === "open" && <JoinForm poolId={pool.id} unit="公斤" />}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5", borderRadius: 10, padding: "14px 16px", marginBottom: 12,
};
const emptyStyle: React.CSSProperties = {
  border: "1px dashed #ccc", borderRadius: 10, padding: 18,
  textAlign: "center", color: "#888", fontSize: 13,
};
const progressWrap: React.CSSProperties = {
  height: 8, background: "#f0f0f0", borderRadius: 999, overflow: "hidden",
};
const progressBar: React.CSSProperties = { height: "100%", borderRadius: 999 };
const th: React.CSSProperties = { padding: "4px 6px", fontWeight: 600 };
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px", color: "#333" };
const tdNum: React.CSSProperties = {
  ...td, textAlign: "right", fontVariantNumeric: "tabular-nums",
};
