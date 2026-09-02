// One pool, and the argument it makes.
//
// The two prices are the design: what this kitchen would pay alone, struck
// through, and what it pays because others wanted the same fish on the same
// day. Both come out of pools/compute.ts, so both are set in the mono face —
// see app/ui.ts for why that distinction is load-bearing.

import type { PoolView } from "./actions";
import JoinForm from "./JoinForm";
import * as ui from "../ui";

export default function PoolCard({ view, demoKey }: { view: PoolView; demoKey: string }) {
  const { pool, status, members, targetUnitPrice } = view;
  const pct = Math.min(100, (status.committedQty / status.targetQty) * 100);
  const totalSaving = members.reduce((sum, m) => sum + m.savingTotal, 0);
  const currency = members[0]?.currency ?? "TWD";
  const lead = members[0];

  // While the pool is short, the pooled price IS the solo price, so striking
  // one through against the other reads as a bug and claims a discount nobody
  // has yet. Show what joining achieves instead.
  const earned = Boolean(lead) && lead.pooledUnitPrice < lead.aloneUnitPrice;

  return (
    <div style={ui.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 650 }}>{pool.item}</div>
          <div style={{ ...ui.meta, marginTop: 3 }}>
            {pool.delivery_date} 到貨 · {status.memberCount} 間店 · 截止{" "}
            {new Date(pool.closes_at).toLocaleString("zh-TW", {
              month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </div>
        </div>

        {lead && (
          <div style={{ textAlign: "right" }}>
            {earned && <div style={{ ...ui.figureWas, fontSize: 17 }}>{lead.aloneUnitPrice}</div>}
            <div style={{ ...ui.figure, color: earned ? ui.color.good : ui.color.ink }}>
              {lead.pooledUnitPrice}
            </div>
            <div style={{ ...ui.meta, fontSize: 12 }}>{currency} / 公斤</div>
            {!earned && targetUnitPrice !== null && targetUnitPrice < lead.pooledUnitPrice && (
              <div style={{ ...ui.meta, fontSize: 13, marginTop: 6, color: ui.color.active }}>
                湊滿 {status.targetQty} 降到{" "}
                <span style={{ ...ui.figureSm, fontWeight: 650 }}>{targetUnitPrice}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Progress status={status} pct={pct} />

      {members.length > 0 && (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
            <thead>
              <tr style={{ color: ui.color.muted, fontSize: 12, textAlign: "left" }}>
                <th style={th}>店家</th>
                <th style={thNum}>數量</th>
                <th style={thNum}>自己買</th>
                <th style={thNum}>併單價</th>
                <th style={thNum}>省下</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.buyerRef} style={{ borderTop: `1px solid ${ui.color.line}` }}>
                  <td style={{ ...td, fontSize: 15 }}>{m.buyerRef}</td>
                  <td style={{ ...tdNum, ...ui.figureSm }}>{m.quantity}</td>
                  <td style={{ ...tdNum, ...(earned ? ui.figureWas : { ...ui.figureSm, color: ui.color.faint }) }}>
                    {earned ? m.aloneUnitPrice : "—"}
                  </td>
                  <td style={{ ...tdNum, ...ui.figureSm, fontWeight: 650 }}>{m.pooledUnitPrice}</td>
                  <td style={{ ...tdNum, ...ui.figureSm, color: earned ? ui.color.good : ui.color.faint }}>
                    {m.savingTotal > 0 ? m.savingTotal : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalSaving > 0 && (
            <div style={{ fontSize: 15, marginTop: 12, color: ui.color.good, fontWeight: 600 }}>
              這批合計省下 {currency}{" "}
              <span style={{ ...ui.figureSm, fontWeight: 700 }}>
                {Math.round(totalSaving * 100) / 100}
              </span>
              <span style={{ color: ui.color.muted, fontWeight: 400 }}>
                {" "}· 級距 {lead.pooledTier} 起，單買是 {lead.aloneTier} 起
              </span>
            </div>
          )}
        </>
      )}

      {pool.state === "open" && <JoinForm poolId={pool.id} unit="公斤" demoKey={demoKey} />}
    </div>
  );
}

function Progress({ status, pct }: { status: PoolView["status"]; pct: number }) {
  const done = status.reachedTarget;
  return (
    <div style={{ margin: "18px 0 4px" }}>
      <div
        style={{ height: 10, background: ui.color.ground, borderRadius: 999, overflow: "hidden" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={status.targetQty}
        aria-valuenow={status.committedQty}
        aria-label={`${status.item}：已湊 ${status.committedQty}，目標 ${status.targetQty}`}
      >
        <div
          aria-hidden="true"
          style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: done ? ui.color.good : ui.color.active,
          }}
        />
      </div>
      <div
        style={{
          ...ui.meta, marginTop: 8, display: "flex",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        }}
      >
        <span>
          <span style={{ ...ui.figureSm, color: ui.color.ink, fontWeight: 650 }}>
            {status.committedQty}
          </span>
          {" / "}
          <span style={ui.figureSm}>{status.targetQty}</span> 公斤
          {status.reachedMoq ? "" : `（供應商最低 ${status.moq}，未達不成單）`}
        </span>
        <span style={{ color: done ? ui.color.good : ui.color.warn, fontWeight: 650 }}>
          {done ? "已湊滿" : `還差 ${status.remainingToTarget} 公斤`}
        </span>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 6px", fontWeight: 600 };
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "9px 6px" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right" };
