import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export const TFS_LIST_TITLE = "Consolidated United Nations Security Council Sanctions List";

const clean = (v: unknown) => String(v ?? "").trim();
const tokens = (v: unknown) =>
  clean(v).toLowerCase().replace(/[^a-z\s]+/g, " ").split(/\s+/).filter((t) => t.length > 1);
const digits = (v: unknown) => clean(v).replace(/[^0-9]/g, "");
const alnum = (v: unknown) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface SanctionsListInfo {
  id: string;
  list_name: string;
  version_label: string | null;
  file_name: string | null;
  individual_count: number;
  entity_count: number;
  created_at: string;
}

export interface TfsCandidate {
  id: string;
  first_name: string | null;
  surname: string | null;
  id_number: string | null;
  passport_number?: string | null;
}

/** The sanctions list snapshot currently in use, or null if none has been uploaded. */
export async function fetchCurrentSanctionsList(): Promise<SanctionsListInfo | null> {
  const { data, error } = await sb
    .from("manual_risk_sanctions_lists")
    .select("id, list_name, version_label, file_name, individual_count, entity_count, created_at, is_current")
    .order("is_current", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as SanctionsListInfo) ?? null;
}

export function listDescriptor(l: SanctionsListInfo) {
  const version = l.version_label ?? new Date(l.created_at).toISOString().slice(0, 10);
  return `${TFS_LIST_TITLE} — version ${version} (${l.individual_count} persons, ${l.entity_count} organisations), loaded ${new Date(l.created_at).toLocaleDateString("en-ZA")}`;
}

/** Human wording for what candidate details were compared. */
export function basisFor(c: TfsCandidate) {
  const parts = ["Full name and surname"];
  if (digits(c.id_number).length >= 6) parts.push(`ID number ${clean(c.id_number)}`);
  if (clean(c.passport_number)) parts.push(`passport/permit number ${clean(c.passport_number)}`);
  return parts.join(" + ");
}

interface Entry {
  id: string;
  entry_type: string;
  reference_number: string | null;
  full_name: string;
  aliases: string | null;
  documents: string | null;
  date_of_birth: string | null;
  nationality: string | null;
}

async function fetchEntries(listId: string): Promise<Entry[]> {
  const out: Entry[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb
      .from("manual_risk_sanctions_entries")
      .select("id, entry_type, reference_number, full_name, aliases, documents, date_of_birth, nationality")
      .eq("list_id", listId)
      .range(from, from + size - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Entry[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export interface TfsScreenResult {
  screened: number;
  hits: number;
  listUsed: SanctionsListInfo | null;
}

/**
 * Compares every candidate of a submission against the current sanctions list on
 * name (including aliases), ID number and passport number, then records the outcome
 * on each candidate. Possible matches are logged for review in the Compliance tab.
 */
export async function runTfsScreening(submissionId: string): Promise<TfsScreenResult> {
  const { data: cands, error: cErr } = await sb
    .from("manual_risk_candidates")
    .select("id, first_name, surname, id_number, passport_number")
    .eq("submission_id", submissionId);
  if (cErr) throw cErr;
  const candidates = ((cands ?? []) as TfsCandidate[]).filter(
    (c) => clean(c.surname) && clean(c.first_name),
  );
  if (!candidates.length) return { screened: 0, hits: 0, listUsed: null };

  const list = await fetchCurrentSanctionsList();
  if (!list) {
    await sb
      .from("manual_risk_candidates")
      .update({
        tfs_result: "pending",
        tfs_notes:
          "TFS screening could not be run — no sanctions list has been uploaded under Compliance yet.",
      })
      .eq("submission_id", submissionId);
    return { screened: 0, hits: 0, listUsed: null };
  }

  const entries = await fetchEntries(list.id);
  const byToken = new Map<string, Entry[]>();
  const byDoc = new Map<string, Entry[]>();
  for (const e of entries) {
    for (const t of new Set(tokens(`${e.full_name} ${e.aliases ?? ""}`))) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t)!.push(e);
    }
    for (const raw of clean(e.documents).split(/[;,/|]+/)) {
      const key = alnum(raw);
      if (key.length >= 6) {
        if (!byDoc.has(key)) byDoc.set(key, []);
        byDoc.get(key)!.push(e);
      }
    }
  }

  const descriptor = listDescriptor(list);
  const version = list.version_label ?? new Date(list.created_at).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const matchRows: any[] = [];
  let hits = 0;

  for (const c of candidates) {
    const surnameTokens = tokens(c.surname);
    const firstTokens = tokens(c.first_name);
    const basis = basisFor(c);

    const found: { entry: Entry; via: string; reason: string; score: number }[] = [];

    // Name / alias match
    const pool = new Set<Entry>();
    for (const t of surnameTokens) for (const e of byToken.get(t) ?? []) pool.add(e);
    for (const e of pool) {
      const entryTokens = new Set(tokens(`${e.full_name} ${e.aliases ?? ""}`));
      const surnameHit = surnameTokens.every((t) => entryTokens.has(t));
      const firstHit = firstTokens.filter((t) => entryTokens.has(t)).length;
      if (!surnameHit || firstHit === 0) continue;
      found.push({
        entry: e,
        via: "Name and surname",
        reason: `Surname and ${firstHit} of ${firstTokens.length} first name(s) match a listed ${e.entry_type}${e.reference_number ? ` (${e.reference_number})` : ""}`,
        score: Number(((firstHit / Math.max(firstTokens.length, 1) + 1) / 2).toFixed(2)),
      });
    }

    // ID / passport document match
    for (const num of [c.id_number, c.passport_number]) {
      const key = alnum(num);
      if (key.length < 6) continue;
      for (const e of byDoc.get(key) ?? []) {
        found.push({
          entry: e,
          via: num === c.passport_number ? "Passport/permit number" : "ID number",
          reason: `Document number ${clean(num)} appears on a listed ${e.entry_type}${e.reference_number ? ` (${e.reference_number})` : ""}`,
          score: 1,
        });
      }
    }

    if (found.length) {
      hits += 1;
      await sb
        .from("manual_risk_candidates")
        .update({
          tfs_result: "possible_match",
          tfs_notes: `Possible match against the ${descriptor}. Compared on: ${basis}. Awaiting compliance review of ${found.length} possible match(es).`,
          tfs_screened_at: now,
          tfs_list_id: list.id,
          tfs_list_version: version,
          tfs_match_basis: basis,
        })
        .eq("id", c.id);

      for (const f of found) {
        matchRows.push({
          list_id: list.id,
          list_version: version,
          entry_id: f.entry.id,
          candidate_id: c.id,
          submission_id: submissionId,
          candidate_name: `${clean(c.first_name)} ${clean(c.surname)}`.trim(),
          candidate_id_number: clean(c.id_number) || clean(c.passport_number),
          matched_name: f.entry.full_name,
          match_reason: f.reason,
          matched_via: f.via,
          score: f.score,
          status: "pending",
        });
      }
    } else {
      await sb
        .from("manual_risk_candidates")
        .update({
          tfs_result: "not_listed",
          tfs_notes: `Not listed on the ${descriptor}. Compared on: ${basis}.`,
          tfs_screened_at: now,
          tfs_list_id: list.id,
          tfs_list_version: version,
          tfs_match_basis: basis,
        })
        .eq("id", c.id);
    }
  }

  for (let i = 0; i < matchRows.length; i += 200) {
    const { error } = await sb.from("manual_risk_sanctions_matches").insert(matchRows.slice(i, i + 200));
    if (error) throw error;
  }

  return { screened: candidates.length, hits, listUsed: list };
}
