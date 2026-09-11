// Audit of every report already on record against the archive people.
//
// Older reports were attached before the name reconciliation existed, so nobody
// was stamped as "confirmed by a report". This card re-reads the stored reports
// and fills that in: everyone a report names is either stamped as confirmed, or
// written down as a name that appears on a report but is nowhere in the archive.

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase as sb } from "@/integrations/supabase/client";
import { extractArchiveReportRecords, normPersonName } from "@/lib/archiveReportOutcomes";
import { markCandidatesReportMatched, recordUnmatchedReportNames } from "@/lib/archiveNameReconciliation";

type AuditSubmission = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  archive_report_path: string | null;
  archive_report_name: string | null;
};

type Cand = {
  id: string;
  id_number: string | null;
  first_name: string | null;
  surname: string | null;
  submission_id: string;
  report_matched_at: string | null;
};

async function fetchAllArchiveCandidates(): Promise<Cand[]> {
  const out: Cand[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await sb
      .from("manual_risk_candidates")
      .select("id, id_number, first_name, surname, submission_id, report_matched_at, manual_risk_submissions!inner(is_archive)")
      .eq("manual_risk_submissions.is_archive", true)
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Cand[];
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

export function ArchiveReportAuditCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: AuditSubmission[];
  clients: { id: string; client_name: string }[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<{ read: number; failed: number; confirmed: number; missing: number } | null>(null);
  const [unmatchedTotal, setUnmatchedTotal] = useState<number>(0);
  const stop = useRef(false);

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");

  const load = async () => {
    try {
      const [rows, un] = await Promise.all([
        fetchAllArchiveCandidates(),
        sb.from("manual_risk_report_unmatched_names").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      setCands(rows);
      setUnmatchedTotal(un.count ?? 0);
    } catch (e: any) {
      addLog(`Audit could not load the archive people: ${e.message}`);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const withReports = useMemo(
    () => submissions.filter((s) => !!s.archive_report_path),
    [submissions],
  );

  /**
   * An order only counts as audited once its OWN report file has been read.
   * A stamp left by another order's report (the same person can appear on
   * several orders) must not make this order look done, or its report would
   * never be opened.
   */
  const auditedOrderIds = useMemo(() => {
    const byOrderFile = new Map<string, string>();
    withReports.forEach((s) => {
      if (s.archive_report_name) byOrderFile.set(s.id, s.archive_report_name.trim().toLowerCase());
    });
    const set = new Set<string>();
    (cands ?? []).forEach((c) => {
      if (!c.report_matched_at || !c.report_matched_file) return;
      const own = byOrderFile.get(c.submission_id);
      if (own && own === c.report_matched_file.trim().toLowerCase()) set.add(c.submission_id);
    });
    return set;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [cands, withReports]);

  const pending = useMemo(
    () => withReports.filter((s) => !auditedOrderIds.has(s.id)),
    [withReports, auditedOrderIds],
  );

  const confirmedPeople = (cands ?? []).filter((c) => c.report_matched_at).length;
  const waitingPeople = (cands ?? []).length - confirmedPeople;

  const auditOne = async (sub: AuditSubmission, all: Cand[]) => {
    const { data: signed, error: sErr } = await sb.storage
      .from("archive-reports")
      .createSignedUrl(sub.archive_report_path!, 300);
    if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || "report could not be opened");
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`report download failed (${res.status})`);
    const blob = await res.blob();
    const name = sub.archive_report_name || "report.pdf";
    const file = new File([blob], name, { type: blob.type || "application/pdf" });

    let records: Awaited<ReturnType<typeof extractArchiveReportRecords>> = [];
    let err = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        records = await extractArchiveReportRecords(file);
        err = "";
        if (records.length) break;
      } catch (e: any) {
        err = e?.message ?? "unknown error";
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    if (err) throw new Error(err);
    if (!records.length) throw new Error("no names could be read");

    const matchedIds: string[] = [];
    const notFound: typeof records = [];

    for (const r of records) {
      const rs = normPersonName(r.surname);
      const rf = normPersonName(r.first_names);
      const prefix = String(r.id_prefix ?? "").replace(/\D/g, "").slice(0, 6);
      let hit = false;
      for (const c of all) {
        const cs = normPersonName(c.surname);
        const cf = normPersonName(c.first_name);
        const cp = String(c.id_number ?? "").replace(/\D/g, "").slice(0, 6);
        const surnameHit = !!rs && !!cs && rs === cs;
        const firstHit = !!rf && !!cf && (rf === cf || rf.startsWith(cf) || cf.startsWith(rf));
        const prefixHit = prefix.length === 6 && prefix === cp;
        if ([surnameHit, firstHit, prefixHit].filter(Boolean).length < 2) continue;
        hit = true;
        matchedIds.push(c.id);
      }
      if (!hit) notFound.push(r);
    }

    await markCandidatesReportMatched(matchedIds, name);
    await recordUnmatchedReportNames(
      notFound.map((r) => ({
        fullName: `${r.first_names ?? ""} ${r.surname ?? ""}`.trim() || "(name unreadable)",
        firstNames: r.first_names ?? null,
        surname: r.surname ?? null,
        idPrefix: String(r.id_prefix ?? "").replace(/\D/g, "").slice(0, 6) || null,
        reportFileName: name,
        reportDate: sub.created_at.slice(0, 10),
        storeLabel: clientName(sub.client_id),
        linkedSubmissionId: sub.id,
        raw: r,
      })),
    );

    // Keep the in-memory list in step so the counters move as the audit runs.
    const stampSet = new Set(matchedIds);
    all.forEach((c) => { if (stampSet.has(c.id)) c.report_matched_at = new Date().toISOString(); });

    return { confirmed: matchedIds.length, missing: notFound.length, records: records.length };
  };

  const run = async (onlyPending: boolean) => {
    const list = onlyPending ? pending : withReports;
    if (!list.length) { toast.info("Nothing to audit"); return; }
    stop.current = false;
    setRunning(true);
    setResult(null);
    const all = cands ? [...cands] : await fetchAllArchiveCandidates();
    let read = 0, failed = 0, confirmed = 0, missing = 0;

    for (let i = 0; i < list.length; i++) {
      if (stop.current) { addLog("Audit stopped."); break; }
      const sub = list[i];
      setProgress({ done: i, total: list.length, label: `${clientName(sub.client_id)} — ${sub.order_number}` });
      try {
        const r = await auditOne(sub, all);
        read += 1; confirmed += r.confirmed; missing += r.missing;
        addLog(`Audit ${sub.order_number}: ${r.records} name(s) read • ${r.confirmed} confirmed • ${r.missing} not in the archive`);
      } catch (e: any) {
        failed += 1;
        addLog(`Audit ${sub.order_number} failed: ${e.message}`);
      }
      setCands([...all]);
    }

    setProgress(null);
    setRunning(false);
    setResult({ read, failed, confirmed, missing });
    await load();
    onChanged();
    toast.success(`Audit finished — ${read} report(s) read, ${missing} name(s) not in the archive`);
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-red-600" /> Audit the reports already on record
      </h3>
      <p className="text-sm text-muted-foreground">
        Re-reads every report already saved against an archive order, ticks off the people it names,
        and writes down any name on a report that is nowhere in the archive. Nothing is uploaded or
        changed on the orders themselves.
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{withReports.length} order(s) with a report</Badge>
        <Badge variant="outline">{withReports.length - pending.length} already audited</Badge>
        <Badge variant="outline" className="text-amber-600 border-amber-300">{pending.length} still to audit</Badge>
        <Badge variant="outline" className="text-green-700 border-green-300">{confirmedPeople} people confirmed by a report</Badge>
        <Badge variant="outline" className="text-amber-700 border-amber-300">{waitingPeople} people still waiting for a report</Badge>
        <Badge variant="outline" className="text-red-600 border-red-300">{unmatchedTotal} name(s) on a report but not in the archive</Badge>
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress.done + 1}/{progress.total} — {progress.label}
        </p>
      )}

      {result && !running && (
        <p className="text-sm">
          {result.read} report(s) read, {result.failed} could not be read, {result.confirmed} people confirmed,{" "}
          {result.missing} name(s) not found in the archive.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="bg-red-600 hover:bg-red-700" disabled={running || !pending.length} onClick={() => void run(true)}>
          {running ? "Auditing…" : `Audit ${pending.length} outstanding report(s)`}
        </Button>
        <Button variant="outline" disabled={running || !withReports.length} onClick={() => void run(false)}>
          Re-audit all {withReports.length}
        </Button>
        {running && <Button variant="outline" onClick={() => { stop.current = true; }}>Stop</Button>}
      </div>
    </Card>
  );
}

export default ArchiveReportAuditCard;
