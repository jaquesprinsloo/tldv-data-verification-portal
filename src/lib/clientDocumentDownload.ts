// Downloading of released documents (Risk Assessment report and the signed
// indemnities) for client-facing profiles. A single file downloads as-is; any
// larger selection is packaged as a ZIP with one folder per order.

import { supabase } from "@/integrations/supabase/client";
import {
  CHECK_COLUMNS,
  isPlaceholderCandidate,
  generateManualRiskPdf,
  type ManualRiskCandidatePdf,
} from "@/lib/manualRiskPdf";
import { fetchArchiveOriginalReport } from "@/lib/archiveOriginalReport";

const sb = supabase as any;

export type DownloadWhat = "report" | "indemnities" | "both";

export type IndemnityRef = { path: string; name?: string };

const safe = (s: string) => String(s ?? "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "file";

/**
 * Rebuilds the report exactly as it was released for one order. Historical
 * (archive) orders return their original supplier report as received.
 */
export async function buildReportBlobForSubmission(
  submissionId: string,
): Promise<{ blob: Blob; orderNumber: string; fileName: string }> {
  const [{ data: sub, error: subErr }, { data: cands, error: candErr }, { data: settings }] =
    await Promise.all([
      sb.from("manual_risk_submissions").select("*").eq("id", submissionId).maybeSingle(),
      sb
        .from("manual_risk_candidates")
        .select("*")
        .eq("submission_id", submissionId)
        .order("sort_order", { ascending: true }),
      sb.from("manual_risk_settings").select("terms_and_conditions").limit(1).maybeSingle(),
    ]);
  if (subErr) throw subErr;
  if (candErr) throw candErr;
  if (!sub) throw new Error("Order not found");

  const orderNumber: string = sub.order_number;
  const fileName = `Risk Assessment Report - ${safe(orderNumber)}.pdf`;

  const original = await fetchArchiveOriginalReport(sub);
  if (original) return { blob: original, orderNumber, fileName };

  let client: any = null;
  if (sub.client_id) {
    const { data } = await sb
      .from("manual_risk_clients")
      .select("client_name, contact_person, email")
      .eq("id", sub.client_id)
      .maybeSingle();
    client = data;
  }

  const activeChecks = (sub.requested_checks?.length
    ? sub.requested_checks
    : ["id_verification", "credit", "criminal"]
  ).filter((k: string) => CHECK_COLUMNS[k]);

  const candidates: ManualRiskCandidatePdf[] = (cands ?? [])
    .filter((c: any) => !isPlaceholderCandidate(c))
    .map((c: any) => {
      const results: Record<string, string | null> = {};
      const notes: Record<string, string | null> = {};
      for (const k of activeChecks) {
        results[k] = c[CHECK_COLUMNS[k].result] ?? null;
        notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
      }
      return {
        id_number: c.id_number,
        surname: c.surname,
        first_name: c.first_name,
        results,
        notes,
        id_verification_data: c.id_verification_data ?? null,
        passport_number: c.passport_number ?? null,
        tfs_screened_at: c.tfs_screened_at ?? null,
        tfs_list_version: c.tfs_list_version ?? null,
        tfs_match_basis: c.tfs_match_basis ?? null,
      };
    });

  const blob = await generateManualRiskPdf({
    orderNumber,
    clientName: client?.client_name,
    clientContact: client?.contact_person,
    clientEmail: client?.email,
    submissionType: sub.submission_type,
    candidates,
    termsAndConditions: settings?.terms_and_conditions ?? "",
    requestedChecks: activeChecks,
    skipEncryption: true,
  });
  return { blob, orderNumber, fileName };
}

/** Downloads every indemnity stored for one order. */
export async function fetchIndemnityBlobs(
  files: IndemnityRef[],
): Promise<{ name: string; blob: Blob }[]> {
  const out: { name: string; blob: Blob }[] = [];
  for (const f of files) {
    const { data } = await supabase.storage.from("manual-risk-indemnities").download(f.path);
    if (data) out.push({ name: safe(f.name ?? f.path.split("/").pop() ?? "indemnity.pdf"), blob: data });
  }
  return out;
}

const CHECK_LABELS: Record<string, string> = {
  id_verification: "ID Verification",
  credit: "Credit",
  risk_assessment: "Risk Assessment",
  drivers_license: "Driver's Licence",
  pdp: "PDP",
  qualification: "Qualification",
  criminal: "Criminal",
  tfs: "TFS Sanctions",
};

const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("en-ZA") : "");

