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

/** Name parts that are far too common to identify anybody on their own. */
const COMMON_NAME_PARTS = new Set([
  "van", "der", "den", "de", "du", "le", "la", "dos", "das", "bin", "ben",
  "mr", "mrs", "ms", "miss", "jnr", "jr", "snr", "sr", "the", "and",
]);

const nameTokens = (...values: unknown[]) =>
  values
    .flatMap((value) => String(value ?? "").toLowerCase().split(/[^a-z]+/))
    .map((value) => value.trim())
    /** Short fragments and name particles carry no identifying weight. */
    .filter((value) => value.length >= 4 && !COMMON_NAME_PARTS.has(value));

/**
 * Edit distance, capped for speed — used only for one-letter spelling slips and
 * for two letters typed the wrong way round ("Taritus" / "Tartius"), which is
 * counted as a single slip.
 */
const editDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        rows[i - 1][j] + 1,
        cur[j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // Two neighbouring letters swapped round counts as one slip.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], rows[i - 2][j - 2] + 1);
      }
    }
    rows[i] = cur;
  }
  return rows[a.length][b.length];
};


/**
 * Names on old reports are often a letter out ("Phuti" vs "Phuthi", "Peu" vs
 * "Pev"). Two names count as the same person's name only when they are the same
 * word or differ by a single letter, and are long enough to mean something.
 */
const nearName = (a: string, b: string) =>
  !!a && !!b && a.length >= 3 && b.length >= 3 && editDistance(a, b) <= 1;


/**
 * Historical spreadsheets sometimes put a person's first name in the surname
 * column (and vice versa). Keep the normal field-by-field match, and allow that
 * swap only when the masked ID prefix agrees AND the names line up properly:
 * either a straight swap of the two fields, or two distinctive shared names.
 * A single shared name word is never enough — a shared birth date plus one
 * common name would otherwise tick off the wrong person.
 */
export function matchArchivePerson(
  report: Pick<ArchiveSupplierRecord, "first_names" | "surname" | "id_prefix">,
  candidate: { first_name: string | null; surname: string | null; id_number: string | null },
) {
  const rs = norm(report.surname);
  const rf = norm(report.first_names);
  const cs = norm(candidate.surname);
  const cf = norm(candidate.first_name);
  const reportPrefix = String(report.id_prefix ?? "").replace(/\D/g, "").slice(0, 6);
  const candidatePrefix = String(candidate.id_number ?? "").replace(/\D/g, "").slice(0, 6);
  const surnameHit = !!rs && !!cs && rs === cs;
  const firstHit = !!rf && !!cf && (rf === cf || rf.startsWith(cf) || cf.startsWith(rf));
  const prefixHit = reportPrefix.length === 6 && reportPrefix === candidatePrefix;
  const reportTokens = nameTokens(report.first_names, report.surname);
  const candidateTokens = nameTokens(candidate.first_name, candidate.surname);
  /** Same word, or a single-letter spelling slip ("Phuti" / "Phuthi"). */
  const sharedNameTokens = candidateTokens
    .filter((token) => reportTokens.some((rt) => nearName(token, rt)));
  /** The two fields are simply the other way round (a letter out is allowed). */
  const swapHit = nearName(rs, cf) || nearName(rf, cs);
  const crossFieldHit = swapHit || sharedNameTokens.length >= 2 ||
    /** One distinctive name plus an exact date of birth in a swapped field. */
    (sharedNameTokens.length === 1 && (nearName(rs, cf) || nearName(rf, cs) ||
      reportTokens.some((rt) => nearName(rt, cf)) || candidateTokens.some((ct) => nearName(ct, rs))));

  const directHits = [surnameHit, firstHit, prefixHit].filter(Boolean).length;

  return {
    matches: directHits >= 2 || (prefixHit && crossFieldHit),
    strong: directHits === 3 || (prefixHit && crossFieldHit),
    prefixHit,
    /** Higher means a better fit; used to pick the best of several records. */
    score: directHits * 2 + (swapHit ? 2 : 0) + sharedNameTokens.length,
  };
}

