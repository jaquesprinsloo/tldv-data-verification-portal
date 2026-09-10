import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Upload, Loader2, ShieldAlert, CalendarClock, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

/* ---------------- helpers ---------------- */

const clean = (v: unknown) => String(v ?? "").trim();
const tokens = (v: unknown) =>
  clean(v).toLowerCase().replace(/[^a-z\s]+/g, " ").split(/\s+/).filter((t) => t.length > 1);
const normName = (v: unknown) => tokens(v).sort().join(" ");
const monthKey = (d: Date | string) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

type SanctionsList = {
  id: string; list_name: string; source: string; version_label: string | null;
  file_name: string | null; individual_count: number; entity_count: number;
  is_current: boolean; uploaded_by_name: string | null; created_at: string;
};

type SanctionsMatch = {
  id: string; list_id: string; candidate_id: string | null;
  candidate_name: string | null; candidate_id_number: string | null;
  matched_name: string | null; match_reason: string | null; score: number | null;
  status: string; reviewed_by_name: string | null; reviewed_at: string | null;
  created_at: string;
};

type FlaggedOrder = {
  id: string; order_number: string; status: string; created_at: string;
  sent_at: string | null; compliance_flag: string | null; compliance_flag_at: string | null;
};

const FLAG_LABEL: Record<string, string> = {
  status_inconsistent: "Report released but the order still reads as open",
};

