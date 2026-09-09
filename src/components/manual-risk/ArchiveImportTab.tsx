import { useMemo, useRef, useState } from "react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertTriangle, FileText } from "lucide-react";

/**
 * Archive Import (master admin only).
 *
 * Loads historical, already-invoiced checks from a spreadsheet, creates any
 * missing client accounts, files the candidates into one archive order per
 * store + submission date, and attaches the original indemnity documents and
 * batch reports so client-facing profiles can search and view them.
 *
 * Archive records carry `is_archive = true` and are excluded everywhere from
 * the working submission queue, invoicing and profitability.
 */

const ARCHIVE_CONTACT = "Ntombi";
const ARCHIVE_EMAIL = "hradmin1@cashcrusaders.co.za";
const ARCHIVE_CC = "admin@tldv.co.za";
const ARCHIVE_CHECKS = ["id_verification", "risk_assessment"];

type Client = { id: string; client_name: string };

type CsvRow = {
  rowNumber: number;
  submissionDate: string;      // ISO yyyy-mm-dd
  firstName: string;
  secondName: string;
  surname: string;
  idNumber: string;
  gender: string;
  storeAccount: string;
};

type ArchiveOrder = {
  key: string;                 // store|date
  storeAccount: string;
  date: string;
  candidates: CsvRow[];
};

type ArchiveSubmission = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  archive_batch_label: string | null;
  archive_report_path: string | null;
  archive_report_name: string | null;
  indemnity_files: { name: string; path: string }[] | null;
};

// ---------- helpers ----------

const normName = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Cheap similarity for "is this the same store spelled differently?" hints. */
function similarity(a: string, b: string): number {
  const A = normName(a), B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const wa = new Set(A.split(" ")), wb = new Set(B.split(" "));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const overlap = shared / Math.max(wa.size, wb.size);
  const contains = A.includes(B) || B.includes(A) ? 0.85 : 0;
  return Math.max(overlap, contains);
}

function toIsoDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const raw = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy
  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    const dt = new Date(`${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00`);
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }
  const dt = new Date(raw);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

const pick = (row: Record<string, any>, names: string[]): string => {
  for (const key of Object.keys(row)) {
    const k = normName(key);
    if (names.some((n) => k === normName(n))) return String(row[key] ?? "").trim();
  }
  return "";
};

const pickRaw = (row: Record<string, any>, names: string[]): any => {
  for (const key of Object.keys(row)) {
    const k = normName(key);
    if (names.some((n) => k === normName(n))) return row[key];
  }
  return null;
};

/** Deterministic order number so a re-run never duplicates an archive order. */
function archiveOrderNumber(store: string, date: string): string {
  const slug = normName(store).split(" ").map((w) => w.slice(0, 3)).join("").slice(0, 18).toUpperCase();
  return `ARC-${date.replace(/-/g, "")}-${slug || "UNKNOWN"}`;
}

const prettyDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString();

// ---------- component ----------