/**
 * Early archive checks often had NO ID verification at all — only a Risk
 * Assessment. Three outcomes are possible:
 *   "valid"   — ID confirmed by Home Affairs
 *   "invalid" — an ID check was done and it failed (no result / deceased /
 *               not confirmed) → the Risk Assessment cannot be relied upon
 *   "none"    — no ID verification was included; the ID stays blank and the
 *               Risk Assessment outcome stands on its own
 */
export function classifyArchiveIdVerification(
  rec: Pick<ArchiveSupplierRecord, "status" | "dead_alive" | "id_verification_detail" | "risk_assessment">,
): "valid" | "invalid" | "none" {
  const status = String(rec.status ?? "").trim();
  const detail = String(rec.id_verification_detail ?? "").trim();
  const dead = String(rec.dead_alive ?? "");
  const blob = `${status} ${detail}`;

  if (/decease|\bdead\b/i.test(dead)) return "invalid";
  if (/not\s*confirm|unconfirm|no\s*result|invalid|not\s*found|not\s*verified|fail|unable|error|decease/i.test(blob)) {
    return "invalid";
  }
  if (/confirm|verified|\bvalid\b|match|alive/i.test(blob)) return "valid";

  // Nothing but a section heading, the risk-assessment wording, or an empty
  // block means the ID verification simply was not part of this check.
  return "none";
}

/** True when the supplier ID verification block reads as NOT confirmed. */
const isIdInvalid = (rec: ArchiveSupplierRecord) => classifyArchiveIdVerification(rec) === "invalid";

/** Structural check of a South African ID: 13 digits, real birth date, valid checksum. */
export function isStructurallyValidSaId(idNumber: unknown): boolean {
  const s = String(idNumber ?? "").replace(/\D/g, "");
  if (s.length !== 13) return false;
  const yy = Number(s.slice(0, 2)), mm = Number(s.slice(2, 4)), dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const century = yy <= new Date().getFullYear() % 100 ? 2000 : 1900;
  const d = new Date(century + yy, mm - 1, dd);
  if (d.getMonth() !== mm - 1 || d.getDate() !== dd) return false;
  let total = 0;
  for (let i = 0; i < 13; i++) {
    let dig = Number(s[12 - i]);
    if (i % 2 === 1) { dig *= 2; if (dig > 9) dig -= 9; }
    total += dig;
  }
  return total % 10 === 0;
}

/**
 * Guards against a reading error where the SAME failing ID-verification wording
 * is copied onto several people in one report (it belongs to one candidate only).
 * Returns the set of records whose failing ID block cannot be trusted: the exact
 * same failure text appears on another person too, and this person's own ID
 * number is structurally valid.
 */
function findSharedIdFailures(
  records: ArchiveSupplierRecord[],
): Set<ArchiveSupplierRecord> {
  const suspect = new Set<ArchiveSupplierRecord>();
  const groups = new Map<string, ArchiveSupplierRecord[]>();
  for (const r of records) {
    if (!isIdInvalid(r)) continue;
    const key = `${String(r.status ?? "").trim().toLowerCase()}|${String(r.id_verification_detail ?? "").trim().toLowerCase()}`;
    if (!key.replace(/[|\s]/g, "")) continue;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Only treat as copied text when at least one person in the group really
    // does have a broken ID number — that is whose failure it is.
    const owners = group.filter((r) => !isStructurallyValidSaId(r.id_number));
    if (owners.length === 0 || owners.length === group.length) continue;
    for (const r of group) if (isStructurallyValidSaId(r.id_number)) suspect.add(r);
  }
  return suspect;
}



export interface ApplyArchiveOutcomesResult {
  matched: number;
  matchedIds: string[];
  unmatched: string[];
  records: number;
  /** People whose stored ID / Risk Assessment outcome was corrected. */
  changed: number;
}