/** Reads every row of a table in pages of 1000 so nothing is silently cut off. */
async function fetchAll<T>(table: string, columns: string, apply?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = sb.from(table).select(columns).range(from, from + size - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

/* ---------------- component ---------------- */

export default function ComplianceTab({ userId, userName, onViewSubmission }: { userId: string; userName: string; onViewSubmission?: (submissionId: string) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState("");

  const { data: lists = [] } = useQuery<SanctionsList[]>({
    queryKey: ["mr-sanctions-lists"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_sanctions_lists").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as SanctionsList[];
    },
  });

  const { data: matches = [] } = useQuery<SanctionsMatch[]>({
    queryKey: ["mr-sanctions-matches"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_sanctions_matches").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as SanctionsMatch[];
    },
  });

  const { data: flagged = [] } = useQuery<FlaggedOrder[]>({
    queryKey: ["mr-compliance-flags"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_submissions")
        .select("id, order_number, status, created_at, sent_at, compliance_flag, compliance_flag_at")
        .not("compliance_flag", "is", null)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data as FlaggedOrder[];
    },
  });

  const { data: statementMonths = [] } = useQuery<string[]>({
    queryKey: ["mr-statement-months"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_supplier_batches").select("created_at").order("created_at", { ascending: false }).limit(24);
      if (error) throw error;
      return (data ?? []).map((r: any) => monthKey(r.created_at));
    },
  });

  const thisMonth = monthKey(new Date());
  const sanctionsThisMonth = lists.some((l) => monthKey(l.created_at) === thisMonth);
  const statementThisMonth = statementMonths.includes(thisMonth);
  const pending = matches.filter((m) => m.status === "pending");

  const currentList = useMemo(() => lists.find((l) => l.is_current) ?? lists[0], [lists]);

  /* --------- sanctions list upload + screening --------- */

  const handleUpload = async () => {
    if (!file) { toast.error("Choose the sanctions list spreadsheet first"); return; }
    setWorking(true);
    setProgress("Reading the spreadsheet…");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      type Row = {
        entry_type: string; reference_number: string | null; full_name: string;
        normalized_name: string; aliases: string | null; date_of_birth: string | null;
        nationality: string | null; listed_on: string | null; documents: string | null;
        raw: Record<string, unknown>;
      };
      const rows: Row[] = [];

      for (const sheetName of wb.SheetNames) {
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
        const isEntity = /entit|organis|organiz/i.test(sheetName);
        for (const r of json) {
          const name = clean(r["FullName"] ?? r["Full Name"] ?? r["FirstName"] ?? r["Name"]);
          if (!name) continue;
          rows.push({
            entry_type: isEntity ? "entity" : "individual",
            reference_number: clean(r["ReferenceNumber"]) || null,
            full_name: name,
            normalized_name: normName(name),
            aliases: clean(r["IndividualAlias"] ?? r["EntityAlias"]) || null,
            date_of_birth: clean(r["IndividualDateOfBirth"]) || null,
            nationality: clean(r["Nationality"]) || null,
            listed_on: clean(r["ListedOn"]) || null,
            documents: clean(r["IndividualDocument"]) || null,
            raw: r,
          });
        }
      }
      if (!rows.length) throw new Error("No named records were found in this spreadsheet.");

      // Previous list, used to work out what actually changed
      setProgress("Comparing against the previous list…");
      const prev = currentList;
      let prevKeys = new Set<string>();
      if (prev) {
        const prevEntries = await fetchAll<{ reference_number: string | null; normalized_name: string }>(
          "manual_risk_sanctions_entries",
          "reference_number, normalized_name",
          (q) => q.eq("list_id", prev.id),
        );
        prevKeys = new Set(prevEntries.map((e) => `${e.reference_number ?? ""}|${e.normalized_name}`));
      }

      // Snapshot record
      const { data: listRow, error: lErr } = await sb
        .from("manual_risk_sanctions_lists")
        .insert({
          list_name: file.name.replace(/\.xlsx?$/i, ""),
          version_label: versionLabel.trim() || new Date().toISOString().slice(0, 10),
          file_name: file.name,
          individual_count: rows.filter((r) => r.entry_type === "individual").length,
          entity_count: rows.filter((r) => r.entry_type === "entity").length,
          is_current: true,
          uploaded_by: userId || null,
          uploaded_by_name: userName || null,
        })
        .select("id").single();
      if (lErr) throw lErr;
      const listId = (listRow as any).id as string;
      await sb.from("manual_risk_sanctions_lists").update({ is_current: false }).neq("id", listId);

      setProgress(`Saving ${rows.length} list records…`);
      for (let i = 0; i < rows.length; i += 300) {
        const chunk = rows.slice(i, i + 300).map((r) => ({ ...r, list_id: listId }));
        const { error } = await sb.from("manual_risk_sanctions_entries").insert(chunk);
        if (error) throw error;
      }

      // Which entries are new/changed since the last list
      const changed = prev
        ? rows.filter((r) => !prevKeys.has(`${r.reference_number ?? ""}|${r.normalized_name}`))
        : rows;

      setProgress("Screening our candidates against the list…");
      const cands = await fetchAll<{ id: string; first_name: string; surname: string; id_number: string }>(
        "manual_risk_candidates",
        "id, first_name, surname, id_number",
      );

      // Index the entries we need to screen by every name token
      const screenSet = changed;
      const byToken = new Map<string, typeof screenSet>();
      for (const e of screenSet) {
        const allNames = `${e.full_name} ${e.aliases ?? ""}`;
        for (const t of new Set(tokens(allNames))) {
          if (!byToken.has(t)) byToken.set(t, []);
          byToken.get(t)!.push(e);
        }
      }

      type MatchRow = {
        list_id: string; candidate_id: string; candidate_name: string; candidate_id_number: string;
        matched_name: string; match_reason: string; score: number; status: string;
      };
      const found: MatchRow[] = [];
      for (const c of cands) {
        const surnameTokens = tokens(c.surname);
        const firstTokens = tokens(c.first_name);
        if (!surnameTokens.length || !firstTokens.length) continue;
        const candidateEntries = new Set<(typeof screenSet)[number]>();
        for (const t of surnameTokens) for (const e of byToken.get(t) ?? []) candidateEntries.add(e);
        for (const e of candidateEntries) {
          const entryTokens = new Set(tokens(`${e.full_name} ${e.aliases ?? ""}`));
          const surnameHit = surnameTokens.every((t) => entryTokens.has(t));
          const firstHit = firstTokens.filter((t) => entryTokens.has(t)).length;
          if (!surnameHit || firstHit === 0) continue;
          const score = Number(((firstHit / firstTokens.length + 1) / 2).toFixed(2));
          found.push({
            list_id: listId,
            candidate_id: c.id,
            candidate_name: `${c.first_name} ${c.surname}`.trim(),
            candidate_id_number: c.id_number ?? "",
            matched_name: e.full_name,
            match_reason: `Surname and ${firstHit} of ${firstTokens.length} first name(s) match a listed ${e.entry_type}${e.reference_number ? ` (${e.reference_number})` : ""}`,
            score,
            status: "pending",
          });
        }
      }

      for (let i = 0; i < found.length; i += 300) {
        const { error } = await sb.from("manual_risk_sanctions_matches").insert(found.slice(i, i + 300));
        if (error) throw error;
      }

      toast.success(
        `List saved (${rows.length} records). ${prev ? `${changed.length} new or changed entr${changed.length === 1 ? "y" : "ies"}. ` : ""}${found.length} possible candidate match(es) flagged for your review.`,
        { duration: 12000 },
      );
      setFile(null);
      setVersionLabel("");
      qc.invalidateQueries({ queryKey: ["mr-sanctions-lists"] });
      qc.invalidateQueries({ queryKey: ["mr-sanctions-matches"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
      setProgress("");
    }
  };

  const reviewMatch = async (id: string, status: "confirmed" | "dismissed") => {
    const { error } = await sb.from("manual_risk_sanctions_matches").update({
      status,
      reviewed_by: userId || null,
      reviewed_by_name: userName || null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["mr-sanctions-matches"] });
  };

  const [openingCand, setOpeningCand] = useState<string | null>(null);

  const openCandidate = async (m: SanctionsMatch) => {
    if (!m.candidate_id) { toast.error("This match is not linked to a candidate record"); return; }
    setOpeningCand(m.id);
    try {
      const { data, error } = await sb
        .from("manual_risk_candidates").select("submission_id").eq("id", m.candidate_id).single();
      if (error) throw error;
      if (!data?.submission_id) throw new Error("No order is linked to this candidate");
      onViewSubmission?.(data.submission_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpeningCand(null);
    }
  };

  const clearFlag = async (id: string) => {
    const { error } = await sb.from("manual_risk_submissions").update({
      compliance_flag: null,
      compliance_reviewed_by: userId || null,
      compliance_reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as reviewed");
    qc.invalidateQueries({ queryKey: ["mr-compliance-flags"] });
  };

  return (
    <div className="space-y-4">
      {/* Monthly reminders */}
      {(!sanctionsThisMonth || !statementThisMonth) && (
        <Card className="p-4 border-amber-400 bg-amber-50">
          <div className="flex items-start gap-3">
            <CalendarClock className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900">Monthly to-do for {thisMonth}</div>
              <ul className="mt-1 space-y-1 text-amber-900">
                {!statementThisMonth && (
                  <li>• Upload this month's provider check summary (Supplier Recon tab) — it fills in the date each order was sent for screening.</li>
                )}
                {!sanctionsThisMonth && (
                  <li>• Upload the latest sanctions list below so screening is done against a current list.</li>
                )}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Sanctions list upload */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold">Sanctions list</h3>
          {currentList && (
            <Badge variant="outline" className="ml-2">
              In use: {currentList.version_label ?? currentList.list_name} · {currentList.individual_count + currentList.entity_count} records
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Each upload is kept as a dated snapshot, so you can always show which list a candidate was screened against.
          When a newer list is loaded, only the new or changed names are run against every candidate on record.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Spreadsheet</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="max-w-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Version / date of list (optional)</Label>
            <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. 2026-09-10" className="max-w-[200px]" />
          </div>
          <Button onClick={handleUpload} disabled={working || !file} className="bg-red-600 hover:bg-red-700">
            {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {working ? "Working…" : "Upload and screen"}
          </Button>
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
        </div>

        {lists.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>List</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Organisations</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lists.map((l) => (
                  <TableRow key={l.id} className={l.is_current ? "bg-muted/40" : ""}>
                    <TableCell className="text-xs">
                      <FileSpreadsheet className="h-3 w-3 inline mr-1" />{l.file_name ?? l.list_name}
                      {l.is_current && <Badge className="ml-2 bg-green-600">Current</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{l.version_label ?? "—"}</TableCell>
                    <TableCell className="text-xs text-right">{l.individual_count}</TableCell>
                    <TableCell className="text-xs text-right">{l.entity_count}</TableCell>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("en-ZA")}</TableCell>
                    <TableCell className="text-xs">{l.uploaded_by_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Possible sanctions matches */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold">Possible sanctions matches</h3>
          <Badge variant={pending.length ? "destructive" : "outline"}>{pending.length} awaiting review</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Nothing is sent to a client from here. Confirm or dismiss each possible match yourself.
        </p>
        {matches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No possible matches recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>Listed name</TableHead>
                  <TableHead>Why it matched</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs font-medium">{m.candidate_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{m.candidate_id_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{m.matched_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.match_reason ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {m.status === "pending" ? (
                        <Badge variant="destructive">Awaiting review</Badge>
                      ) : m.status === "confirmed" ? (
                        <Badge className="bg-red-700">Confirmed{m.reviewed_by_name ? ` · ${m.reviewed_by_name}` : ""}</Badge>
                      ) : (
                        <Badge variant="outline">Dismissed{m.reviewed_by_name ? ` · ${m.reviewed_by_name}` : ""}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {m.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" className="mr-2" onClick={() => reviewMatch(m.id, "confirmed")}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reviewMatch(m.id, "dismissed")}>
                            <XCircle className="h-3 w-3 mr-1" /> Dismiss
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Records flagged for review */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <h3 className="font-semibold">Orders flagged for your attention</h3>
          <Badge variant={flagged.length ? "destructive" : "outline"}>{flagged.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          These orders were released to the client but their progress wording never moved on. Nothing has been changed
          automatically — open each one, check it, then mark it as reviewed.
        </p>
        {flagged.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing flagged.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagged.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-xs font-medium">{f.order_number}</TableCell>
                    <TableCell className="text-xs">{FLAG_LABEL[f.compliance_flag ?? ""] ?? f.compliance_flag}</TableCell>
                    <TableCell className="text-xs">{f.sent_at ? new Date(f.sent_at).toLocaleString("en-ZA") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => clearFlag(f.id)}>Mark reviewed</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
