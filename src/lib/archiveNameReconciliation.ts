// Keeps track, permanently in the database, of the two sides of the archive
// name reconciliation:
//
//  1. names that were read off an original report but could not be found on any
//     archive order (people who were clearly checked, but are missing from the
//     loaded history), and
//  2. archive people who have not yet been confirmed by a report — a candidate
//     is stamped with `report_matched_at` the moment a report naming them is
//     read, so they drop off that outstanding list.

import { supabase as sb } from "@/integrations/supabase/client";

export type UnmatchedReportName = {
  id: string;
  report_file_name: string;
  report_date: string | null;
  store_label: string | null;
  linked_submission_id: string | null;
  first_names: string | null;
  surname: string | null;
  full_name: string;
  id_prefix: string | null;
  status: string;
  notes: string | null;
  resolved_candidate_id: string | null;
  created_at: string;
};

/** Stamps every archive person a report has just confirmed. */
export async function markCandidatesReportMatched(
  candidateIds: string[],
  reportFileName: string,
): Promise<void> {
  const ids = Array.from(new Set(candidateIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    await sb
      .from("manual_risk_candidates")
      .update({
        report_matched_at: new Date().toISOString(),
        report_matched_file: reportFileName,
      } as never)
      .in("id", slice);
  }
}

/** Writes down the people a report names who are nowhere in the archive. */
export async function recordUnmatchedReportNames(
  entries: {
    fullName: string;
    firstNames?: string | null;
    surname?: string | null;
    idPrefix?: string | null;
    reportFileName: string;
    reportDate?: string | null;
    storeLabel?: string | null;
    linkedSubmissionId?: string | null;
    raw?: unknown;
  }[],
): Promise<void> {
  if (!entries.length) return;
  const rows = entries.map((e) => ({
    full_name: e.fullName || "(name unreadable)",
    first_names: e.firstNames ?? null,
    surname: e.surname ?? null,
    id_prefix: e.idPrefix ?? null,
    report_file_name: e.reportFileName,
    report_date: e.reportDate ?? null,
    store_label: e.storeLabel ?? null,
    linked_submission_id: e.linkedSubmissionId ?? null,
    raw: (e.raw ?? null) as never,
  }));
  // Same person on the same report is only ever written once.
  await sb
    .from("manual_risk_report_unmatched_names")
    .upsert(rows as never, { ignoreDuplicates: true, onConflict: "full_name" })
    .then(
      () => undefined,
      async () => {
        // The unique guard is a lowercase expression index, so a plain insert
        // may bounce — fall back to inserting them one by one and ignore clashes.
        for (const r of rows) {
          await sb.from("manual_risk_report_unmatched_names").insert(r as never);
        }
      },
    );
}
