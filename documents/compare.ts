// Deterministic comparison — no LLM involved, so the numbers a judge checks
// on stage are never model-generated. The doc_check agent (db/seed.sql) only
// drafts the customer-facing message once we've already found a real
// disagreement here.

import type { ExtractedDoc } from "./types";

export interface Mismatch {
  field: string;
  invoiceValue: string;
  packingListValue: string;
}

export function compareDocuments(invoice: ExtractedDoc, packingList: ExtractedDoc): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (
    invoice.packages !== null &&
    packingList.packages !== null &&
    invoice.packages !== packingList.packages
  ) {
    mismatches.push({
      field: "件數 packages",
      invoiceValue: String(invoice.packages),
      packingListValue: String(packingList.packages),
    });
  }

  if (
    invoice.gross_weight !== null &&
    packingList.gross_weight !== null &&
    sameUnit(invoice.gross_weight_unit, packingList.gross_weight_unit) &&
    invoice.gross_weight !== packingList.gross_weight
  ) {
    mismatches.push({
      field: "重量 weight",
      invoiceValue: `${invoice.gross_weight} ${invoice.gross_weight_unit ?? ""}`.trim(),
      packingListValue: `${packingList.gross_weight} ${packingList.gross_weight_unit ?? ""}`.trim(),
    });
  }

  const invoiceQty = quantityByPartNumber(invoice);
  const packingQty = quantityByPartNumber(packingList);
  const partNumbers = new Set([...invoiceQty.keys(), ...packingQty.keys()]);
  for (const part of partNumbers) {
    const a = invoiceQty.get(part);
    const b = packingQty.get(part);
    if (a !== undefined && b !== undefined && a !== b) {
      mismatches.push({
        field: `數量 quantity（品項 ${part}）`,
        invoiceValue: String(a),
        packingListValue: String(b),
      });
    }
  }

  // Neither document has usable part numbers to key off — fall back to a
  // single total-quantity comparison so a mismatch still surfaces.
  if (partNumbers.size === 0) {
    const invoiceTotal = totalQuantity(invoice);
    const packingTotal = totalQuantity(packingList);
    if (invoiceTotal !== null && packingTotal !== null && invoiceTotal !== packingTotal) {
      mismatches.push({
        field: "總數量 total quantity",
        invoiceValue: String(invoiceTotal),
        packingListValue: String(packingTotal),
      });
    }
  }

  return mismatches;
}

function sameUnit(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // no unit recorded on one side; still compare the raw number
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function quantityByPartNumber(doc: ExtractedDoc): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of doc.line_items) {
    if (!item.part_number || item.quantity === null) continue;
    map.set(item.part_number, (map.get(item.part_number) ?? 0) + item.quantity);
  }
  return map;
}

function totalQuantity(doc: ExtractedDoc): number | null {
  const known = doc.line_items.filter((i) => i.quantity !== null);
  if (known.length === 0) return null;
  return known.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
}
