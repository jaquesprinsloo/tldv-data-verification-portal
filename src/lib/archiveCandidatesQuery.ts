// One shared read of the archive people.
//
// Both archive cards (the report audit and the name reconciliation) used to scan
// every candidate row on their own, in overlapping requests. That was the second
// slowest read in the app and was being cancelled by the database under load.
// They now share this single cached read.

import { useQuery } from "@tanstack/react-query";
import { supabase as sb } from "@/integrations/supabase/client";

export type ArchiveCandidate = {
  id: string;
  id_number: string | null;
  passport_number?: string | null;
  first_name: string | null;
  surname: string | null;
  submission_id: string;
  report_matched_at: string | null;
  report_matched_file: string | null;
  id_verification_result?: string | null;
  risk_assessment_result?: string | null;
};

export const ARCHIVE_CANDIDATES_KEY = ["mra-archive-candidates"] as const;

export async function fetchArchiveCandidates(): Promise<ArchiveCandidate[]> {
  const cols =
    "id, id_number, passport_number, first_name, surname, submission_id, report_matched_at, report_matched_file, id_verification_result, risk_assessment_result, manual_risk_submissions!inner(is_archive)";

  const out: ArchiveCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("manual_risk_candidates")
      .select(cols)
      .eq("manual_risk_submissions.is_archive", true)
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ArchiveCandidate[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export function useArchiveCandidates(enabled = true) {
  return useQuery<ArchiveCandidate[]>({
    queryKey: ARCHIVE_CANDIDATES_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: fetchArchiveCandidates,
  });
}
