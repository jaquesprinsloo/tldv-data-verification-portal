import { useEffect, useMemo, useRef, useState } from "react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { applyArchiveReportOutcomes, extractArchiveReportRecords, normPersonName } from "@/lib/archiveReportOutcomes";

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

const MAP_KEY = "mra-archive-store-map";
function loadSavedMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") || {}; } catch { return {}; }
}
function saveMap(m: Record<string, string>) {
  try { localStorage.setItem(MAP_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/** Noise words stripped before comparing so "Mall"/"The"/"CC" never drive a match. */
const MATCH_NOISE = new Set(["the", "mall", "cc", "ccs", "pty", "ltd", "branch", "store", "shop", "centre", "center", "plaza", "shopping"]);

function matchKey(s: string): string {
  return normName(s)
    .split(" ")
    .filter((w) => w && !MATCH_NOISE.has(w))
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Letter-by-letter similarity so spelling mistakes suggest the closest name,
 *  rather than any account that happens to share a word like "Mall". */
function similarity(a: string, b: string): number {
  const A = matchKey(a), B = matchKey(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const contains = A.includes(B) || B.includes(A) ? 0.9 : 0;
  const lev = 1 - levenshtein(A, B) / Math.max(A.length, B.length);
  // Word overlap only counts when the words actually start the same (guards
  // against "Kolonade Mall" matching "Fleurhof Mall" style false positives).
  const wa = A.split(" "), wb = new Set(B.split(" "));
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const overlap = shared / Math.max(wa.length, wb.size);
  const sameStart = A[0] === B[0] ? 0.05 : -0.1;
  return Math.max(contains, lev + sameStart, overlap >= 1 ? overlap : 0);
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
  /** Per spreadsheet store name: existing client id it maps to, or "__new__" to create one. */
  const [mappedTo, setMappedTo] = useState<Record<string, string>>(() => loadSavedMap());

  /** Remember every confirmed link so a re-upload of the same sheet never asks again. */
  const setMapping = (store: string, clientId: string) => {
    setMappedTo((p) => {
      const next = { ...p, [store]: clientId };
      saveMap(next);
      return next;
    });
  };

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
      setMappedTo(loadSavedMap());
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
    const remembered: { store: string; client: Client }[] = [];
    const similar: { store: string; matches: { client: Client; score: number }[] }[] = [];
    const create: string[] = [];
    for (const store of stores) {
      const hit = clients.find((c) => normName(c.client_name) === normName(store));
      if (hit) { exact.push({ store, client: hit }); continue; }
      const saved = mappedTo[store];
      const savedClient = saved && saved !== "__new__" ? clients.find((c) => c.id === saved) : undefined;
      if (savedClient) { remembered.push({ store, client: savedClient }); continue; }
      const near = clients
        .map((c) => ({ client: c, score: similarity(store, c.client_name) }))
        .filter((x) => x.score >= 0.7)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      if (near.length) similar.push({ store, matches: near });
      else create.push(store);
    }
    return { stores, exact, remembered, similar, create };
  }, [rows, clients, mappedTo]);

  /** Stores that still need a client account created (new + similars mapped to "create new"). */
  const toCreate = useMemo(() => {
    const list = [...recon.create];
    for (const s of recon.similar) if (mappedTo[s.store] === "__new__") list.push(s.store);
    return list;
  }, [recon, mappedTo]);

  const resolveClientId = (store: string): string | null => {
    const hit = clients.find((c) => normName(c.client_name) === normName(store));
    if (hit) return hit.id;
    const chosen = mappedTo[store];
    if (chosen === "__new__") return null;
    if (chosen && clients.some((c) => c.id === chosen)) return chosen;
    const sim = recon.similar.find((s) => s.store === store);
    if (!sim) return null;
    return sim.matches[0].client.id; // default: closest match
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
    [orders, clients, mappedTo],
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
                {recon.remembered.length > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">
                    {recon.remembered.length} linked earlier — remembered{" "}
                    <button
                      type="button"
                      className="underline text-muted-foreground"
                      onClick={() => { setMappedTo({}); saveMap({}); }}
                    >
                      reset
                    </button>
                  </p>
                )}
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
                  These names look like accounts you already have. Choose which existing account the
                  checks belong to, or choose "Create new account" if it really is a different client.
                  Your choice is remembered, so a re-upload will not ask again.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = { ...mappedTo };
                    for (const s of recon.similar) next[s.store] = mappedTo[s.store] ?? s.matches[0].client.id;
                    setMappedTo(next);
                    saveMap(next);
                    toast.success("Suggested links confirmed and remembered");
                  }}
                >
                  Accept all suggested links
                </Button>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name in spreadsheet</TableHead>
                        <TableHead>Checks fall under</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recon.similar.map((s) => (
                        <TableRow key={s.store}>
                          <TableCell className="font-medium">{s.store}</TableCell>
                          <TableCell>
                            <Select
                              value={mappedTo[s.store] ?? s.matches[0].client.id}
                              onValueChange={(v) => setMapping(s.store, v)}
                            >
                              <SelectTrigger className="w-full max-w-md">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {s.matches.map((m) => (
                                  <SelectItem key={m.client.id} value={m.client.id}>
                                    {m.client.client_name} ({Math.round(m.score * 100)}% alike)
                                  </SelectItem>
                                ))}
                                {clients
                                  .filter((c) => !s.matches.some((m) => m.client.id === c.id))
                                  .sort((a, b) => a.client_name.localeCompare(b.client_name))
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
                                  ))}
                                <SelectItem value="__new__">— Create new account "{s.store}" —</SelectItem>
                              </SelectContent>
                            </Select>
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
    if (sub.archive_report_path && sub.archive_report_name === file.name) {
      toast.info("That report is already attached to this order");
      return;
    }
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
      toast.success("Report attached — reading outcomes…");

      // Read the ID Verification / Risk Assessment outcomes off the original
      // report and apply the same rules the live reports use.
      try {
        const res = await applyArchiveReportOutcomes(sub.id, file, file.name);
        addLog(
          `Outcomes for ${sub.order_number}: ${res.matched} candidate(s) populated from ${res.records} report record(s)` +
            (res.unmatched.length ? ` • not matched: ${res.unmatched.join(", ")}` : ""),
        );
        if (res.matched) toast.success(`${res.matched} candidate outcome(s) captured from the report`);
        else toast.warning("No candidate on this order matched the report — outcomes were not filled in");
      } catch (e: any) {
        addLog(`Outcome extraction failed for ${sub.order_number}: ${e.message}`);
        toast.warning("Report attached, but outcomes could not be read: " + e.message);
      }
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
      const norm = (n: string) => n.trim().toLowerCase();
      const seenNames = new Set(existing.map((f) => norm(String(f.name ?? ""))));
      for (const file of Array.from(files)) {
        if (seenNames.has(norm(file.name))) { addLog(`Skipped "${file.name}" — already attached`); continue; }
        seenNames.add(norm(file.name));

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
        <p className="text-xs text-muted-foreground mt-1">
          {submissions.length} archive order(s) in total
          {visible.length < (search.trim() ? submissions.filter((s) => `${s.order_number} ${s.archive_batch_label ?? ""} ${clientName(s.client_id)}`.toLowerCase().includes(search.trim().toLowerCase())).length : submissions.length)
            ? " — search to narrow the list (only the first 60 matches are shown)"
            : ""}
        </p>
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

/**
 * Bulk folder upload — mirrors how the archive is stored on disk:
 *   "June 2026 / 02 June 2026 / Risk Assessments CCS.pdf"   -> batch report
 *   "June 2026 / 02 June 2026 / CCS / <anything>.pdf"        -> indemnity for CCS
 * The date folder gives the submission date; the store folder (or the report
 * filename) gives the account. Everything is matched up front and shown for
 * correction before a single byte is uploaded.
 */
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function dateFromFolder(name: string): string | null {
  const m = normName(name).match(/^(\d{1,2}) ([a-z]+) (\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.startsWith(m[2]));
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function storeFromReportName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/^\s*risk\s+assessments?\s*(for)?\s*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

type ArchiveCandidateRow = {
  id_number: string | null;
  first_name: string | null;
  surname: string | null;
  submission_id: string;
};

type PlannedFile = {
  id: string;
  file: File;
  kind: "report" | "indemnity";
  date: string;
  store: string;
  submissionId: string | null;
};

function BulkFolderUploadCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: ArchiveSubmission[];
  clients: Client[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const [planned, setPlanned] = useState<PlannedFile[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [nameMatching, setNameMatching] = useState(false);
  const [matchNote, setMatchNote] = useState<Record<string, string>>({});
  const [suggested, setSuggested] = useState<Record<string, string>>({});
  /** Other archive orders that also hold people named in this batch's report. */
  const [alsoOptions, setAlsoOptions] = useState<Record<string, { id: string; count: number }[]>>({});
  /** Extra orders the user chose to link the same files to. */
  const [alsoLink, setAlsoLink] = useState<Record<string, string[]>>({});

  const candCache = useRef<ArchiveCandidateRow[] | null>(null);

  /** All archive candidates, loaded once and cached (paged past the 1000 limit). */
  const loadArchiveCandidates = async (): Promise<ArchiveCandidateRow[]> => {
    if (candCache.current) return candCache.current;
    const ids = submissions.map((s) => s.id);
    const out: ArchiveCandidateRow[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const slice = ids.slice(i, i + 100);
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await sb
          .from("manual_risk_candidates")
          .select("id_number, first_name, surname, submission_id")
          .in("submission_id", slice)
          .range(from, from + 999);
        if (error) throw error;
        const rows = (data ?? []) as unknown as ArchiveCandidateRow[];
        out.push(...rows);
        if (rows.length < 1000) break;
        from += 1000;
      }
    }
    candCache.current = out;
    return out;
  };

  /**
   * Reads the people inside EVERY report in the selection and confirms them
   * against the candidates on the order it is matched to. Unmatched reports get
   * pointed at the order that holds their people; already-matched reports get a
   * confirmation line (or a warning when the names sit on another order).
   */
  const matchByCandidateNames = async () => {
    const reports = planned.filter((p) => p.kind === "report");
    if (!reports.length) { toast.info("There are no reports in this selection"); return; }
    setNameMatching(true);
    try {
      const cands = await loadArchiveCandidates();
      let confirmed = 0, warned = 0, linked = 0;

      for (const p of reports) {
        const key = keyOf(p);
        let records: Awaited<ReturnType<typeof extractArchiveReportRecords>> = [];
        let readErr = "";
        // Reading a scanned report can time out on the first pass — try again
        // before calling it unreadable.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            records = await extractArchiveReportRecords(p.file);
            readErr = "";
            if (records.length) break;
          } catch (e: any) {
            readErr = e?.message ?? "unknown error";
            await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          }
        }
        if (readErr) {
          addLog(`Could not read "${p.file.name}" after 3 attempts: ${readErr}`);
          setMatchNote((prev) => ({ ...prev, [key]: `Names not verified — report could not be read (try again, or check this batch by hand)` }));
          continue;
        }
        if (!records.length) {
          addLog(`No candidates found inside "${p.file.name}"`);
          setMatchNote((prev) => ({ ...prev, [key]: `Names not verified — no names could be read out of this report` }));
          continue;
        }


        // Tally, per archive order, how many people in the report are on it.
        // A person only counts as the same person when at least TWO of the three
        // identifiers agree (surname, first name, first 6 digits of the ID), so
        // two different people sharing a name are never treated as one.
        const tally = new Map<string, number>();
        // Per person in the report: every archive order that holds them. Used to
        // chase down people who were later moved onto a different order.
        const perPerson: { name: string; orders: Set<string> }[] = [];
        let onCurrent = 0;
        let strongTotal = 0;
        for (const r of records) {
          const rs = normPersonName(r.surname);
          const rf = normPersonName(r.first_names);
          const prefix = String(r.id_prefix ?? "").replace(/\D/g, "").slice(0, 6);
          const hitOrders = new Set<string>();
          let strong = false;
          for (const c of cands) {
            const cs = normPersonName(c.surname);
            const cf = normPersonName(c.first_name);
            const cPrefix = String(c.id_number ?? "").replace(/\D/g, "").slice(0, 6);
            const surnameHit = !!rs && !!cs && rs === cs;
            const firstHit =
              !!rf && !!cf && (rf === cf || rf.startsWith(cf) || cf.startsWith(rf));
            const prefixHit = prefix.length === 6 && prefix === cPrefix;
            const signals = [surnameHit, firstHit, prefixHit].filter(Boolean).length;
            if (signals < 2) continue;
            if (surnameHit && firstHit && prefixHit) strong = true;
            hitOrders.add(c.submission_id);
          }
          if (strong) strongTotal += 1;
          for (const id of hitOrders) tally.set(id, (tally.get(id) ?? 0) + 1);
          if (p.submissionId && hitOrders.has(p.submissionId)) onCurrent += 1;
          perPerson.push({
            name: `${r.first_names ?? ""} ${r.surname ?? ""}`.trim() || "(name unreadable)",
            orders: hitOrders,
          });
        }


        const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
        const best = ranked[0];
        const label = (id: string) => {
          const s = submissions.find((x) => x.id === id);
          return `${clientName(s?.client_id ?? null)} (${s?.order_number ?? ""})`;
        };

        /**
         * People in this report who are NOT on the chosen order: find every other
         * archive order that holds them (a batch saved under one account and later
         * moved), offer those accounts and tick them by default so the report and
         * indemnities reach all of the people inside them. Also reports anyone who
         * is nowhere in the archive at all.
         */
        const recordExtras = (chosen: string) => {
          const leftovers = perPerson.filter((pp) => !pp.orders.has(chosen));
          const notFound = leftovers.filter((pp) => pp.orders.size === 0);
          const otherTally = new Map<string, number>();
          for (const pp of leftovers) {
            for (const id of pp.orders) otherTally.set(id, (otherTally.get(id) ?? 0) + 1);
          }
          const others = Array.from(otherTally.entries())
            .filter(([id]) => id !== chosen)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => ({ id, count: n }));
          setAlsoOptions((prev) => {
            const next = { ...prev };
            if (others.length) next[key] = others; else delete next[key];
            return next;
          });
          // Pre-tick them: the whole point is that these people belong to this report.
          setAlsoLink((prev) => ({ ...prev, [key]: others.map((o) => o.id) }));
          if (others.length) {
            addLog(
              `"${p.file.name}": ${leftovers.length - notFound.length} person(s) sit on other order(s): ` +
                others.map((o) => `${label(o.id)} (${o.count})`).join(", "),
            );
          }
          if (notFound.length) {
            addLog(
              `"${p.file.name}": not found anywhere in the archive — ${notFound
                .map((pp) => pp.name)
                .join(", ")}`,
            );
          }
          const bits: string[] = [];
          if (others.length) {
            bits.push(
              `${leftovers.length - notFound.length} more on ${others.length} other account(s): ` +
                others.map((o) => `${label(o.id)} (${o.count})`).join(", "),
            );
          }
          if (notFound.length) bits.push(`${notFound.length} not found in the archive`);
          return bits.length ? ` — ${bits.join("; ")}` : "";
        };


        if (!p.submissionId) {
          if (!best) {
            addLog(`No archive order holds the people in "${p.file.name}"`);
            setMatchNote((prev) => ({ ...prev, [key]: `Names not found on any archive order` }));
            continue;
          }
          setGroupOrder(key, best[0]);
          const extras = recordExtras(best[0]);

          linked += 1;
          setMatchNote((prev) => ({
            ...prev,
            [key]: `Matched by names — ${best[1]}/${records.length} candidate(s) confirmed on ${label(best[0])}${extras}`,
          }));
          addLog(`"${p.file.name}" matched by names (${best[1]}/${records.length}) to ${label(best[0])}`);
          continue;
        }

        // Already matched by folder/date — verify the names line up.
        const better = best && best[0] !== p.submissionId && best[1] > onCurrent ? best : null;
        const extras = recordExtras(better ? better[0] : p.submissionId);
        if (onCurrent > 0 && !better) {

          confirmed += 1;
          setMatchNote((prev) => ({
            ...prev,
            [key]: `Names verified — ${onCurrent}/${records.length} candidate(s) confirmed on this order (${strongTotal} with name, surname and ID digits all matching)${extras}`,
          }));
          addLog(`"${p.file.name}": names verified ${onCurrent}/${records.length} on ${label(p.submissionId)}`);
        } else {
          warned += 1;
          const suggestion = better ? ` — names match ${label(better[0])} (${better[1]}/${records.length}) instead` : "";
          if (better) setSuggested((prev) => ({ ...prev, [key]: better[0] }));
          setMatchNote((prev) => ({
            ...prev,
            [key]: `Name check failed — ${onCurrent}/${records.length} confirmed on this order${suggestion}${extras}`,
          }));
          addLog(`"${p.file.name}": name check failed (${onCurrent}/${records.length})${suggestion}`);
        }
      }

      toast.success(
        `Name check done — ${confirmed} verified, ${linked} newly matched, ${warned} need attention`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Name matching failed");
    } finally {
      setNameMatching(false);
    }
  };

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");

  const ordersByDate = useMemo(() => {
    const map = new Map<string, ArchiveSubmission[]>();
    for (const s of submissions) {
      const d = new Date(s.created_at).toISOString().slice(0, 10);
      map.set(d, [...(map.get(d) ?? []), s]);
    }
    return map;
  }, [submissions]);

  const matchOrder = (date: string, store: string): string | null => {
    const sameDay = ordersByDate.get(date) ?? [];
    let best: { id: string; score: number } | null = null;
    for (const s of sameDay) {
      const score = Math.max(
        similarity(store, clientName(s.client_id)),
        similarity(store, s.archive_batch_label ?? ""),
      );
      if (!best || score > best.score) best = { id: s.id, score };
    }
    return best && best.score >= 0.35 ? best.id : null;
  };

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const next: PlannedFile[] = [];
    Array.from(list).forEach((file, i) => {
      const rel = (file as any).webkitRelativePath || file.name;
      const parts = String(rel).split("/").filter(Boolean);
      let dateIdx = -1, date: string | null = null;
      for (let p = 0; p < parts.length - 1; p++) {
        const d = dateFromFolder(parts[p]);
        if (d) { dateIdx = p; date = d; }
      }
      if (!date) return;                                   // outside a date folder
      const tail = parts.slice(dateIdx + 1);
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) return;    // data sheets are not documents
      let kind: "report" | "indemnity";
      let store: string;
      if (tail.length === 1) { kind = "report"; store = storeFromReportName(file.name); }
      else { kind = "indemnity"; store = tail[tail.length - 2]; }
      next.push({
        id: `${i}-${rel}`, file, kind, date, store,
        submissionId: matchOrder(date, store),
      });
    });
    setPlanned(next);
    setDone(0); setFailed(0);
    if (!next.length) toast.error("No dated folders found in that selection");
  };

  /**
 * Files on the same date whose folder / report names are the same store written
 * differently ("Maponya" beside "Maponya Mall") belong to ONE batch, so they are
 * clustered together before anything is shown or uploaded.
 */
  const groupKeyOf = useMemo(() => {
    const byDate = new Map<string, PlannedFile[]>();
    for (const p of planned) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
    const keyFor = new Map<string, string>();
    const labelFor = new Map<string, string>();
    for (const [date, list] of byDate) {
      const stores = Array.from(new Set(list.map((p) => p.store)))
        .sort((a, b) => b.length - a.length); // longest first: "Maponya" folds into "Maponya Mall"
      const clusters: { canon: string; stores: string[] }[] = [];
      for (const s of stores) {
        const hit = clusters.find((c) =>
          c.stores.some((x) => {
            const a = matchKey(x), b = matchKey(s);
            if (!a || !b) return false;
            return a === b || a.startsWith(b) || b.startsWith(a) || similarity(x, s) >= 0.8;
          }));
        if (hit) hit.stores.push(s);
        else clusters.push({ canon: s, stores: [s] });
      }
      for (const p of list) {
        const c = clusters.find((x) => x.stores.includes(p.store))!;
        const key = `${date}|${normName(c.canon)}`;
        keyFor.set(p.id, key);
        labelFor.set(key, c.stores.length > 1 ? `${c.canon} (+ ${c.stores.filter((x) => x !== c.canon).join(", ")})` : c.canon);
      }
    }
    return { keyFor, labelFor };
  }, [planned]);

  const keyOf = (p: PlannedFile) => groupKeyOf.keyFor.get(p.id) ?? `${p.date}|${normName(p.store)}`;

  const grouped = useMemo(() => {
    const map = new Map<string, PlannedFile[]>();
    for (const p of planned) {
      const k = keyOf(p);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return Array.from(map.entries()).map(([k, files]) => ({ key: k, files }));
  }, [planned, groupKeyOf]);

  const setGroupOrder = (key: string, submissionId: string) => {
    setPlanned((prev) => prev.map((p) =>
      keyOf(p) === key ? { ...p, submissionId: submissionId || null } : p));
  };

  // A merged batch must point at a single archive order.
  useEffect(() => {
    for (const { files } of grouped) {
      const target = files.find((f) => f.submissionId)?.submissionId ?? null;
      if (target && files.some((f) => f.submissionId !== target)) {
        setGroupOrder(keyOf(files[0]), target);
        return;
      }
    }
  }, [grouped]);

  const applySuggestion = (key: string) => {
    const id = suggested[key];
    if (!id) return;
    setGroupOrder(key, id);
    setSuggested((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setMatchNote((prev) => ({ ...prev, [key]: `Moved to the order the names belong to` }));
  };

  const applyAllSuggestions = () => {
    const keys = Object.keys(suggested);
    setPlanned((prev) => prev.map((p) => {
      const id = suggested[keyOf(p)];
      return id ? { ...p, submissionId: id } : p;
    }));
    setMatchNote((prev) => {
      const n = { ...prev };
      for (const k of keys) n[k] = `Moved to the order the names belong to`;
      return n;
    });
    setSuggested({});
    toast.success(`${keys.length} batch(es) moved to the order their names belong to`);
  };

  const unmatched = planned.filter((p) => !p.submissionId).length;

  /** Adds files the user picks by hand onto an existing batch line. */
  const addFilesToGroup = (key: string, kind: "report" | "indemnity", list: FileList | null) => {
    if (!list || list.length === 0) return;
    const anchor = planned.find((p) => keyOf(p) === key);
    if (!anchor) return;
    const extra: PlannedFile[] = Array.from(list).map((file, i) => ({
      id: `${key}-${kind}-${Date.now()}-${i}`,
      file,
      kind,
      date: anchor.date,
      store: anchor.store,
      submissionId: anchor.submissionId,
    }));
    setPlanned((prev) => [...prev, ...extra]);
    toast.success(`${extra.length} ${kind === "report" ? "report" : "indemnity"} file(s) added`);
  };

  /** Moves every file on one line onto another line (e.g. a "New Folder" of
   *  indemnities onto the report batch it belongs to). */
  const mergeGroupInto = (key: string, targetKey: string) => {
    const target = planned.find((p) => keyOf(p) === targetKey);
    if (!target || key === targetKey) return;
    setPlanned((prev) => prev.map((p) =>
      keyOf(p) === key
        ? { ...p, date: target.date, store: target.store, submissionId: target.submissionId }
        : p));
    setMatchNote((prev) => ({ ...prev, [targetKey]: `Files joined from another folder` }));
    toast.success("Folder joined to the chosen batch");
  };

  const missingSide = (files: PlannedFile[]) => {
    const r = files.filter((f) => f.kind === "report").length;
    const i = files.filter((f) => f.kind === "indemnity").length;
    if (r === 0) return "report" as const;
    if (i === 0) return "indemnity" as const;
    return null;
  };

  /** Batches that hold a report but no indemnities — a stray folder of
   *  indemnities can be joined onto one of these. */
  const reportOnlyGroups = useMemo(
    () => grouped.filter((g) => g.files.some((f) => f.kind === "report")),
    [grouped],
  );





  /** Attaches one file to one archive order (skipping exact duplicates). */
  const attachFileTo = async (sub: ArchiveSubmission, p: PlannedFile) => {
    if (p.kind === "report") {
      // Already attached with the same file name — leave it alone.
      if ((sub as any).archive_report_name === p.file.name && (sub as any).archive_report_path) {
        addLog(`Skipped "${p.file.name}" — report already on ${sub.order_number}`);
        return;
      }
      const path = `${sub.id}/${p.file.name}`;
      const { error: upErr } = await sb.storage.from("archive-reports")
        .upload(path, p.file, { upsert: true, contentType: p.file.type || "application/pdf" });
      if (upErr) throw upErr;
      const { error } = await sb.from("manual_risk_submissions")
        .update({ archive_report_path: path, archive_report_name: p.file.name } as any)
        .eq("id", sub.id);
      if (error) throw error;
      (sub as any).archive_report_path = path;
      (sub as any).archive_report_name = p.file.name;
      try {
        const res = await applyArchiveReportOutcomes(sub.id, p.file, p.file.name);
        addLog(
          `Outcomes for ${sub.order_number}: ${res.matched}/${res.records} captured` +
            (res.unmatched.length ? ` • not matched: ${res.unmatched.join(", ")}` : ""),
        );
      } catch (e: any) {
        addLog(`Outcome extraction failed for ${sub.order_number}: ${e.message}`);
      }
      return;
    }

    const existing: any[] = Array.isArray(sub.indemnity_files) ? sub.indemnity_files : [];
    const norm = (n: string) => n.trim().toLowerCase();
    if (existing.some((f) => norm(String(f.name ?? "")) === norm(p.file.name))) {
      addLog(`Skipped "${p.file.name}" — indemnity already on ${sub.order_number}`);
      return;
    }
    const path = `${sub.id}/${Date.now()}-${p.file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: upErr } = await sb.storage.from("manual-risk-indemnities")
      .upload(path, p.file, { upsert: true, contentType: p.file.type || "application/octet-stream" });
    if (upErr) throw upErr;
    const entry = {
      name: p.file.name, path, uploaded_at: new Date().toISOString(),
      size: p.file.size, content_type: p.file.type || null,
    };
    (sub as any).indemnity_files = [...existing, entry];
    const { error } = await sb.from("manual_risk_submissions")
      .update({ indemnity_files: [...existing, entry] } as any)
      .eq("id", sub.id);
    if (error) throw error;
  };

  const runUpload = async () => {
    setRunning(true); setDone(0); setFailed(0);
    let ok = 0, bad = 0;
    for (const p of planned) {
      if (!p.submissionId) { bad++; setFailed(bad); continue; }
      const targets = Array.from(new Set([p.submissionId, ...(alsoLink[keyOf(p)] ?? [])]));
      let anyOk = false;
      for (const targetId of targets) {
        const sub = submissions.find((s) => s.id === targetId);
        if (!sub) continue;
        try {
          await attachFileTo(sub, p);
          anyOk = true;
        } catch (e: any) {
          addLog(`Failed "${p.file.name}" (${p.date} ${p.store}) → ${sub.order_number}: ${e.message}`);
        }
      }
      if (anyOk) { ok++; setDone(ok); } else { bad++; setFailed(bad); }
    }
    addLog(`Bulk upload finished — ${ok} attached, ${bad} skipped/failed`);
    toast.success(`${ok} file(s) attached`);
    setRunning(false);
    onChanged();
  };


  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Upload className="h-4 w-4 text-red-600" /> Bulk upload from your date folders
      </h3>
      <p className="text-sm text-muted-foreground">
        Choose a month folder (or a single date folder) exactly as you save it. Reports saved beside the
        date folder are treated as the batch report; anything inside a store sub-folder is treated as an
        indemnity for that store. Data sheets are ignored. Check the matches below, fix any that are
        wrong, then upload.
      </p>

      <label className="inline-flex">
        <Button asChild variant="outline" size="sm" disabled={running}>
          <span className="cursor-pointer flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Choose folder
          </span>
        </Button>
        <input
          type="file"
          multiple
          className="hidden"
          disabled={running}
          // @ts-expect-error non-standard but supported in Chromium/WebKit
          webkitdirectory="true"
          directory=""
          onChange={(e) => { onPick(e.target.files); e.currentTarget.value = ""; }}
        />
      </label>

      {planned.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline">{planned.length} file(s)</Badge>
            <Badge variant="outline">{grouped.length} batch(es)</Badge>
            {unmatched > 0
              ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{unmatched} unmatched</span>
              : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />all matched</span>}
            {running && <span className="text-muted-foreground">Uploading {done + failed}/{planned.length}…</span>}
            <Button
              variant="outline"
              size="sm"
              disabled={running || nameMatching}
              onClick={matchByCandidateNames}
            >
              {nameMatching ? "Checking names in reports…" : "Verify names in all reports"}
            </Button>
            {Object.keys(suggested).length > 0 && (
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                disabled={running || nameMatching}
                onClick={applyAllSuggestions}
              >
                Move {Object.keys(suggested).length} batch(es) to the suggested order
              </Button>
            )}
          </div>

          <div className="overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Folder / store</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead className="w-80">Archive order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(({ key, files }) => {
                  const first = files[0];
                  const sameDay = ordersByDate.get(first.date) ?? [];
                  const picked = first.submissionId
                    ? submissions.find((s) => s.id === first.submissionId)
                    : undefined;
                  const options = picked && !sameDay.some((s) => s.id === picked.id)
                    ? [picked, ...sameDay]
                    : sameDay;
                  const missing = missingSide(files);

                  return (
                    <TableRow key={key}>
                      <TableCell className="whitespace-nowrap">{prettyDate(first.date)}</TableCell>
                      <TableCell>
                        {groupKeyOf.labelFor.get(key) || first.store || "—"}
                        {matchNote[key] && (
                          <div
                            className={`text-[11px] mt-0.5 ${
                              /^(Names verified|Matched by names|Moved to)/.test(matchNote[key])
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}
                          >
                            {matchNote[key]}
                          </div>
                        )}
                        {suggested[key] && (
                          <button
                            type="button"
                            className="text-[11px] mt-0.5 text-red-600 hover:underline"
                            disabled={running}
                            onClick={() => applySuggestion(key)}
                          >
                            Use the suggested order
                          </button>
                        )}
                        {(alsoOptions[key] ?? []).length > 0 && (
                          <div className="mt-1 rounded-md border border-sky-200 bg-sky-50 p-1.5">
                            <div className="text-[11px] font-medium text-sky-800">
                              Same people also sit on {(alsoOptions[key] ?? []).length} other account(s) —
                              tick to link the same report and indemnities there too:
                            </div>
                            {(alsoOptions[key] ?? []).map((o) => {
                              const s = submissions.find((x) => x.id === o.id);
                              const on = (alsoLink[key] ?? []).includes(o.id);
                              return (
                                <label key={o.id} className="flex items-start gap-1.5 text-[11px] mt-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={on}
                                    disabled={running}
                                    onChange={(e) => setAlsoLink((prev) => {
                                      const cur = prev[key] ?? [];
                                      return {
                                        ...prev,
                                        [key]: e.target.checked
                                          ? [...cur, o.id]
                                          : cur.filter((x) => x !== o.id),
                                      };
                                    })}
                                  />
                                  <span>
                                    {clientName(s?.client_id ?? null)} — {s?.order_number ?? ""}{" "}
                                    <span className="text-muted-foreground">({o.count} name(s))</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                      </TableCell>
                      <TableCell className="text-xs">
                        <div className={missing ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          {files.filter((f) => f.kind === "report").length} report ·{" "}
                          {files.filter((f) => f.kind === "indemnity").length} indemnity
                        </div>
                        {missing && (
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              No {missing === "report" ? "report" : "indemnities"} in this folder
                            </div>
                            <label className="inline-flex">
                              <span className="text-[11px] text-red-600 hover:underline cursor-pointer">
                                Add {missing === "report" ? "report" : "indemnities"} by hand
                              </span>
                              <input
                                type="file"
                                multiple={missing === "indemnity"}
                                className="hidden"
                                disabled={running}
                                onChange={(e) => {
                                  addFilesToGroup(key, missing, e.target.files);
                                  e.currentTarget.value = "";
                                }}
                              />
                            </label>
                            {missing === "report" && reportOnlyGroups.length > 0 && (
                              <select
                                className="w-full h-7 rounded-md border bg-background px-1 text-[11px]"
                                value=""
                                disabled={running}
                                onChange={(e) => e.target.value && mergeGroupInto(key, e.target.value)}
                              >
                                <option value="">— join to a report folder —</option>
                                {reportOnlyGroups.filter((g) => g.key !== key).map((g) => (
                                  <option key={g.key} value={g.key}>
                                    {prettyDate(g.files[0].date)} — {groupKeyOf.labelFor.get(g.key) || g.files[0].store}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <select
                          className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                          value={first.submissionId ?? ""}
                          disabled={running}
                          onChange={(e) => setGroupOrder(key, e.target.value)}
                        >
                          <option value="">— not matched —</option>
                          {(options.length ? options : submissions).map((s) => (
                            <option key={s.id} value={s.id}>
                              {clientName(s.client_id)} — {s.order_number}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={running || planned.length === 0}
            onClick={runUpload}
          >
            {running ? `Uploading ${done + failed}/${planned.length}…` : `Upload ${planned.length} file(s)`}
          </Button>
        </>
      )}
    </Card>
  );
}

export default ArchiveImportTab;