/** Builds an Excel summary for one order linking its candidates, results and files. */
export async function buildOrderSummaryWorkbook(
  submissionId: string,
  linkedFiles: string[],
): Promise<Blob> {
  const XLSX = await import("xlsx");
  const [{ data: sub }, { data: cands }] = await Promise.all([
    sb.from("manual_risk_submissions").select("*").eq("id", submissionId).maybeSingle(),
    sb.from("manual_risk_candidates").select("*").eq("submission_id", submissionId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!sub) throw new Error("Order not found");
  let clientName = "";
  if (sub.client_id) {
    const { data } = await sb.from("manual_risk_clients").select("client_name")
      .eq("id", sub.client_id).maybeSingle();
    clientName = data?.client_name ?? "";
  }
  const checks = (sub.requested_checks?.length
    ? sub.requested_checks
    : ["id_verification", "credit", "criminal"]).filter((k: string) => CHECK_COLUMNS[k]);

  const overview = [
    ["Background Screening Order Summary"],
    [],
    ["Order Number", sub.order_number ?? ""],
    ["Account", clientName],
    ["Submission Type", sub.submission_type ?? ""],
    ["Submitted", fmtDate(sub.submitted_at ?? sub.created_at)],
    ["Report Released", fmtDate(sub.sent_at ?? sub.released_at)],
    ["Checks Requested", checks.map((k: string) => CHECK_LABELS[k] ?? k).join(", ")],
    [],
    ["Files in this folder"],
    ...linkedFiles.map((f) => [f]),
  ];

  const header = ["Order Number", "First Name", "Surname", "ID Number", "Passport Number"];
  for (const k of checks) header.push(`${CHECK_LABELS[k] ?? k} Result`, `${CHECK_LABELS[k] ?? k} Notes`);
  const rows = (cands ?? []).filter((c: any) => !isPlaceholderCandidate(c)).map((c: any) => {
    const r = [sub.order_number ?? "", c.first_name ?? "", c.surname ?? "", String(c.id_number ?? ""), c.passport_number ?? ""];
    for (const k of checks) r.push(c[CHECK_COLUMNS[k].result] ?? "", c[CHECK_COLUMNS[k].notes] ?? "");
    return r;
  });

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(overview);
  ws1["!cols"] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Order");
  const ws2 = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Keep ID numbers as text so leading zeros survive.
  rows.forEach((_: any, i: number) => {
    const cell = ws2[XLSX.utils.encode_cell({ r: i + 1, c: 3 })];
    if (cell) { cell.t = "s"; cell.z = "@"; }
  });
  ws2["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws2, "Candidates");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export type OrderDocsTarget = {
  submissionId: string;
  orderNumber: string;
  indemnities: IndemnityRef[];
};

/**
 * Collects the requested documents for the given orders and hands them to the
 * browser: each order folder also gets an Excel summary, so
 * downloads are packaged as a ZIP.
 */
export async function downloadOrderDocuments(
  targets: OrderDocsTarget[],
  what: DownloadWhat,
  opts: { zipName?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ files: number; missing: string[] }> {
  const collected: { path: string; blob: Blob }[] = [];
  const missing: string[] = [];

  let done = 0;
  for (const t of targets) {
    const folder = safe(t.orderNumber);
    if (what === "report" || what === "both") {
      try {
        const { blob, fileName } = await buildReportBlobForSubmission(t.submissionId);
        collected.push({ path: `${folder}/${fileName}`, blob });
      } catch {
        missing.push(`${t.orderNumber} — report`);
      }
    }
    if (what === "indemnities" || what === "both") {
      const blobs = await fetchIndemnityBlobs(t.indemnities);
      if (!blobs.length) missing.push(`${t.orderNumber} — indemnities`);
      blobs.forEach((b, i) =>
        collected.push({ path: `${folder}/Indemnities/${i + 1} - ${b.name}`, blob: b.blob }),
      );
    }
    const orderFiles = collected
      .filter((c) => c.path.startsWith(`${folder}/`))
      .map((c) => c.path.slice(folder.length + 1));
    if (orderFiles.length) {
      try {
        const xlsx = await buildOrderSummaryWorkbook(t.submissionId, orderFiles);
        collected.push({ path: `${folder}/Order Summary - ${folder}.xlsx`, blob: xlsx });
      } catch {
        missing.push(`${t.orderNumber} — summary spreadsheet`);
      }
    }
    done += 1;
    opts.onProgress?.(done, targets.length);
  }

  if (!collected.length) return { files: 0, missing };

  if (collected.length === 1) {
    const only = collected[0];
    saveBlob(only.blob, only.path.split("/").pop()!);
    return { files: 1, missing };
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of collected) zip.file(f.path, f.blob);
  const out = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  saveBlob(out, safe(opts.zipName ?? `screening-documents-${stamp}`) + ".zip");
  return { files: collected.length, missing };
}
