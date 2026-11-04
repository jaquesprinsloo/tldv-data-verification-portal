import { readAllPages } from "./paginatedRead";

type PtvsCandidate = {
  submission_id: string;
  is_ptvs_discount?: boolean;
  ptvs_invoice_batch_id?: string | null;
};

/** Scope locally: an IN filter containing every order exceeds request URL limits. */
export async function readPendingPtvsCandidates<T extends PtvsCandidate>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  submissionIds: string[],
): Promise<T[]> {
  const allowed = new Set(submissionIds);
  const candidates = await readAllPages(fetchPage);
  return candidates.filter((c) => allowed.has(c.submission_id)
    && c.is_ptvs_discount === true && c.ptvs_invoice_batch_id == null);
}