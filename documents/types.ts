// Field shapes for the /documents feature. Kept separate from
// context/types.ts on purpose — that file is the shared contract Kun owns
// and changes only via PR; this one is scoped to doc-check only.
//
// Stage 2 (extract.ts) will produce values in this shape. For stage 1 we
// just need the type to exist so the upload form and the documents list can
// agree on what "extracted" looks like.

import type { DocType } from "../context/types";

export type { DocType };

export interface LineItem {
  description: string | null;
  part_number: string | null;
  quantity: number | null;
  unit_price: number | null;
  total: number | null;
}

// Fields common to both document types, plus the ones only one side has.
// Every field is nullable on purpose — a field the model could not read
// must come back as null, never a guessed value (hard rule from Kun's spec).
export interface ExtractedDoc {
  seller: string | null;
  buyer: string | null;
  invoice_number: string | null;
  date: string | null;
  line_items: LineItem[];
  gross_weight: number | null;
  gross_weight_unit: string | null;
  packages: number | null;
  hs_codes?: { part_number: string | null; suggested_code: string | null }[];
  // Anything the model flagged it could not find, in its own words.
  missing_fields: string[];
}