export function ArchiveImportTab({
  clients, userId, onChanged,
}: {
  clients: Client[];
  userId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<CsvRow[]>([]);
  const [skipped, setSkipped] = useState<number>(0);
  const [parsing, setParsing] = useState(false);
  const [creatingClients, setCreatingClients] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [approvedNew, setApprovedNew] = useState<Record<string, boolean>>({});

  const addLog = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${line}`, ...l].slice(0, 400));

  const { data: archiveSubs = [], refetch: refetchArchive } = useQuery<ArchiveSubmission[]>({
    queryKey: ["mra-archive-submissions"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_submissions")
        .select("id, order_number, client_id, created_at, archive_batch_label, archive_report_path, archive_report_name, indemnity_files")
        .eq("is_archive", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  // ---- step 1: parse the sheet ----
  const parseFile = async (f: File) => {
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const out: CsvRow[] = [];
      let bad = 0;
      for (const sheetName of wb.SheetNames) {
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: "" });
        json.forEach((r, i) => {
          const store = pick(r, ["Store / Account", "Store/Account", "Store Account", "Store", "Account", "Client"]);
          const date = toIsoDate(pickRaw(r, ["Submission Date", "Date", "Submitted"]));
          const idNumber = pick(r, ["ID Number", "IDNumber", "ID"]);
          const surname = pick(r, ["Surname", "Last Name"]);
          const firstName = pick(r, ["First Name", "Firstname", "Name"]);
          const full = pick(r, ["Full Name", "Fullname"]);
          const resolvedFirst = firstName || full.split(" ").slice(0, -1).join(" ");
          const resolvedSurname = surname || full.split(" ").slice(-1).join(" ");
          if (!store || !date || (!idNumber && !resolvedSurname)) { bad += 1; return; }
          out.push({
            rowNumber: i + 2,
            submissionDate: date,
            firstName: resolvedFirst,
            secondName: pick(r, ["Second Name", "Middle Name"]),
            surname: resolvedSurname,
            idNumber,
            gender: pick(r, ["Gender"]),
            storeAccount: store,
          });
        });
      }
      setRows(out);
      setSkipped(bad);
      setApprovedNew({});
      toast.success(`${out.length} record(s) loaded${bad ? `, ${bad} row(s) skipped` : ""}`);
    } catch (e: any) {
      toast.error("Could not read the file: " + e.message);
    } finally {
      setParsing(false);
    }
  };

  // ---- store/account reconciliation ----
  const recon = useMemo(() => {
    const stores = Array.from(new Set(rows.map((r) => r.storeAccount)));
    const exact: { store: string; client: Client }[] = [];
    const similar: { store: string; matches: { client: Client; score: number }[] }[] = [];
    const create: string[] = [];
    for (const store of stores) {
      const hit = clients.find((c) => normName(c.client_name) === normName(store));
      if (hit) { exact.push({ store, client: hit }); continue; }
      const near = clients
        .map((c) => ({ client: c, score: similarity(store, c.client_name) }))
        .filter((x) => x.score >= 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (near.length) similar.push({ store, matches: near });
      else create.push(store);
    }
    return { stores, exact, similar, create };
  }, [rows, clients]);

  /** Stores that still need a client account created (new + unapproved similars). */
  const toCreate = useMemo(() => {
    const list = [...recon.create];
    for (const s of recon.similar) if (approvedNew[s.store]) list.push(s.store);
    return list;
  }, [recon, approvedNew]);

  const resolveClientId = (store: string): string | null => {
    const hit = clients.find((c) => normName(c.client_name) === normName(store));
    if (hit) return hit.id;
    const sim = recon.similar.find((s) => s.store === store);
    if (sim && !approvedNew[store]) return sim.matches[0].client.id;
    return null;
  };

  const createMissingClients = async () => {
    if (!toCreate.length) { toast.info("No new accounts to create"); return; }
    setCreatingClients(true);
    try {
      let created = 0;
      for (const store of toCreate) {
        const { error } = await sb.from("manual_risk_clients").insert({
          client_name: store,
          contact_person: ARCHIVE_CONTACT,
          email: ARCHIVE_EMAIL,
          cc_emails: ARCHIVE_CC,
          created_by: userId || null,
        });
        if (error) { addLog(`Failed to create "${store}": ${error.message}`); continue; }
        created += 1;
        addLog(`Created account "${store}"`);
      }
      toast.success(`${created} account(s) created`);
      onChanged();
    } finally {
      setCreatingClients(false);
    }
  };

  // ---- step 2: orders ----
  const orders = useMemo<ArchiveOrder[]>(() => {
    const m = new Map<string, ArchiveOrder>();
    for (const r of rows) {
      const key = `${normName(r.storeAccount)}|${r.submissionDate}`;
      if (!m.has(key)) m.set(key, { key, storeAccount: r.storeAccount, date: r.submissionDate, candidates: [] });
      m.get(key)!.candidates.push(r);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows]);

  const unresolvedStores = useMemo(
    () => orders.filter((o) => !resolveClientId(o.storeAccount)).map((o) => o.storeAccount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, clients, approvedNew],
  );

  const runImport = async () => {
    if (!orders.length) { toast.error("Load a spreadsheet first"); return; }
    if (unresolvedStores.length) {
      toast.error(`${new Set(unresolvedStores).size} account(s) still need to be created first`);
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: orders.length, label: "Importing archive orders" });
    try {
      let newOrders = 0, newCands = 0, skippedCands = 0;
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i];
        setProgress({ done: i, total: orders.length, label: `${o.storeAccount} — ${prettyDate(o.date)}` });
        const clientId = resolveClientId(o.storeAccount);
        const orderNumber = archiveOrderNumber(o.storeAccount, o.date);
        const label = `${o.storeAccount} ${prettyDate(o.date)}`;
        const createdAt = new Date(`${o.date}T09:00:00`).toISOString();

        // Idempotent: reuse the order if this store/date was already imported.
        const { data: existing } = await sb
          .from("manual_risk_submissions")
          .select("id")
          .eq("order_number", orderNumber)
          .maybeSingle();

        let submissionId = existing?.id as string | undefined;
        if (!submissionId) {
          const { data: ins, error: insErr } = await sb
            .from("manual_risk_submissions")
            .insert({
              order_number: orderNumber,
              client_id: clientId,
              submission_type: o.candidates.length > 1 ? "batch" : "single",
              status: "completed",
              requested_checks: ARCHIVE_CHECKS,
              notes: "Historical archive import (already invoiced)",
              created_by: userId || null,
              created_at: createdAt,
              sent_at: createdAt,
              invoiced_at: createdAt,
              is_archive: true,
              archive_batch_label: label,
            } as any)
            .select("id")
            .single();
          if (insErr) { addLog(`Order "${label}" failed: ${insErr.message}`); continue; }
          submissionId = ins!.id;
          newOrders += 1;
        }

        // Candidates: skip IDs already recorded on this order.
        const { data: existingCands } = await sb
          .from("manual_risk_candidates")
          .select("id_number, first_name, surname")
          .eq("submission_id", submissionId);
        const seen = new Set(
          (existingCands ?? []).map((c: any) => `${(c.id_number ?? "").trim()}|${normName(c.surname)}|${normName(c.first_name)}`),
        );

        const payload = o.candidates
          .filter((c) => {
            const key = `${c.idNumber.trim()}|${normName(c.surname)}|${normName(c.firstName)}`;
            if (seen.has(key)) { skippedCands += 1; return false; }
            seen.add(key);
            return true;
          })
          .map((c, idx) => ({
            submission_id: submissionId!,
            id_number: c.idNumber || "—",
            surname: c.surname || "—",
            first_name: [c.firstName, c.secondName].filter(Boolean).join(" ") || "—",
            sort_order: idx,
          }));

        if (payload.length) {
          const { error: cErr } = await sb.from("manual_risk_candidates").insert(payload as any);
          if (cErr) { addLog(`Candidates for "${label}" failed: ${cErr.message}`); continue; }
          newCands += payload.length;
        }
        addLog(`${label}: ${payload.length} candidate(s) imported`);
      }
      setProgress(null);
      toast.success(`${newOrders} archive order(s), ${newCands} candidate(s) imported${skippedCands ? `, ${skippedCands} already on record` : ""}`);
      refetchArchive();
      onChanged();
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold">Archive import</h3>
            <p className="text-sm text-muted-foreground">
              Load historical checks that were already invoiced. They stay searchable in Accounts and
              visible to client-facing profiles, but never appear in Submissions, Invoiced, supplier
              reconciliation or profitability.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.currentTarget.value = ""; }}
              />
              <Button size="sm" variant="outline" disabled={parsing} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> {parsing ? "Reading…" : "Choose spreadsheet"}
              </Button>
              {rows.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {rows.length} record(s) · {recon.stores.length} store/account name(s) · {orders.length} archive order(s)
                  {skipped ? ` · ${skipped} row(s) skipped` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Step 1 — accounts
            </h3>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Already on record</p>
                <p className="text-2xl font-bold">{recon.exact.length}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Similar name — please confirm</p>
                <p className="text-2xl font-bold text-amber-600">{recon.similar.length}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">To be created</p>
                <p className="text-2xl font-bold text-red-600">{toCreate.length}</p>
              </div>
            </div>

            {recon.similar.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  These names look like accounts you already have. Leave unticked to use the existing
                  account, or tick to create a separate new account.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name in spreadsheet</TableHead>
                        <TableHead>Closest existing account(s)</TableHead>
                        <TableHead className="w-32">Create new</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recon.similar.map((s) => (
                        <TableRow key={s.store}>
                          <TableCell className="font-medium">{s.store}</TableCell>
                          <TableCell className="text-sm">
                            {s.matches.map((m) => (
                              <div key={m.client.id}>
                                {m.client.client_name}{" "}
                                <Badge variant="outline" className="text-[10px]">{Math.round(m.score * 100)}% alike</Badge>
                              </div>
                            ))}
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={!!approvedNew[s.store]}
                              onCheckedChange={(v) => setApprovedNew((p) => ({ ...p, [s.store]: !!v }))}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {toCreate.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  New accounts will be created with contact <strong>{ARCHIVE_CONTACT}</strong>,
                  email <strong>{ARCHIVE_EMAIL}</strong> and <strong>{ARCHIVE_CC}</strong> always copied in.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {toCreate.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
                </div>
                <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={creatingClients} onClick={createMissingClients}>
                  {creatingClients ? "Creating…" : `Create ${toCreate.length} account(s)`}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-red-600" /> Step 2 — import candidates
            </h3>
            <p className="text-sm text-muted-foreground">
              One archive order is created per store and submission date. Running this again never
              duplicates anything: existing orders and candidates are skipped.
            </p>
            {unresolvedStores.length > 0 && (
              <p className="text-sm text-red-600">
                Create the outstanding accounts first — {new Set(unresolvedStores).size} still missing.
              </p>
            )}
            {progress && (
              <p className="text-sm text-muted-foreground">
                {progress.label} — {progress.done}/{progress.total}
              </p>
            )}
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={importing || unresolvedStores.length > 0}
              onClick={runImport}
            >
              {importing ? "Importing…" : `Import ${orders.length} archive order(s) / ${rows.length} record(s)`}
            </Button>
          </Card>
        </>
      )}

      <BulkFolderUploadCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
        addLog={addLog}
      />

      <ArchiveDocumentsCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
        addLog={addLog}
      />


      {log.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2 text-sm">Activity log</h3>
          <div className="max-h-56 overflow-auto text-xs font-mono space-y-0.5">
            {log.map((l, i) => <div key={i} className="text-muted-foreground">{l}</div>)}
          </div>
        </Card>
      )}
    </div>
  );
}

/** Step 3 — attach the original batch report and indemnity documents. */
function ArchiveDocumentsCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: ArchiveSubmission[];
  clients: Client[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? submissions.filter((s) =>
          `${s.order_number} ${s.archive_batch_label ?? ""} ${clientName(s.client_id)}`.toLowerCase().includes(q))
      : submissions;
    return list.slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, search, clients]);

  const uploadReport = async (sub: ArchiveSubmission, file: File) => {
    setBusy(sub.id);
    try {
      const path = `${sub.id}/${file.name}`;
      const { error: upErr } = await sb.storage
        .from("archive-reports")
        .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (upErr) throw upErr;
      const { error } = await sb.from("manual_risk_submissions")
        .update({ archive_report_path: path, archive_report_name: file.name } as any)
        .eq("id", sub.id);
      if (error) throw error;
      addLog(`Report attached to ${sub.order_number}: ${file.name}`);
      toast.success("Report attached");
      onChanged();
    } catch (e: any) {
      toast.error("Report upload failed: " + e.message);
    } finally {
      setBusy(null);
    }
  };

  const uploadIndemnities = async (sub: ArchiveSubmission, files: FileList) => {
    setBusy(sub.id);
    try {
      const existing = Array.isArray(sub.indemnity_files) ? sub.indemnity_files : [];
      const added: any[] = [];
      for (const file of Array.from(files)) {
        if (existing.some((f) => f.name === file.name)) continue;
        const path = `${sub.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: upErr } = await sb.storage
          .from("manual-risk-indemnities")
          .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
        if (upErr) { addLog(`Indemnity "${file.name}" failed: ${upErr.message}`); continue; }
        added.push({
          name: file.name, path, uploaded_at: new Date().toISOString(),
          size: file.size, content_type: file.type || null,
        });
      }
      if (added.length) {
        const { error } = await sb.from("manual_risk_submissions")
          .update({ indemnity_files: [...existing, ...added] } as any)
          .eq("id", sub.id);
        if (error) throw error;
      }
      addLog(`${added.length} indemnity file(s) attached to ${sub.order_number}`);
      toast.success(`${added.length} indemnity file(s) attached`);
      onChanged();
    } catch (e: any) {
      toast.error("Indemnity upload failed: " + e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-red-600" /> Step 3 — attach reports and indemnities
      </h3>
      <p className="text-sm text-muted-foreground">
        Pick an archive order, then attach its original report (one per batch) and its indemnity
        documents. Filenames do not matter — files are linked to the order you choose. Re-uploading a
        file with the same name replaces it instead of duplicating it.
      </p>
      <div className="max-w-sm">
        <Label className="text-xs">Find an archive order</Label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Store, date or order number" className="h-8" />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Report</TableHead>
              <TableHead>Indemnities</TableHead>
              <TableHead className="w-64">Attach</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No archive orders yet — import the spreadsheet first.
                </TableCell>
              </TableRow>
            ) : visible.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                <TableCell>{clientName(s.client_id)}</TableCell>
                <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {s.archive_report_path
                    ? <Badge className="bg-emerald-600 text-[10px]">Attached</Badge>
                    : <Badge variant="outline" className="text-[10px]">Missing</Badge>}
                </TableCell>
                <TableCell>{(s.indemnity_files ?? []).length}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs cursor-pointer text-red-600 hover:underline">
                      {busy === s.id ? "Uploading…" : "Attach report"}
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        disabled={busy === s.id}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReport(s, f); e.currentTarget.value = ""; }}
                      />
                    </label>
                    <label className="text-xs cursor-pointer text-red-600 hover:underline">
                      Attach indemnities
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={busy === s.id}
                        onChange={(e) => { const fl = e.target.files; if (fl?.length) uploadIndemnities(s, fl); e.currentTarget.value = ""; }}
                      />
                    </label>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default ArchiveImportTab;
