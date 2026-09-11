// Applies ID Verification + Risk Assessment outcomes to ARCHIVE candidates by
// reading the original supplier report that was attached to the archive order.
//
// The rules mirror exactly what the live PreAppliCheck reports do:
//  - ID verification confirmed  -> "valid"
//  - anything else (no result / possible invalid ID / deceased / not confirmed)
//    -> "invalid"
//  - if ID verification is invalid the Risk Assessment is ALSO "invalid",
//    because a risk assessment can only be relied on when the ID is valid.
//  - otherwise the Risk Assessment outcome comes from the supplier wording:
//    "No further investigation ..."  -> no_risk
//    "Further investigation ..."     -> risk_identified

import { supabase } from "@/integrations/supabase/client";

export type ArchiveSupplierRecord = {
  id_number: string | null;
  id_prefix: string | null;
  status: string | null;
  first_names?: string | null;
  surname?: string | null;
  dead_alive?: string | null;
  risk_assessment?: string | null;
  risk_assessment_detail?: string | null;
  id_verification_detail?: string | null;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** True when the supplier ID verification block reads as NOT confirmed. */
const isIdInvalid = (rec: ArchiveSupplierRecord) => {
  const status = String(rec.status ?? "");
  const dead = String(rec.dead_alive ?? "");
  if (/decease|\bdead\b/i.test(dead)) return true;
  const negative =
    /not\s*confirm|unconfirm|no\s*result|invalid|not\s*found|fail|unable|error|decease/i.test(status);
  if (negative) return true;
  return !/confirm|complete|verified|\bvalid\b|match/i.test(status);
};

export interface ApplyArchiveOutcomesResult {
  matched: number;
  matchedIds: string[];
  unmatched: string[];
  records: number;
}

/**
 * Extracts the per-candidate outcomes from an archive report PDF and writes them
 * onto the archive order's candidates.
 */
export async function applyArchiveReportOutcomes(
  submissionId: string,
  file: File,
  reportLabel: string,
): Promise<ApplyArchiveOutcomesResult> {
  const base64 = await blobToBase64(file);
  const { data, error } = await supabase.functions.invoke("extract-supplier-report-ids", {
    body: { fileBase64: base64, contentType: file.type || "application/pdf" },
  });
  if (error) throw error;
  if (!(data as any)?.success) throw new Error((data as any)?.error || "Extraction failed");

  const records: ArchiveSupplierRecord[] = Array.isArray((data as any).records)
    ? ((data as any).records as ArchiveSupplierRecord[])
    : [];
  const fullIds: string[] = Array.isArray((data as any).ids) ? ((data as any).ids as string[]) : [];

  const { data: cands } = await supabase
    .from("manual_risk_candidates")
    .select("id, id_number, first_name, surname")
    .eq("submission_id", submissionId);

  const rows = (cands ?? []) as Array<{
    id: string; id_number: string | null; first_name: string | null; surname: string | null;
  }>;

  let matched = 0;
  const matchedIds: string[] = [];
  const used = new Set<ArchiveSupplierRecord>();

  for (const c of rows) {
    const digits = String(c.id_number ?? "").replace(/\D/g, "");
    const prefix = digits.slice(0, 6);
    const cs = norm(c.surname);
    const cf = norm(c.first_name);
    // A report record is the same person only when at least TWO of surname,
    // first name and the first 6 ID digits agree.
    const score = (r: ArchiveSupplierRecord) => {
      const rs = norm(r.surname);
      const rf = norm(r.first_names);
      const rp = String(r.id_prefix ?? "").replace(/\D/g, "").slice(0, 6);
      const surnameHit = !!rs && !!cs && rs === cs;
      const firstHit = !!rf && !!cf && (rf === cf || rf.startsWith(cf) || cf.startsWith(rf));
      const prefixHit = rp.length === 6 && rp === prefix;
      return [surnameHit, firstHit, prefixHit].filter(Boolean).length;
    };
    let rec: ArchiveSupplierRecord | undefined;
    let bestScore = 1;
    for (const r of records) {
      const s = score(r);
      if (s > bestScore) { bestScore = s; rec = r; }
    }
    if (!rec && fullIds.includes(digits)) {
      rec = { id_prefix: prefix, status: "Confirmed" } as ArchiveSupplierRecord;
    }
    if (!rec) continue;

    used.add(rec);

    const invalid = isIdInvalid(rec);
    const raText = String(rec.risk_assessment ?? "");
    const raDetail = String(rec.risk_assessment_detail ?? "").trim();
    const idDetail = String(rec.id_verification_detail ?? "").trim();
    const update: Record<string, unknown> = {
      id_verification_result: invalid ? "invalid" : "valid",
      id_verification_notes: [
        `Auto-populated from archive report ${reportLabel}`,
        rec.status ? `Status: ${rec.status}` : null,
        idDetail || null,
      ].filter(Boolean).join(" • "),
      id_verification_data: rec as unknown as Record<string, unknown>,
    };

    if (invalid) {
      // Same rule as the live reports: no valid ID means the risk assessment
      // cannot be relied upon.
      update.risk_assessment_result = "invalid";
      update.risk_assessment_notes = [
        `Risk Assessment invalid — ID verification could not be confirmed${raText ? ` (supplier risk assessment: ${raText})` : ""}.`,
        raDetail || null,
      ].filter(Boolean).join(" • ");
    } else if (raText) {
      const isNoRisk = /no\s+further\s+investigation/i.test(raText);
      const isRisk = /further\s+investigation/i.test(raText) && !isNoRisk;
      if (isNoRisk || isRisk) {
        update.risk_assessment_result = isNoRisk ? "no_risk" : "risk_identified";
        update.risk_assessment_notes = [
          isRisk
            ? `Probable Risk Identified — candidate should have their fingerprints submitted for clearance (archive report ${reportLabel}: ${raText}).`
            : `Auto-populated from archive report ${reportLabel}: ${raText}`,
          raDetail || null,
        ].filter(Boolean).join(" • ");
      }
    }

    const { error: uErr } = await supabase
      .from("manual_risk_candidates")
      .update(update as never)
      .eq("id", c.id);
    if (!uErr) {
      matched++;
      matchedIds.push(c.id);
    }
  }

  const unmatched = records
    .filter((r) => !used.has(r))
    .map((r) => `${r.first_names ?? ""} ${r.surname ?? ""} (${r.id_prefix ?? "?"})`.trim());

  return { matched, matchedIds, unmatched, records: records.length };
}

/** Reads a supplier report PDF and returns the per-candidate records only
 *  (names + masked ID prefixes) so a report can be matched to an archive order
 *  by the people it contains, without writing anything. */
export async function extractArchiveReportRecords(file: File): Promise<ArchiveSupplierRecord[]> {
  const base64 = await blobToBase64(file);
  const { data, error } = await supabase.functions.invoke("extract-supplier-report-ids", {
    body: { fileBase64: base64, contentType: file.type || "application/pdf" },
  });
  if (error) throw error;
  if (!(data as any)?.success) throw new Error((data as any)?.error || "Extraction failed");
  return Array.isArray((data as any).records) ? ((data as any).records as ArchiveSupplierRecord[]) : [];
}

export const normPersonName = norm;
