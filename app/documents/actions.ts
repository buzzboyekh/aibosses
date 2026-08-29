"use server";

// Server actions for the /documents feature. This is the only place that
// touches Supabase for this feature — serverDb() is service-role and must
// stay server-side only (Kun's rule), so nothing here is imported into a
// client component; page.tsx calls these as form actions instead.

import { revalidatePath } from "next/cache";
import { serverDb } from "../../context/buildContext";
import { runAgent } from "../../agents/run";
import { extractDocument } from "../../documents/extract";
import { compareDocuments } from "../../documents/compare";
import type { DocType, ExtractedDoc } from "../../documents/types";

const BUSINESS_KEY = process.env.BUSINESS_KEY ?? "demo-import";

// Only these two doc types get cross-checked against each other. Everything
// else (rfq, supplier_quote, other) is still extracted and stored — it just
// doesn't have a "pair" to compare against.
const OPPOSITE_DOC_TYPE: Partial<Record<DocType, DocType>> = {
  commercial_invoice: "packing_list",
  packing_list: "commercial_invoice",
};

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
 * Stage 2: upload -> Storage -> AI extraction -> DB row -> if this completes
 * an invoice/packing-list pair for the same order_ref, compare them and, on
 * a real mismatch, ask the doc_check agent to draft a customer notice.
 */
export async function uploadDocument(formData: FormData): Promise<void> {
  const file = formData.get("file");
  const docType = formData.get("doc_type") as DocType | null;
  const orderRef = (formData.get("order_ref") as string | null)?.trim() || null;

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("請選擇一個檔案");
  }
  if (!docType) {
    throw new Error("請選擇文件類型");
  }
  if (!orderRef) {
    throw new Error("請填訂單參考碼（用來配對發票跟裝箱單）");
  }

  const db = serverDb();
  const businessId = await getBusinessId(db);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${BUSINESS_KEY}/${docType}/${Date.now()}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const { error: uploadError } = await db.storage
    .from("docs")
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`檔案上傳失敗: ${uploadError.message}`);

  const extracted = await extractDocument(bytes, mimeType, docType);

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
  if (insertError || !inserted) throw new Error(`寫入 documents 失敗: ${insertError?.message}`);

  const opposite = OPPOSITE_DOC_TYPE[docType];
  if (opposite) {
    await checkForMismatch(db, businessId, orderRef, docType, extracted, opposite);
  }

  revalidatePath("/documents");
}

/**
 * If the order's other document (invoice <-> packing list) is already
 * uploaded, compare the two deterministically. Only on a real disagreement
 * do we call the doc_check agent — it drafts the customer notice, the owner
 * approves it on LINE, nothing is invented or sent automatically.
 */
async function checkForMismatch(
  db: ReturnType<typeof serverDb>,
  businessId: string,
  orderRef: string,
  justUploadedType: DocType,
  justUploadedExtracted: ExtractedDoc,
  oppositeType: DocType
): Promise<void> {
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
  if (!existing?.extracted) return; // the pair isn't complete yet

  const invoice =
    justUploadedType === "commercial_invoice"
      ? justUploadedExtracted
      : (existing.extracted as ExtractedDoc);
  const packingList =
    justUploadedType === "packing_list"
      ? justUploadedExtracted
      : (existing.extracted as ExtractedDoc);

  const mismatches = compareDocuments(invoice, packingList);
  if (mismatches.length === 0) return;

  const task =
    `訂單 ${orderRef} 的商業發票跟裝箱單對不起來,草擬一封通知客人的訊息,說明差異並請客人確認正確數字。\n\n` +
    mismatches.map((m) => `- ${m.field}：發票 ${m.invoiceValue} / 裝箱單 ${m.packingListValue}`).join("\n");

  await runAgent(db, {
    businessKey: BUSINESS_KEY,
    roleKey: "doc_check",
    actionType: "flag_doc_mismatch",
    task,
    notifyUserId: process.env.LINE_OWNER_USER_ID,
  });
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