type ArchiveCandidateRow = {
  id: string;
  id_number: string | null;
  first_name: string | null;
  surname: string | null;
  id_verification_result?: string | null;
  risk_assessment_result?: string | null;
};

/**
 * Writes the per-candidate outcomes from an already-extracted supplier report
 * onto the given archive candidates. Every field of a person's result comes only
 * from that person's own block on the report — one failing ID never touches
 * anybody else on the same batch.
 */
export async function applyArchiveOutcomesFromRecords(
  records: ArchiveSupplierRecord[],
  fullIds: string[],
  rows: ArchiveCandidateRow[],
  reportLabel: string,
): Promise<ApplyArchiveOutcomesResult> {
  let matched = 0;
  let changed = 0;
  const matchedIds: string[] = [];
  const used = new Set<ArchiveSupplierRecord>();
  const sharedIdFailures = findSharedIdFailures(records);

  for (const c of rows) {
    const digits = String(c.id_number ?? "").replace(/\D/g, "");
    const prefix = digits.slice(0, 6);
    // The best fit on the report wins, not merely the first passable one.
    let rec: ArchiveSupplierRecord | undefined;
    let best = -1;
    for (const r of records) {
      const m = matchArchivePerson(r, c);
      if (m.matches && m.score > best) { best = m.score; rec = r; }
    }
    if (!rec && fullIds.includes(digits)) {
      rec = { id_prefix: prefix, status: "Confirmed" } as ArchiveSupplierRecord;
    }
    if (!rec) continue;

    used.add(rec);

    // A failing ID block that was copied from another person on the same report
    // must not condemn this candidate; their ID verification is left blank.
    const copiedIdFailure = sharedIdFailures.has(rec);
    const idState = copiedIdFailure ? "none" : classifyArchiveIdVerification(rec);
    const invalid = idState === "invalid";
    const raText = String(rec.risk_assessment ?? "");
    const raDetail = String(rec.risk_assessment_detail ?? "").trim();
    const idDetail = String(rec.id_verification_detail ?? "").trim();
    const update: Record<string, unknown> = {
      id_verification_result: idState === "none" ? null : idState,
      id_verification_notes: idState === "none"
        ? copiedIdFailure
          ? `No ID Verification result could be attributed to this candidate on archive report ${reportLabel} — the failed ID wording on that report belongs to another candidate.`
          : `No ID Verification was included with this Risk Assessment (archive report ${reportLabel}).`
        : [
            `Auto-populated from archive report ${reportLabel}`,
            rec.status ? `Status: ${rec.status}` : null,
            idDetail || null,
          ].filter(Boolean).join(" • "),
      id_verification_data: rec as unknown as Record<string, unknown>,
    };


    if (invalid) {
      // Same rule as the live reports: an ID check that failed means the risk
      // assessment cannot be relied upon.
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

    const wasId = c.id_verification_result ?? null;
    const wasRa = c.risk_assessment_result ?? null;
    const nowId = (update.id_verification_result as string | null) ?? null;
    const nowRa = "risk_assessment_result" in update
      ? (update.risk_assessment_result as string | null) ?? null
      : wasRa;

    const { error: uErr } = await supabase
      .from("manual_risk_candidates")
      .update(update as never)
      .eq("id", c.id);
    if (!uErr) {
      matched++;
      matchedIds.push(c.id);
      if (nowId !== wasId || nowRa !== wasRa) changed++;
    }
  }

  const unmatched = records
    .filter((r) => !used.has(r))
    .map((r) => `${r.first_names ?? ""} ${r.surname ?? ""} (${r.id_prefix ?? "?"})`.trim());

  return { matched, matchedIds, unmatched, records: records.length, changed };
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
    .select("id, id_number, first_name, surname, id_verification_result, risk_assessment_result")
    .eq("submission_id", submissionId);

  return applyArchiveOutcomesFromRecords(
    records,
    fullIds,
    (cands ?? []) as ArchiveCandidateRow[],
    reportLabel,
  );
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
