// Numbers come from code, prose comes from the model.
//
// Models are bad at arithmetic and always will be. An earlier draft quoted
// "USD 15.95" for a line whose real landed cost was GBP 12.81 plus 12 percent,
// which is nearer USD 18. A judge can check that in their head. So the model
// no longer computes anything: it extracts what the customer asked for, code
// works out the price, and the model is handed the finished figures to write
// around.

export interface PriceTier {
  min_qty: number;
  unit_cost: number; // in `currency`
}
export interface PriceLine {
  size: string;
  currency: "GBP";
  tiers: PriceTier[];
  lead_time_days: [number, number];
  supplier_ref: string;
  note?: string;
}
export interface PriceList {
  lines: PriceLine[];
  margin_pct: number;
  floor_margin_pct: number;
  fx: Record<string, number>; // from GBP
  validity_days: number;
}

export interface QuoteRequest {
  size: string | null;
  quantity: number | null;
  destination: string | null;
  currency: string | null;
}

export interface ComputedQuote {
  size: string;
  quantity: number;
  supplier_ref: string;
  unit_cost: number;
  cost_currency: string;
  margin_pct: number;
  unit_price: number;
  total_price: number;
  price_currency: string;
  fx_rate: number | null;
  lead_time_days: [number, number];
  validity_days: number;
  tier_applied: number;
  below_moq: boolean;
  moq: number;
  /** The volume the tier was chosen on. Equals `quantity` for a solo order; for
   *  a pooled one it is the whole pool, which is the entire point. */
  tier_quantity: number;
}

export function normaliseSize(raw: string): string {
  // "195/65R15", "195/65 r15", "195-65-15" all mean the same line.
  return raw.toUpperCase().replace(/[\s\-]/g, "").replace(/R?(\d{2})$/, "R$1");
}

export function findLine(list: PriceList, size: string): PriceLine | null {
  const want = normaliseSize(size);
  return list.lines.find((l) => normaliseSize(l.size) === want) ?? null;
}

/** Deterministic. No model involved, and every figure is traceable.
 *
 *  `tierQuantity` separates "how much is being bought in total" from "how much
 *  is this buyer paying for". They are the same for a solo order, so it
 *  defaults to `quantity` and nothing existing changes. For a pooled order the
 *  caller passes the whole pool: one kitchen's 15kg is priced at the tier 60kg
 *  qualifies for, which is the only reason a small kitchen can reach an origin
 *  price at all.
 */
export function computeQuote(
  list: PriceList,
  req: { size: string; quantity: number; currency?: string | null; tierQuantity?: number }
): ComputedQuote | null {
  const line = findLine(list, req.size);
  if (!line || !Number.isFinite(req.quantity) || req.quantity <= 0) return null;

  const tierQty =
    Number.isFinite(req.tierQuantity) && (req.tierQuantity as number) > 0
      ? (req.tierQuantity as number)
      : req.quantity;

  // Tiers are cheapest-at-volume; pick the best tier the volume qualifies for.
  const sorted = [...line.tiers].sort((a, b) => a.min_qty - b.min_qty);
  const qualifying = sorted.filter((t) => tierQty >= t.min_qty);
  const tier = qualifying.length ? qualifying[qualifying.length - 1] : sorted[0];
  const moq = sorted[0].min_qty;

  const marginPct = list.margin_pct;
  const unitCost = tier.unit_cost;
  const sellInCostCurrency = round2(unitCost * (1 + marginPct / 100));

  const target = (req.currency ?? "USD").toUpperCase();
  const rate = target === line.currency ? 1 : list.fx[target] ?? null;
  const unitPrice = rate === null ? sellInCostCurrency : round2(sellInCostCurrency * rate);

  return {
    size: line.size,
    quantity: req.quantity,
    supplier_ref: line.supplier_ref,
    unit_cost: unitCost,
    cost_currency: line.currency,
    margin_pct: marginPct,
    unit_price: unitPrice,
    total_price: round2(unitPrice * req.quantity),
    price_currency: rate === null ? line.currency : target,
    fx_rate: rate === 1 ? null : rate,
    lead_time_days: line.lead_time_days,
    validity_days: list.validity_days,
    tier_applied: tier.min_qty,
    // The MOQ is a supplier minimum, so it is tested against what the supplier
    // actually ships: the pool, not one member's share of it.
    below_moq: tierQty < moq,
    moq,
    tier_quantity: tierQty,
  };
}

/** The block handed to the model. It quotes these figures; it never derives them. */
export function quoteBlock(q: ComputedQuote): string {
  const money = (n: number, c: string) => `${c} ${n.toFixed(2)}`;
  const lines = [
    "# Price worked out for you — quote these figures exactly, do not recalculate anything",
    `- Size: ${q.size}`,
    `- Quantity: ${q.quantity}`,
    `- Landed cost: ${money(q.unit_cost, q.cost_currency)} per unit (${q.supplier_ref}, tier from ${q.tier_applied} units)`,
    q.tier_quantity !== q.quantity
      ? `- Pooled order: this buyer takes ${q.quantity}, but the tier is the pool's ${q.tier_quantity}. Say plainly that the price comes from the combined order.`
      : "",
    `- Margin applied: ${q.margin_pct}%`,
    `- UNIT PRICE TO QUOTE: ${money(q.unit_price, q.price_currency)}`,
    `- TOTAL TO QUOTE: ${money(q.total_price, q.price_currency)}`,
    q.fx_rate ? `- FX used: 1 ${q.cost_currency} = ${q.fx_rate} ${q.price_currency} (state this in the quote)` : "",
    `- Lead time: ${q.lead_time_days[0]} to ${q.lead_time_days[1]} days`,
    `- Validity: ${q.validity_days} days`,
    q.below_moq
      ? `- WARNING: ${q.quantity} is below this line's MOQ of ${q.moq}. Say so in the draft and put it in \`missing\`.`
      : "",
    "",
    "Show the landed cost and the margin in one line so the owner can check it.",
  ];
  return lines.filter(Boolean).join("\n");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
