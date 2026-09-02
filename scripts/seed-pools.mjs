// A pool one kitchen short of its tier — the state the demo needs.
//
// Three kitchens have committed 15kg of grouper each for the same delivery
// date: 45kg, against a 50kg tier. On stage a fourth joins, the pool tips
// over, and every one of them drops from the 10kg price to the 50kg price.
// Nothing about that is staged — the join is real and the arithmetic runs.
//
//   node --env-file=.env.local scripts/seed-pools.mjs
//   node --env-file=.env.local scripts/seed-pools.mjs --reset   (clear and redo)

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };

const KEY = process.env.BUSINESS_KEY ?? "demo-food";
const RESET = process.argv.includes("--reset");

const get = async (path) => (await fetch(`${url}/rest/v1/${path}`, { headers: H })).json();
const post = async (path, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const [business] = await get(`businesses?select=id,config&key=eq.${KEY}`);
if (!business) throw new Error(`business ${KEY} not found — run scripts/seed-food-sourcing.mjs first`);

// The delivery date is always a few days out, so the pool is never stale
// however long before the demo this was seeded.
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ITEM = "石斑魚";
const DELIVERY = day(4);
const CLOSES = new Date(Date.now() + 2 * 86400000).toISOString();

const open = await get(
  `demand_pools?select=id&business_id=eq.${business.id}&item=eq.${encodeURIComponent(ITEM)}&state=eq.open`
);
if (open.length && !RESET) {
  console.log(`pool already open for ${ITEM} (${open[0].id}). Use --reset to rebuild it.`);
  process.exit(0);
}
if (open.length && RESET) {
  for (const p of open) {
    await fetch(`${url}/rest/v1/demand_pools?id=eq.${p.id}`, { method: "DELETE", headers: H });
  }
  console.log(`removed ${open.length} existing pool(s)`);
}

// target_qty is the tier we are chasing, moq is the supplier's own floor —
// both read off the price list rather than typed in twice.
const line = business.config?.price_list?.lines?.find((l) => l.size === ITEM);
if (!line) throw new Error(`${ITEM} is not on ${KEY}'s price list`);
const tiers = [...line.tiers].sort((a, b) => a.min_qty - b.min_qty);
const moq = tiers[0].min_qty;
const target = tiers[tiers.length - 1].min_qty;

const [pool] = await post("demand_pools", {
  business_id: business.id, item: ITEM, delivery_date: DELIVERY,
  target_qty: target, moq, state: "open", closes_at: CLOSES,
});
console.log(`pool: ${ITEM}, ${DELIVERY} 到貨, target ${target}, moq ${moq}`);

const MEMBERS = [["鼎泰", 15], ["欣葉", 15], ["樂天", 15]];
await post(
  "pool_commitments",
  MEMBERS.map(([buyer_ref, quantity]) => ({
    pool_id: pool.id, buyer_ref, quantity, state: "committed",
  }))
);

const committed = MEMBERS.reduce((s, [, q]) => s + q, 0);
console.log(`  ${MEMBERS.length} kitchens committed ${committed}, ${target - committed} short of the tier`);
console.log(`\nOpen /pools and add a fourth. ${target - committed}kg tips it over.`);
