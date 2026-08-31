"use server";

// Server actions for the /documents feature. This is the only place that
// touches Supabase for this feature — serverDb() is service-role and must
// stay server-side only (Kun's rule). UploadForm.tsx calls uploadDocument()
// directly (not bound as a <form action>) so it can read the return value —
// React 18 here has no useFormState/useActionState to do that for us.

import { revalidatePath } from "next/cache";
import { serverDb } from "../../context/buildContext";
import { runAgent } from "../../agents/run";
import { extractDocument } from "../../documents/extract";
import { compareDocuments, type Mismatch } from "../../documents/compare";
import type { DocType, ExtractedDoc } from "../../documents/types";

const BUSINESS_KEY = process.env.BUSINESS_KEY ?? "demo-import";

// Only these two doc types get cross-checked against each other. Everything
// else (rfq, supplier_quote, other) is still extracted and stored — it just
// doesn't have a "pair" to compare against.
const OPPOSITE_DOC_TYPE: Partial<Record<DocType, DocType>> = {
  commercial_invoice: "packing_list",
  packing_list: "commercial_invoice",
};

export type UploadResult =
  | { status: "validation_error"; message: string }
  | { status: "error"; stage: "config" | "upload" | "extract" | "db"; message: string }
  | { status: "success_no_pair"; extracted: ExtractedDoc }
  | { status: "success_pair_matched"; extracted: ExtractedDoc }
  | {
      status: "success_pair_mismatched";
      extracted: ExtractedDoc;
      mismatches: Mismatch[];
      agentDrafted: boolean;
    };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getBusinessId(db: ReturnType<typeof serverDb>) {
  const { data, error } = await db
    .from("businesses")
    .select("id")
    .eq("key", BUSINESS_KEY)
    .single();
  if (error || !data) throw new Error(`business not found: ${BUSINESS_KEY}`);
  return data.id as string;
}

/**
 * Stage 2, hardened for live demo use: upload -> Storage -> AI extraction ->
 * DB row -> if this completes an invoice/packing-list pair for the same
 * order_ref, compare them and, on a real mismatch, ask the doc_check agent
 * to draft a customer notice. Every expected failure is *returned*, not
 * thrown — the operator is standing on a stage, not reading a stack trace —
 * plus one outer catch as a final safety net for anything unanticipated.
 */
export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get("file");
    const docType = formData.get("doc_type") as DocType | null;
    const orderRef = (formData.get("order_ref") as string | null)?.trim() || null;

    if (!(file instanceof File) || file.size === 0) {
      return { status: "validation_error", message: "請選擇一個檔案" };
    }
    if (!docType) {
      return { status: "validation_error", message: "請選擇文件類型" };
    }
    if (!orderRef) {
      return { status: "validation_error", message: "請填訂單參考碼（用來配對發票跟裝箱單）" };
    }

    let db: ReturnType<typeof serverDb>;
    let businessId: string;
    try {
      db = serverDb();
      businessId = await getBusinessId(db);
    } catch (err) {
      return { status: "error", stage: "config", message: errorMessage(err) };
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${BUSINESS_KEY}/${docType}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    try {
      const { error: uploadError } = await db.storage
        .from("docs")
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
    } catch (err) {
      return { status: "error", stage: "upload", message: errorMessage(err) };
    }

    let extracted: ExtractedDoc;
    try {
      extracted = await extractDocument(bytes, mimeType, docType);
    } catch (err) {
      return { status: "error", stage: "extract", message: errorMessage(err) };
    }

    try {
      const { data: inserted, error: insertError } = await db
        .from("documents")
        .insert({
          business_id: businessId,
          storage_path: storagePath,
          doc_type: docType,
          order_ref: orderRef,
          extracted,
          uploaded_by: "eric-manual-test", // stage 1 only; real value comes later
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw new Error(insertError?.message ?? "insert failed");
    } catch (err) {
      return { status: "error", stage: "db", message: errorMessage(err) };
    }

    revalidatePath("/documents");

    const opposite = OPPOSITE_DOC_TYPE[docType];
    if (opposite) {
      const outcome = await checkForMismatch(db, businessId, orderRef, docType, extracted, opposite);
      if (outcome) {
        if (outcome.mismatches.length > 0) {
          return {
            status: "success_pair_mismatched",
            extracted,
            mismatches: outcome.mismatches,
            agentDrafted: outcome.agentDrafted,
          };
        }
        return { status: "success_pair_matched", extracted };
      }
    }

    return { status: "success_no_pair", extracted };
  } catch (err) {
    // Nothing unanticipated should ever reach Next's default error screen
    // on a projector — this is the last line of defence.
    return { status: "error", stage: "db", message: errorMessage(err) };
  }
}

/**
 * If the order's other document (invoice <-> packing list) is already
 * uploaded, compare the two deterministically. Only on a real disagreement
 * do we call the doc_check agent — it drafts the customer notice, the owner
 * approves it on LINE, nothing is invented or sent automatically. A failure
 * notifying the agent degrades to agentDrafted: false rather than failing
 * the whole upload — the document row is already committed by this point.
 */
async function checkForMismatch(
  db: ReturnType<typeof serverDb>,
  businessId: string,
  orderRef: string,
  justUploadedType: DocType,
  justUploadedExtracted: ExtractedDoc,
  oppositeType: DocType
): Promise<{ mismatches: Mismatch[]; agentDrafted: boolean } | null> {
  const { data: existing } = await db
    .from("documents")
    .select("extracted")
    .eq("business_id", businessId)
    .eq("order_ref", orderRef)
    .eq("doc_type", oppositeType)
    .not("extracted", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing?.extracted) return null; // the pair isn't complete yet

  const invoice =
    justUploadedType === "commercial_invoice"
      ? justUploadedExtracted
      : (existing.extracted as ExtractedDoc);
  const packingList =
    justUploadedType === "packing_list"
      ? justUploadedExtracted
      : (existing.extracted as ExtractedDoc);

  const mismatches = compareDocuments(invoice, packingList);
  if (mismatches.length === 0) return { mismatches, agentDrafted: false };

  const task =
    `訂單 ${orderRef} 的請款單跟送貨單對不起來,草擬一封通知供應商的訊息,說明差異並請對方確認正確數字。\n\n` +
    mismatches.map((m) => `- ${m.field}：請款單 ${m.invoiceValue} / 送貨單 ${m.packingListValue}`).join("\n");

  let agentDrafted = false;
  try {
    await runAgent(db, {
      businessKey: BUSINESS_KEY,
      roleKey: "doc_check",
      actionType: "flag_doc_mismatch",
      task,
      notifyUserId: process.env.LINE_OWNER_USER_ID,
    });
    agentDrafted = true;
  } catch (err) {
    console.error("[documents] runAgent failed after a real mismatch was found", err);
  }

  return { mismatches, agentDrafted };
}

export type DocumentRow = {
  id: string;
  doc_type: DocType;
  order_ref: string | null;
  storage_path: string;
  extracted: Record<string, unknown> | null;
  created_at: string;
};

export async function listRecentDocuments(): Promise<DocumentRow[]> {
  const db = serverDb();
  const businessId = await getBusinessId(db);
  const { data, error } = await db
    .from("documents")
    .select("id, doc_type, order_ref, storage_path, extracted, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`讀取 documents 失敗: ${error.message}`);
  return (data ?? []) as DocumentRow[];
}
