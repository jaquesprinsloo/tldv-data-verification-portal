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
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertTriangle, FileText, Eye, Trash2 } from "lucide-react";
import { applyArchiveReportOutcomes, extractArchiveReportRecords, matchArchivePerson, normPersonName } from "@/lib/archiveReportOutcomes";
import { ArchiveOneDriveBackfillCard } from "@/components/manual-risk/ArchiveOneDriveBackfillCard";
import { ArchiveNameReconciliationCard } from "@/components/manual-risk/ArchiveNameReconciliationCard";
import { ArchiveReportAuditCard } from "@/components/manual-risk/ArchiveReportAuditCard";
import { markCandidatesReportMatched, recordUnmatchedReportNames } from "@/lib/archiveNameReconciliation";
import { ARCHIVE_CANDIDATES_KEY, useArchiveCandidates } from "@/lib/archiveCandidatesQuery";
import { archiveReportFiles, archiveReportNameSet, hasArchiveReport } from "@/lib/archiveReportFiles";


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

/** Collect dropped files, walking into folders when the browser allows it. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items
    .map((it) => (typeof (it as any).webkitGetAsEntry === "function" ? (it as any).webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length === 0) return Array.from(dt.files || []);

  const out: File[] = [];
  const readDir = (dirReader: any): Promise<any[]> =>
    new Promise((res) => dirReader.readEntries((e: any[]) => res(e || []), () => res([])));

  const walk = async (entry: any): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      const file: File | null = await new Promise((res) => entry.file((f: File) => res(f), () => res(null)));
      if (file) out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch = await readDir(reader);
      while (batch.length > 0) {
        for (const child of batch) await walk(child);
        batch = await readDir(reader);
      }
    }
  };

  for (const e of entries) await walk(e);
  return out.length > 0 ? out : Array.from(dt.files || []);
}

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
  archive_report_files?: {
    path: string;
    name: string;
    uploaded_at?: string | null;
    onedrive_item_id?: string | null;
    shared_onedrive_item_id?: string | null;
  }[] | null;
  report_onedrive_web_url?: string | null;
  report_onedrive_item_id?: string | null;
  report_onedrive_path?: string | null;
  report_shared_onedrive_web_url?: string | null;
  report_shared_onedrive_item_id?: string | null;
  report_shared_onedrive_path?: string | null;
  indemnity_files: {
    name: string;
    path: string;
    uploaded_at?: string | null;
    onedrive_web_url?: string | null;
    onedrive_item_id?: string | null;
    shared_onedrive_web_url?: string | null;
    shared_onedrive_item_id?: string | null;
  }[] | null;
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

/** Spreadsheets store an ID as a number, which silently drops leading zeros
 *  (0712155343080 comes back as 712155343080). SA IDs are always 13 digits, so
 *  a short all-digit value is padded back out with leading zeros. */
const normalizeIdNumber = (value: string): string => {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 9 && digits.length < 13) return digits.padStart(13, "0");
  return digits || raw;
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
  return `ARC-${date ? date.replace(/-/g, "") : "NODATE"}-${slug || "UNKNOWN"}`;
}

const prettyDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString() : "No date";

/** Person key used to tell whether a candidate is already on the system. */
const personKey = (idNumber: string, surname: string, firstName: string) => {
  const digits = String(idNumber ?? "").replace(/\D/g, "");
  if (digits.length >= 6) return `id:${digits}`;
  return `n:${normName(surname)}|${normName(firstName).split(" ")[0] ?? ""}`;
};

/** "Master Indemnity" PDFs hold the whole batch's indemnities in one file. They
 *  are never taken in: the individual indemnities in the store folders are used,
 *  so signatures are not stored twice (and never filed as a report). */
export function isMasterIndemnity(fileName: string): boolean {
  return /master[\s_\-.]*indemnit/i.test(fileName || "");
}

function blobToBase64(blob: Blob): Promise<string> {

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string)?.split(",")[1];
      if (base64) resolve(base64);
      else reject(new Error("Failed to read file as base64"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type OneDriveUploadResult = { webUrl: string | null; itemId: string | null; fullPath: string | null };

/** Mirrors a file to OneDrive. `shared: true` targets the client-facing folder. */
async function uploadToOneDrive(args: {
  fileName: string;
  base64: string;
  contentType: string;
  clientName: string;
  orderNumber: string;
  kind: "report" | "indemnity";
  shared?: boolean;
}): Promise<OneDriveUploadResult> {
  const { data, error } = await sb.functions.invoke("upload-manual-risk-to-onedrive", {
    body: {
      fileName: args.fileName,
      fileBase64: args.base64,
      contentType: args.contentType,
      clientName: args.clientName,
      orderNumber: args.orderNumber,
      kind: args.kind,
      shared: !!args.shared,
    },
  });
  if (error) throw error;
  if ((data as any)?.success) {
    return {
      webUrl: (data as any).webUrl ?? null,
      itemId: (data as any).itemId ?? null,
      fullPath: (data as any).fullPath ?? null,
    };
  }
  throw new Error((data as any)?.error || "OneDrive upload failed");
}

/**
 * Attaches one file (report or indemnity) to one archive order, skipping exact
 * duplicates, mirroring to both OneDrive folders and — for reports — reading the
 * ID Verification / Risk Assessment outcomes off the document.
 */
async function attachDocumentToOrder(args: {
  sub: ArchiveSubmission;
  file: File;
  kind: "report" | "indemnity";
  clientName: string;
  addLog: (s: string) => void;
}): Promise<void> {
  const { sub, file, kind, clientName, addLog } = args;
  if (isMasterIndemnity(file.name)) {
    addLog(`Skipped "${file.name}" — master indemnity files are never attached`);
    return;
  }
  const contentType = file.type || "application/octet-stream";

  if (kind === "report") {
    const onRecord = archiveReportFiles(sub);
    if (onRecord.some((f) => f.name.trim().toLowerCase() === file.name.trim().toLowerCase())) {
      addLog(`Skipped "${file.name}" — report already on ${sub.order_number}`);
      return;
    }
    const path = `${sub.id}/${file.name}`;
    const { error: upErr } = await sb.storage.from("archive-reports")
      .upload(path, file, { upsert: true, contentType });
    if (upErr) throw upErr;

    let report_onedrive_web_url: string | null = null;
    let report_onedrive_item_id: string | null = null;
    let report_onedrive_path: string | null = null;
    let report_shared_onedrive_web_url: string | null = null;
    let report_shared_onedrive_item_id: string | null = null;
    let report_shared_onedrive_path: string | null = null;

    try {
      const base64 = await blobToBase64(file);
      const od = await uploadToOneDrive({
        fileName: file.name, base64, contentType, clientName,
        orderNumber: sub.order_number, kind: "report",
      });
      report_onedrive_web_url = od.webUrl;
      report_onedrive_item_id = od.itemId;
      report_onedrive_path = od.fullPath;
    } catch (e: any) {
      addLog(`OneDrive mirror failed for report ${file.name}: ${e.message}`);
    }
    try {
      const base64 = await blobToBase64(file);
      const od = await uploadToOneDrive({
        fileName: file.name, base64, contentType, clientName,
        orderNumber: sub.order_number, kind: "report", shared: true,
      });
      report_shared_onedrive_web_url = od.webUrl;
      report_shared_onedrive_item_id = od.itemId;
      report_shared_onedrive_path = od.fullPath;
    } catch (e: any) {
      addLog(`Client-shared OneDrive copy failed for report ${file.name}: ${e.message}`);
    }

    // An order may carry several reports (a batch report plus reports issued
    // separately for individual people), so the new file is added to the list
    // instead of replacing what is already there.
    const nextFiles = [
      ...onRecord,
      {
        path,
        name: file.name,
        uploaded_at: new Date().toISOString(),
        onedrive_item_id: report_onedrive_item_id,
        shared_onedrive_item_id: report_shared_onedrive_item_id,
      },
    ];
    const isFirst = onRecord.length === 0;
    const update: any = { archive_report_files: nextFiles };
    if (isFirst) {
      update.archive_report_path = path;
      update.archive_report_name = file.name;
      update.report_onedrive_web_url = report_onedrive_web_url;
      update.report_onedrive_item_id = report_onedrive_item_id;
      update.report_onedrive_path = report_onedrive_path;
      update.report_shared_onedrive_web_url = report_shared_onedrive_web_url;
      update.report_shared_onedrive_item_id = report_shared_onedrive_item_id;
      update.report_shared_onedrive_path = report_shared_onedrive_path;
    }
    const { error } = await sb.from("manual_risk_submissions").update(update).eq("id", sub.id);
    if (error) throw error;
    (sub as any).archive_report_files = nextFiles;
    if (isFirst) {
      (sub as any).archive_report_path = path;
      (sub as any).archive_report_name = file.name;
      (sub as any).report_onedrive_web_url = report_onedrive_web_url;
      (sub as any).report_onedrive_item_id = report_onedrive_item_id;
      (sub as any).report_onedrive_path = report_onedrive_path;
      (sub as any).report_shared_onedrive_web_url = report_shared_onedrive_web_url;
      (sub as any).report_shared_onedrive_item_id = report_shared_onedrive_item_id;
      (sub as any).report_shared_onedrive_path = report_shared_onedrive_path;
    }

    try {
      const res = await applyArchiveReportOutcomes(sub.id, file, file.name);
      await markCandidatesReportMatched(res.matchedIds, file.name);
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
  if (existing.some((f) => norm(String(f.name ?? "")) === norm(file.name))) {
    addLog(`Skipped "${file.name}" — indemnity already on ${sub.order_number}`);
    return;
  }
  const path = `${sub.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await sb.storage.from("manual-risk-indemnities")
    .upload(path, file, { upsert: true, contentType });
  if (upErr) throw upErr;

  let onedrive_web_url: string | null = null;
  let onedrive_item_id: string | null = null;
  let shared_onedrive_web_url: string | null = null;
  let shared_onedrive_item_id: string | null = null;

  try {
    const base64 = await blobToBase64(file);
    const od = await uploadToOneDrive({
      fileName: file.name, base64, contentType, clientName,
      orderNumber: sub.order_number, kind: "indemnity",
    });
    onedrive_web_url = od.webUrl;
    onedrive_item_id = od.itemId;
  } catch (e: any) {
    addLog(`OneDrive mirror failed for indemnity ${file.name}: ${e.message}`);
  }
  try {
    const base64 = await blobToBase64(file);
    const od = await uploadToOneDrive({
      fileName: file.name, base64, contentType, clientName,
      orderNumber: sub.order_number, kind: "indemnity", shared: true,
    });
    shared_onedrive_web_url = od.webUrl;
    shared_onedrive_item_id = od.itemId;
  } catch (e: any) {
    addLog(`Client-shared OneDrive copy failed for indemnity ${file.name}: ${e.message}`);
  }

  const entry = {
    name: file.name, path, uploaded_at: new Date().toISOString(),
    size: file.size, content_type: contentType,
    onedrive_web_url, onedrive_item_id,
    shared_onedrive_web_url, shared_onedrive_item_id,
  };
  (sub as any).indemnity_files = [...existing, entry];
  const { error } = await sb.from("manual_risk_submissions")
    .update({ indemnity_files: [...existing, entry] } as any)
    .eq("id", sub.id);
  if (error) throw error;
}

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
        .select(`
          id, order_number, client_id, created_at, archive_batch_label,
          archive_report_path, archive_report_name, archive_report_files,
          report_onedrive_web_url, report_onedrive_item_id, report_onedrive_path,
          report_shared_onedrive_web_url, report_shared_onedrive_item_id, report_shared_onedrive_path,
          indemnity_files
        `)
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
          const idNumber = normalizeIdNumber(pick(r, ["ID Number", "IDNumber", "ID"]));
          const surname = pick(r, ["Surname", "Last Name"]);
          const firstName = pick(r, ["First Name", "Firstname", "Name"]);
          const full = pick(r, ["Full Name", "Fullname"]);
          const resolvedFirst = firstName || full.split(" ").slice(0, -1).join(" ");
          const resolvedSurname = surname || full.split(" ").slice(-1).join(" ");
          // A missing date is fine: the person is still imported, into an
          // undated archive order for that store, and linked up later when the
          // document folders are matched.
          if (!store || (!idNumber && !resolvedSurname)) { bad += 1; return; }
          out.push({
            rowNumber: i + 2,
            submissionDate: date ?? "",
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
    setProgress({ done: 0, total: orders.length, label: "Checking who is already on the system" });
    try {
      // Everyone already recorded anywhere on the system, so a re-upload only
      // ever adds the people that are genuinely new.
      const onSystem = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
          .from("manual_risk_candidates")
          .select("id_number, first_name, surname")
          .range(from, from + 999);
        if (error) throw error;
        const batch = (data ?? []) as any[];
        for (const c of batch) onSystem.add(personKey(c.id_number ?? "", c.surname ?? "", c.first_name ?? ""));
        if (batch.length < 1000) break;
      }
      addLog(`${onSystem.size} person(s) already on the system`);

      let newOrders = 0, newCands = 0, skippedCands = 0;
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i];
        setProgress({ done: i, total: orders.length, label: `${o.storeAccount} — ${prettyDate(o.date)}` });
        const clientId = resolveClientId(o.storeAccount);
        const orderNumber = archiveOrderNumber(o.storeAccount, o.date);
        const label = `${o.storeAccount} ${prettyDate(o.date)}`;
        const createdAt = new Date(o.date ? `${o.date}T09:00:00` : Date.now()).toISOString();

        // Only the people who are not already on the system anywhere.
        const fresh = o.candidates.filter((c) => {
          const key = personKey(c.idNumber, c.surname, c.firstName);
          if (onSystem.has(key)) { skippedCands += 1; return false; }
          onSystem.add(key);
          return true;
        });

        // Idempotent: reuse the order if this store/date was already imported.
        const { data: existing } = await sb
          .from("manual_risk_submissions")
          .select("id")
          .eq("order_number", orderNumber)
          .maybeSingle();

        let submissionId = existing?.id as string | undefined;
        if (!submissionId && !fresh.length) continue;   // nothing new here at all
        if (!submissionId) {
          const { data: ins, error: insErr } = await sb
            .from("manual_risk_submissions")
            .insert({
              order_number: orderNumber,
              client_id: clientId,
              submission_type: fresh.length > 1 ? "batch" : "single",
              status: "completed",
              requested_checks: ARCHIVE_CHECKS,
              notes: o.date
                ? "Historical archive import (already invoiced)"
                : "Historical archive import (already invoiced) — no submission date on the spreadsheet",
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

        const { count: existingCount } = await sb
          .from("manual_risk_candidates")
          .select("id", { count: "exact", head: true })
          .eq("submission_id", submissionId);

        const payload = fresh.map((c, idx) => ({
          submission_id: submissionId!,
          id_number: c.idNumber || "—",
          surname: c.surname || "—",
          first_name: [c.firstName, c.secondName].filter(Boolean).join(" ") || "—",
          sort_order: (existingCount ?? 0) + idx,
        }));

        if (payload.length) {
          const { error: cErr } = await sb.from("manual_risk_candidates").insert(payload as any);
          if (cErr) { addLog(`Candidates for "${label}" failed: ${cErr.message}`); continue; }
          newCands += payload.length;
          addLog(`${label}: ${payload.length} candidate(s) imported`);
        }
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

      <ArchiveReportAuditCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
        addLog={addLog}
      />

      <ArchiveAffectedChecksCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
        addLog={addLog}
      />

      <ArchiveNameReconciliationCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
      />


      <ReportsFirstUploadCard
        submissions={archiveSubs}
        clients={clients}
        onChanged={() => { refetchArchive(); onChanged(); }}
        addLog={addLog}
      />

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

      <ArchiveOneDriveBackfillCard addLog={addLog} />




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

/** Orders containing archive people who have not been confirmed by the report
 * currently attached to their own order. This is the working list for finding
 * wrong report/order links and replacing the affected documents in place. */
function ArchiveAffectedChecksCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: ArchiveSubmission[];
  clients: Client[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const qc = useQueryClient();
  const { data: candidates = [], isLoading, refetch } = useArchiveCandidates();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—";
  const normFile = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

  const affected = useMemo(() => {
    const byOrder = new Map<string, typeof candidates>();
    candidates.forEach((candidate) => {
      byOrder.set(candidate.submission_id, [...(byOrder.get(candidate.submission_id) ?? []), candidate]);
    });
    const q = search.trim().toLowerCase();
    return submissions
      .map((submission) => {
        // An order can hold several reports; a person counts as confirmed when
        // any report on their own order names them.
        const reportNames = archiveReportNameSet(submission);
        const people = (byOrder.get(submission.id) ?? []).filter((candidate) =>
          reportNames.size === 0 || !reportNames.has(normFile(candidate.report_matched_file)),
        );
        return { submission, people };
      })
      .filter(({ submission, people }) => {
        if (!people.length) return false;
        if (!q) return true;
        const names = people.map((p) => `${p.first_name ?? ""} ${p.surname ?? ""} ${p.id_number ?? ""}`).join(" ");
        return `${submission.order_number} ${submission.archive_batch_label ?? ""} ${clientName(submission.client_id)} ${names}`
          .toLowerCase().includes(q);
      })
      .sort((a, b) => a.submission.created_at.localeCompare(b.submission.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, submissions, clients, search]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ARCHIVE_CANDIDATES_KEY });
    await refetch();
    onChanged();
  };

  const openStored = async (bucket: string, path: string) => {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not open the file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  /**
   * Re-reads the report(s) already attached to an order with the current
   * matching rules. Used from "Checks requiring document review" so a fix to
   * the matcher/extractor can be tried before replacing any documents.
   */
  const rereadReports = async (sub: ArchiveSubmission) => {
    const files = archiveReportFiles(sub);
    if (!files.length) {
      toast.info("No Risk Assessment is attached to this order yet");
      return;
    }
    setBusy(`reread-${sub.id}`);
    try {
      const { data: orderCands, error: cErr } = await sb
        .from("manual_risk_candidates")
        .select("id, id_number, first_name, surname, submission_id")
        .eq("submission_id", sub.id);
      if (cErr) throw cErr;
      const cands = (orderCands ?? []) as any[];

      const matched = new Set<string>();
      const failures: string[] = [];
      for (const reportFile of files) {
        try {
          const { data: signed, error: sErr } = await sb.storage
            .from("archive-reports")
            .createSignedUrl(reportFile.path, 300);
          if (sErr || !signed?.signedUrl) throw new Error(sErr?.message || "report could not be opened");
          const res = await fetch(signed.signedUrl);
          if (!res.ok) throw new Error(`download failed (${res.status})`);
          const blob = await res.blob();
          const file = new File([blob], reportFile.name || "report.pdf", { type: blob.type || "application/pdf" });

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

          for (const record of records) {
            if (!normPersonName(record.surname) && !normPersonName(record.first_names)) continue;
            cands
              .filter((c) => matchArchivePerson(record, c).matches)
              .forEach((c) => matched.add(c.id));
          }
          if (matched.size) await markCandidatesReportMatched([...matched], reportFile.name);
        } catch (e: any) {
          failures.push(`${reportFile.name}: ${e.message}`);
        }
      }

      if (failures.length === files.length) throw new Error(failures.join(" • "));
      if (failures.length) addLog(`Re-read partly failed on ${sub.order_number} — ${failures.join(" • ")}`);
      addLog(`Re-read ${files.length} report(s) on ${sub.order_number}: ${matched.size} candidate(s) confirmed`);
      toast.success(matched.size
        ? `${matched.size} candidate(s) confirmed on ${sub.order_number}`
        : `Report re-read, but no candidates could be confirmed on ${sub.order_number}`);
      await refresh();
    } catch (error: any) {
      toast.error(error.message ?? "Could not re-read the report");
    } finally {
      setBusy(null);
    }
  };

  const deleteOneDriveCopy = async (itemId: string | null | undefined) => {
    if (!itemId) return;
    try {
      const { data, error } = await sb.functions.invoke("upload-manual-risk-to-onedrive", {
        body: { action: "delete", itemId },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "OneDrive delete failed");
    } catch (error: any) {
      addLog(`OneDrive copy could not be deleted: ${error.message}`);
    }
  };

  const deleteReport = async (sub: ArchiveSubmission, target: { path: string; name: string; onedrive_item_id?: string | null; shared_onedrive_item_id?: string | null }) => {
    if (!window.confirm(`Delete "${target.name}" from ${sub.order_number}?`)) return;
    setBusy(`report-${target.path}`);
    const oldName = target.name;
    try {
      const { error: storageError } = await sb.storage.from("archive-reports").remove([target.path]);
      if (storageError) throw storageError;
      await Promise.all([
        deleteOneDriveCopy(target.onedrive_item_id),
        deleteOneDriveCopy(target.shared_onedrive_item_id),
      ]);
      const remaining = archiveReportFiles(sub).filter((f) => f.path !== target.path);
      const primary = remaining[0] ?? null;
      const { error } = await sb.from("manual_risk_submissions").update({
        archive_report_files: remaining as any,
        archive_report_path: primary?.path ?? null,
        archive_report_name: primary?.name ?? null,
        report_onedrive_web_url: null,
        report_onedrive_item_id: primary?.onedrive_item_id ?? null,
        report_onedrive_path: null,
        report_shared_onedrive_web_url: null,
        report_shared_onedrive_item_id: primary?.shared_onedrive_item_id ?? null,
        report_shared_onedrive_path: null,
      } as any).eq("id", sub.id);
      if (error) throw error;
      (sub as any).archive_report_files = remaining;
      (sub as any).archive_report_path = primary?.path ?? null;
      (sub as any).archive_report_name = primary?.name ?? null;
      if (oldName) {
        await sb.from("manual_risk_candidates").update({
          report_matched_at: null,
          report_matched_file: null,
        } as never).eq("submission_id", sub.id).eq("report_matched_file", oldName);
      }
      addLog(`Deleted report "${oldName ?? "report"}" from ${sub.order_number}`);
      toast.success("Incorrect report removed");
      await refresh();
    } catch (error: any) {
      toast.error(error.message ?? "Could not delete the report");
    } finally {
      setBusy(null);
    }
  };

  const deleteIndemnity = async (sub: ArchiveSubmission, file: NonNullable<ArchiveSubmission["indemnity_files"]>[number]) => {
    if (!window.confirm(`Delete "${file.name}" from ${sub.order_number}?`)) return;
    setBusy(`indemnity-${file.path}`);
    try {
      const { error: storageError } = await sb.storage.from("manual-risk-indemnities").remove([file.path]);
      if (storageError) throw storageError;
      await Promise.all([
        deleteOneDriveCopy(file.onedrive_item_id),
        deleteOneDriveCopy(file.shared_onedrive_item_id),
      ]);
      const next = (sub.indemnity_files ?? []).filter((item) => item.path !== file.path);
      const { error } = await sb.from("manual_risk_submissions").update({ indemnity_files: next as any }).eq("id", sub.id);
      if (error) throw error;
      addLog(`Deleted indemnity "${file.name}" from ${sub.order_number}`);
      toast.success("Incorrect indemnity removed");
      await refresh();
    } catch (error: any) {
      toast.error(error.message ?? "Could not delete the indemnity");
    } finally {
      setBusy(null);
    }
  };

  const uploadFiles = async (sub: ArchiveSubmission, kind: "report" | "indemnity", files: File[]) => {
    const usable = files.filter((file) => !isMasterIndemnity(file.name));
    if (!usable.length) {
      toast.info("No files were added; master indemnity files are excluded");
      return;
    }
    setBusy(`${kind}-${sub.id}`);
    try {
      const selected = usable;
      for (const file of selected) {
        await attachDocumentToOrder({ sub, file, kind, clientName: clientName(sub.client_id), addLog });
      }
      toast.success(kind === "report"
        ? `${selected.length} Risk Assessment(s) uploaded and checked`
        : `${selected.length} indemnity file(s) uploaded`);
      await refresh();
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Checks requiring document review
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          These orders contain people who have not been confirmed on the Risk Assessment currently attached to their order.
          Open the existing documents, remove anything incorrect, and upload the correct files on the same row.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] max-w-md flex-1">
          <Label className="text-xs">Find a check</Label>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Candidate, ID, account or order number" className="h-9" />
        </div>
        <Badge variant="outline" className="text-amber-700 border-amber-300">
          {affected.length} order(s) require review
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading checks…</p>
      ) : affected.length === 0 ? (
        <p className="text-sm text-muted-foreground">No affected checks match this search.</p>
      ) : (
        <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
          {affected.map(({ submission: sub, people }) => {
            const open = !!expanded[sub.id];
            const reportFiles = archiveReportFiles(sub);
            const noReport = reportFiles.length === 0;
            return (
              <div key={sub.id} className="rounded-md border border-amber-300 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-amber-50/60">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{clientName(sub.client_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString()} • {sub.order_number} • {people.length} candidate(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={noReport ? "text-red-700 border-red-300" : "text-amber-700 border-amber-300"}>
                      {noReport ? "No report uploaded" : "Report does not confirm everyone"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => setExpanded((state) => ({ ...state, [sub.id]: !open }))}>
                      {open ? "Hide" : "Inspect"}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="p-3 space-y-4">
                    <div>
                      <p className="text-xs font-medium mb-1">Candidates still waiting for confirmation</p>
                      <div className="flex flex-wrap gap-1">
                        {people.map((person) => (
                          <span key={person.id} className="rounded border px-2 py-1 text-xs">
                            {[person.first_name, person.surname].filter(Boolean).join(" ") || "Unnamed candidate"}
                            {person.id_number ? ` • ${person.id_number}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-xs font-medium">Risk Assessments ({reportFiles.length})</p>
                        {reportFiles.length ? (
                          <div className="space-y-1">
                            {reportFiles.map((reportFile) => (
                              <div key={reportFile.path} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1">
                                <button
                                  type="button"
                                  className="text-xs underline text-left truncate max-w-[220px]"
                                  onClick={() => openStored("archive-reports", reportFile.path)}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1 inline" />{reportFile.name}
                                </button>
                                <Button variant="destructive" size="sm" disabled={busy === `report-${reportFile.path}`} onClick={() => deleteReport(sub, reportFile)}>
                                  <Trash2 className="h-4 w-4 mr-1" /> {busy === `report-${reportFile.path}` ? "Removing…" : "Remove"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-red-700">No Risk Assessment is attached.</p>
                        )}
                        <label
                          onDragEnter={(event) => { event.preventDefault(); setDragOver(`report-${sub.id}`); }}
                          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(`report-${sub.id}`); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={(event) => {
                            event.preventDefault(); setDragOver(null);
                            void filesFromDrop(event.dataTransfer).then((files) => uploadFiles(sub, "report", files));
                          }}
                          className={`block rounded border border-dashed p-3 text-center text-xs cursor-pointer ${dragOver === `report-${sub.id}` ? "border-red-600 bg-red-50" : "border-muted-foreground/30"}`}
                        >
                          Drop the Risk Assessment(s) here or choose files
                          <input type="file" multiple accept=".pdf,.doc,.docx" className="hidden" disabled={busy !== null} onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length) void uploadFiles(sub, "report", files);
                            event.currentTarget.value = "";
                          }} />
                        </label>
                        <p className="text-[11px] text-muted-foreground">
                          More than one report can sit on an order — add the extra report for anyone who was
                          assessed separately, and remove only the reports that are wrong.
                        </p>
                      </div>

                      <div className="rounded-md border p-3 space-y-2">
                        <p className="text-xs font-medium">Indemnities ({(sub.indemnity_files ?? []).length})</p>
                        {(sub.indemnity_files ?? []).length === 0 ? (
                          <p className="text-xs text-red-700">No indemnities are attached.</p>
                        ) : (
                          <div className="space-y-1">
                            {(sub.indemnity_files ?? []).map((file) => (
                              <div key={file.path} className="flex items-center justify-between gap-2 text-xs">
                                <Button variant="link" size="sm" className="h-auto min-w-0 justify-start p-0 text-left" onClick={() => openStored("manual-risk-indemnities", file.path)}>
                                  <Eye className="h-3.5 w-3.5 mr-1 shrink-0" /><span className="truncate">{file.name}</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" disabled={busy === `indemnity-${file.path}`} onClick={() => deleteIndemnity(sub, file)} aria-label={`Remove ${file.name}`}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label
                          onDragEnter={(event) => { event.preventDefault(); setDragOver(`indemnity-${sub.id}`); }}
                          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragOver(`indemnity-${sub.id}`); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={(event) => {
                            event.preventDefault(); setDragOver(null);
                            void filesFromDrop(event.dataTransfer).then((files) => uploadFiles(sub, "indemnity", files));
                          }}
                          className={`block rounded border border-dashed p-3 text-center text-xs cursor-pointer ${dragOver === `indemnity-${sub.id}` ? "border-red-600 bg-red-50" : "border-muted-foreground/30"}`}
                        >
                          Drop the correct indemnities here or choose files
                          <input type="file" multiple className="hidden" disabled={busy !== null} onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            if (files.length) void uploadFiles(sub, "indemnity", files);
                            event.currentTarget.value = "";
                          }} />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
  const [showDone, setShowDone] = useState(false);
  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");

  /** An order is finished once it has its report and at least one indemnity. */
  const isComplete = (s: ArchiveSubmission) =>
    hasArchiveReport(s) && (s.indemnity_files ?? []).length > 0;

  const counts = useMemo(() => {
    let noReport = 0, noIndemnity = 0, neither = 0, complete = 0;
    for (const s of submissions) {
      const hasR = hasArchiveReport(s);
      const hasI = (s.indemnity_files ?? []).length > 0;
      if (hasR && hasI) complete += 1;
      else {
        if (!hasR) noReport += 1;
        if (!hasI) noIndemnity += 1;
        if (!hasR && !hasI) neither += 1;
      }
    }
    return { noReport, noIndemnity, neither, complete, outstanding: submissions.length - complete };
  }, [submissions]);

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = showDone ? submissions : submissions.filter((s) => !isComplete(s));
    return q
      ? base.filter((s) =>
          `${s.order_number} ${s.archive_batch_label ?? ""} ${clientName(s.client_id)}`.toLowerCase().includes(q))
      : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, search, clients, showDone]);

  const visible = useMemo(() => matching.slice(0, 60), [matching]);

  const uploadReport = async (sub: ArchiveSubmission, file: File) => {
    if (isMasterIndemnity(file.name)) {
      toast.info("Master indemnity files are not attached — upload the individual indemnities instead");
      return;
    }
    if (archiveReportNameSet(sub).has(file.name.trim().toLowerCase())) {
      toast.info("That report is already attached to this order");
      return;
    }

    setBusy(sub.id);
    try {
      await attachDocumentToOrder({
        sub, file, kind: "report", clientName: clientName(sub.client_id), addLog,
      });
      toast.success("Report attached and read");
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
        if (isMasterIndemnity(file.name)) { addLog(`Skipped "${file.name}" — master indemnity files are not attached`); continue; }
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
        Only the orders that still need documents are listed. Once an order has its report and at
        least one indemnity it drops off this list and lives in the archive under the Accounts tab.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-md border p-2">
          <p className="text-[11px] text-muted-foreground">Still outstanding</p>
          <p className="text-lg font-semibold">{counts.outstanding}</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-[11px] text-muted-foreground">No report</p>
          <p className="text-lg font-semibold text-amber-600">{counts.noReport}</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-[11px] text-muted-foreground">No indemnities</p>
          <p className="text-lg font-semibold text-amber-600">{counts.noIndemnity}</p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-[11px] text-muted-foreground">Complete (in archive)</p>
          <p className="text-lg font-semibold text-emerald-600">{counts.complete}</p>
        </div>
      </div>
      {counts.neither > 0 && (
        <p className="text-xs text-muted-foreground">
          {counts.neither} order(s) have neither a report nor indemnities yet.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-sm flex-1 min-w-[220px]">
          <Label className="text-xs">Find an archive order</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Store, date or order number" className="h-8" />
          <p className="text-xs text-muted-foreground mt-1">
            Showing {visible.length} of {matching.length}
            {matching.length > visible.length ? " — search to narrow the list" : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-5">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Also show completed orders
        </label>
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
                  {submissions.length === 0
                    ? "No archive orders yet — import the spreadsheet first."
                    : search.trim()
                      ? "No orders match that search."
                      : "Every archive order has its report and indemnities — they now live in the archive under the Accounts tab."}
                </TableCell>
              </TableRow>
            ) : visible.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                <TableCell>{clientName(s.client_id)}</TableCell>
                <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {hasArchiveReport(s)
                    ? <Badge className="bg-emerald-600 text-[10px]">{archiveReportFiles(s).length} attached</Badge>
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
  id?: string;
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

/**
 * Kept outside the component so switching tabs (which throws the card away and
 * builds it again) never loses the chosen folder, the match notes, or a run in
 * progress. An upload that is already going keeps going and writes its progress
 * here, so the card picks it back up exactly where it is.
 */
const bulkSession: {
  planned: PlannedFile[];
  matchNote: Record<string, string>;
  suggested: Record<string, string>;
  alsoOptions: Record<string, { id: string; count: number }[]>;
  alsoLink: Record<string, string[]>;
  running: boolean;
  done: number;
  failed: number;
} = {
  planned: [], matchNote: {}, suggested: {}, alsoOptions: {}, alsoLink: {},
  running: false, done: 0, failed: 0,
};

/**
 * Batches whose people could not be found in the archive are written down here
 * (kept in the browser, so they survive a reload) and stay on a "to revisit"
 * list until they are dealt with.
 */
type UnresolvedBatch = {
  key: string;
  date: string;
  store: string;
  reason: string;
  files: string[];
  savedAt: string;
};

const UNRESOLVED_LS_KEY = "tldv.archive.unresolvedBatches";

const loadUnresolved = (): UnresolvedBatch[] => {
  try {
    const raw = localStorage.getItem(UNRESOLVED_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as UnresolvedBatch[]) : [];
  } catch {
    return [];
  }
};

const saveUnresolved = (list: UnresolvedBatch[]) => {
  try { localStorage.setItem(UNRESOLVED_LS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};


function BulkFolderUploadCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: ArchiveSubmission[];
  clients: Client[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const [planned, setPlanned] = useState<PlannedFile[]>(bulkSession.planned);
  const [running, setRunning] = useState(bulkSession.running);
  const [done, setDone] = useState(bulkSession.done);
  const [failed, setFailed] = useState(bulkSession.failed);
  const [nameMatching, setNameMatching] = useState(false);
  const [matchNote, setMatchNote] = useState<Record<string, string>>(bulkSession.matchNote);
  const [suggested, setSuggested] = useState<Record<string, string>>(bulkSession.suggested);
  /** Other archive orders that also hold people named in this batch's report. */
  const [alsoOptions, setAlsoOptions] = useState<Record<string, { id: string; count: number }[]>>(bulkSession.alsoOptions);
  /** Extra orders the user chose to link the same files to. */
  const [alsoLink, setAlsoLink] = useState<Record<string, string[]>>(bulkSession.alsoLink);

  // Remember everything on screen, so it survives leaving and re-opening the tab.
  useEffect(() => { bulkSession.planned = planned; }, [planned]);
  useEffect(() => { bulkSession.matchNote = matchNote; }, [matchNote]);
  useEffect(() => { bulkSession.suggested = suggested; }, [suggested]);
  useEffect(() => { bulkSession.alsoOptions = alsoOptions; }, [alsoOptions]);
  useEffect(() => { bulkSession.alsoLink = alsoLink; }, [alsoLink]);

  // An upload started before the tab was left keeps running in the background —
  // follow it here until it finishes.
  useEffect(() => {
    if (!bulkSession.running) return;
    const t = window.setInterval(() => {
      setRunning(bulkSession.running);
      setDone(bulkSession.done);
      setFailed(bulkSession.failed);
      if (!bulkSession.running) {
        setPlanned(bulkSession.planned);
        setMatchNote(bulkSession.matchNote);
        setSuggested(bulkSession.suggested);
        setAlsoOptions(bulkSession.alsoOptions);
        setAlsoLink(bulkSession.alsoLink);
        window.clearInterval(t);
      }
    }, 800);
    return () => window.clearInterval(t);
  }, []);

  // Warn before the page is closed or reloaded mid-upload.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  /** Batches saved for later, because their names were not found in the archive. */
  const [unresolved, setUnresolved] = useState<UnresolvedBatch[]>(loadUnresolved);
  useEffect(() => { saveUnresolved(unresolved); }, [unresolved]);

  /** Writes one batch onto the revisit list (replacing an earlier note for it). */
  const rememberUnresolved = (key: string, date: string, store: string, reason: string) => {
    const files = planned.filter((x) => keyOf(x) === key).map((x) => x.file.name);
    setUnresolved((prev) => [
      { key, date, store, reason, files, savedAt: new Date().toISOString() },
      ...prev.filter((u) => u.key !== key),
    ]);
  };

  const downloadUnresolved = () => {
    const rows = [
      ["Date", "Folder / store", "Reason", "Files", "Saved at"],
      ...unresolved.map((u) => [u.date, u.store, u.reason, u.files.join(" | "), u.savedAt]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-batches-to-revisit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          .select("id, id_number, first_name, surname, submission_id")
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
          rememberUnresolved(key, p.date, p.store, "Report could not be read");
          continue;
        }
        if (!records.length) {
          addLog(`No candidates found inside "${p.file.name}"`);
          setMatchNote((prev) => ({ ...prev, [key]: `Names not verified — no names could be read out of this report` }));
          rememberUnresolved(key, p.date, p.store, "No names could be read out of the report");
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
          const hitOrders = new Set<string>();
          let strong = false;
          for (const c of cands) {
            const match = matchArchivePerson(r, c);
            if (!match.matches) continue;
            if (match.strong) strong = true;
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
            rememberUnresolved(key, p.date, p.store, "Names not found on any archive order");
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
    let masters = 0;
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
      // A "Master Indemnity" holds every indemnity of the batch in one PDF. The
      // individual indemnities are already in the store folders, so taking it as
      // well would file the same signatures twice (and as a report).
      if (isMasterIndemnity(file.name)) { masters += 1; return; }
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
    if (masters) toast.info(`${masters} master indemnity file(s) skipped — the individual indemnities are used instead`);
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
    const usable = Array.from(list).filter((f) => !isMasterIndemnity(f.name));
    const blocked = list.length - usable.length;
    const extra: PlannedFile[] = usable.map((file, i) => ({
      id: `${key}-${kind}-${Date.now()}-${i}`,
      file,
      kind,
      date: anchor.date,
      store: anchor.store,
      submissionId: anchor.submissionId,
    }));
    if (extra.length) setPlanned((prev) => [...prev, ...extra]);
    if (blocked) toast.info(`${blocked} master indemnity file(s) skipped — use the individual indemnities`);
    if (extra.length) toast.success(`${extra.length} ${kind === "report" ? "report" : "indemnity"} file(s) added`);
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





  /** Attaches one file to one archive order (skipping exact duplicates) and mirrors it to OneDrive. */
  const attachFileTo = async (sub: ArchiveSubmission, p: PlannedFile) => {
    await attachDocumentToOrder({
      sub,
      file: p.file,
      kind: p.kind,
      clientName: clients.find((c) => c.id === sub.client_id)?.client_name ?? "Unassigned",
      addLog,
    });
  };


  const runUpload = async () => {
    const items = [...planned];
    if (!items.length) return;
    setRunning(true); setDone(0); setFailed(0);
    bulkSession.running = true; bulkSession.done = 0; bulkSession.failed = 0;

    // Ask the machine to stay awake so a sleeping screen does not cut the run short.
    let wake: any = null;
    try { wake = await (navigator as any).wakeLock?.request?.("screen"); } catch { /* not available */ }

    const attached = new Set<string>();
    let ok = 0, bad = 0;
    for (const p of items) {
      if (!p.submissionId) { bad++; setFailed(bad); bulkSession.failed = bad; continue; }
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
      if (anyOk) { ok++; attached.add(p.id); setDone(ok); bulkSession.done = ok; }
      else { bad++; setFailed(bad); bulkSession.failed = bad; }
    }
    addLog(`Bulk upload finished — ${ok} attached, ${bad} skipped/failed`);
    toast.success(`${ok} file(s) attached`);

    // Everything that went up is cleared off the list, so only the batches that
    // still need attention stay behind and the next folder can be chosen.
    const remaining = items.filter((p) => !attached.has(p.id));
    const liveKeys = new Set(remaining.map((p) => keyOf(p)));
    const prune = <T,>(rec: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(rec).filter(([k]) => liveKeys.has(k)));
    setPlanned(remaining); bulkSession.planned = remaining;
    setMatchNote((prev) => { const n = prune(prev); bulkSession.matchNote = n; return n; });
    setSuggested((prev) => { const n = prune(prev); bulkSession.suggested = n; return n; });
    setAlsoOptions((prev) => { const n = prune(prev); bulkSession.alsoOptions = n; return n; });
    setAlsoLink((prev) => { const n = prune(prev); bulkSession.alsoLink = n; return n; });

    setRunning(false); bulkSession.running = false;
    try { wake?.release?.(); } catch { /* ignore */ }
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
        indemnity for that store. Data sheets and "Master Indemnity" files are ignored — the individual
        indemnities in the store folders are used instead. Check the matches below, fix any that are

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
                  // Orders imported without a spreadsheet date can never match on
                  // the date, so they are always offered as a manual choice.
                  const undated = submissions.filter(
                    (s) => s.order_number.includes("-NODATE-") && !sameDay.some((x) => x.id === s.id),
                  );
                  const base = [...sameDay, ...undated];
                  const picked = first.submissionId
                    ? submissions.find((s) => s.id === first.submissionId)
                    : undefined;
                  const options = picked && !base.some((s) => s.id === picked.id)
                    ? [picked, ...base]
                    : base;
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
                              Other people in this report sit on {(alsoOptions[key] ?? []).length} other
                              account(s) — ticked by default so they get the same report and indemnities.
                              Untick any that should not receive them:
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

      {unresolved.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-amber-800 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              {unresolved.length} batch(es) saved to revisit
            </span>
            <Button variant="outline" size="sm" onClick={downloadUnresolved}>
              Download list
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUnresolved([])}
            >
              Clear list
            </Button>
          </div>
          <p className="text-xs text-amber-800">
            These folders could not be placed on an archive order during the name check. They stay here
            (even after a reload) until you clear them, so you can come back once everything else is loaded.
          </p>
          <div className="overflow-x-auto max-h-72">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Folder / store</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolved.map((u) => (
                  <TableRow key={u.key}>
                    <TableCell className="whitespace-nowrap">{prettyDate(u.date)}</TableCell>
                    <TableCell>{u.store || "—"}</TableCell>
                    <TableCell className="text-xs text-amber-700">{u.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.files.length} file(s)
                      {u.files.length > 0 && (
                        <div className="text-[11px]">{u.files.slice(0, 4).join(", ")}
                          {u.files.length > 4 ? ` +${u.files.length - 4} more` : ""}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-[11px] text-red-600 hover:underline"
                        onClick={() => setUnresolved((prev) => prev.filter((x) => x.key !== u.key))}
                      >
                        Remove
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>

  );
}

/* ------------------------------------------------------------------------- *
 * Reports first: drop a batch of risk assessment reports, read the names off
 * each one, see which order it belongs to and on which date it was submitted,
 * then drop the matching indemnities per order and approve. Approving uploads
 * in the background so the next report can be prepared while it runs.
 * ------------------------------------------------------------------------- */

type RfIndemnity = { id: string; file: File };

type RfTarget = {
  orderId: string;
  matched: number;
  names: string[];
  indemnities: RfIndemnity[];
};

type RfReport = {
  id: string;
  file: File;
  folderDate: string | null;
  state: "reading" | "ready" | "unmatched" | "uploading" | "done" | "failed";
  note: string;
  people: { name: string; found: boolean }[];
  targets: RfTarget[];
  progress: string;
};

/** Kept outside the component so switching tabs never loses a run in progress. */
const reportsFirstSession: { reports: RfReport[] } = { reports: [] };

let rfCandidateCache: ArchiveCandidateRow[] | null = null;

async function fetchArchiveCandidates(submissionIds: string[]): Promise<ArchiveCandidateRow[]> {
  if (rfCandidateCache) return rfCandidateCache;
  const out: ArchiveCandidateRow[] = [];
  for (let i = 0; i < submissionIds.length; i += 100) {
    const slice = submissionIds.slice(i, i + 100);
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await sb
        .from("manual_risk_candidates")
        .select("id, id_number, first_name, surname, submission_id")
        .in("submission_id", slice)
        .range(from, from + 999);
      if (error) throw error;
      const rows = (data ?? []) as unknown as ArchiveCandidateRow[];
      out.push(...rows);
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  rfCandidateCache = out;
  return out;
}

function ReportsFirstUploadCard({
  submissions, clients, onChanged, addLog,
}: {
  submissions: ArchiveSubmission[];
  clients: Client[];
  onChanged: () => void;
  addLog: (s: string) => void;
}) {
  const [reports, setReports] = useState<RfReport[]>(reportsFirstSession.reports);
  const [reading, setReading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const reportInput = useRef<HTMLInputElement>(null);

  const write = (updater: (list: RfReport[]) => RfReport[]) => {
    setReports((prev) => {
      const next = updater(prev);
      reportsFirstSession.reports = next;
      return next;
    });
  };

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");
  const orderById = (id: string) => submissions.find((s) => s.id === id);
  const orderLabel = (id: string) => {
    const s = orderById(id);
    if (!s) return "Unknown order";
    return `${clientName(s.client_id)} — ${new Date(s.created_at).toLocaleDateString()} (${s.order_number})`;
  };

  const orderOptions = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const sorted = [...submissions].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const filtered = q
      ? sorted.filter((s) =>
          `${s.order_number} ${s.archive_batch_label ?? ""} ${clientName(s.client_id)} ${new Date(s.created_at).toLocaleDateString()}`
            .toLowerCase().includes(q))
      : sorted;
    return filtered.slice(0, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, orderSearch, clients]);

  /** Reads the people out of one report and works out which order(s) hold them. */
  const readReport = async (rep: RfReport) => {
    const cands = await fetchArchiveCandidates(submissions.map((s) => s.id));

    let records: Awaited<ReturnType<typeof extractArchiveReportRecords>> = [];
    let readErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        records = await extractArchiveReportRecords(rep.file);
        readErr = "";
        if (records.length) break;
      } catch (e: any) {
        readErr = e?.message ?? "unknown error";
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }

    if (readErr || !records.length) {
      const note = readErr
        ? `The report could not be read (${readErr}) — pick the order by hand`
        : "No names could be read out of this report — pick the order by hand";
      addLog(`"${rep.file.name}": ${note}`);
      write((list) => list.map((r) => (r.id === rep.id ? { ...r, state: "unmatched", note, people: [] } : r)));
      return;
    }

    const tally = new Map<string, number>();
    const namesByOrder = new Map<string, string[]>();
    const people: { name: string; found: boolean }[] = [];
    const matchedCandidateIds: string[] = [];
    const notInArchive: typeof records = [];

    for (const r of records) {
      const name = `${r.first_names ?? ""} ${r.surname ?? ""}`.trim() || "(name unreadable)";
      const hitOrders = new Set<string>();
      for (const c of cands) {
        if (!matchArchivePerson(r, c).matches) continue;
        hitOrders.add(c.submission_id);
        if (c.id) matchedCandidateIds.push(c.id);
      }
      for (const id of hitOrders) {
        tally.set(id, (tally.get(id) ?? 0) + 1);
        namesByOrder.set(id, [...(namesByOrder.get(id) ?? []), name]);
      }
      people.push({ name, found: hitOrders.size > 0 });
      if (!hitOrders.size) notInArchive.push(r);
    }

    const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);

    // Everyone this report confirmed drops off the "waiting for a report" list,
    // and everyone it names who is nowhere in the archive is written down for
    // investigation.
    void markCandidatesReportMatched(matchedCandidateIds, rep.file.name);
    void recordUnmatchedReportNames(
      notInArchive.map((r) => ({
        fullName: `${r.first_names ?? ""} ${r.surname ?? ""}`.trim() || "(name unreadable)",
        firstNames: r.first_names ?? null,
        surname: r.surname ?? null,
        idPrefix: String(r.id_prefix ?? "").replace(/\D/g, "").slice(0, 6) || null,
        reportFileName: rep.file.name,
        reportDate: rep.folderDate,
        storeLabel: storeFromReportName(rep.file.name) || null,
        linkedSubmissionId: ranked[0]?.[0] ?? null,
        raw: r,
      })),
    );

    if (!ranked.length) {
      const note = `${records.length} name(s) read, but none of them are on an archive order — pick the order by hand`;
      addLog(`"${rep.file.name}": ${note}`);
      write((list) => list.map((r) => (r.id === rep.id ? { ...r, state: "unmatched", note, people } : r)));
      return;
    }

    // Every order that holds people from this report becomes a target, so a
    // report whose people were split across accounts gets its own drop zone per
    // account for the indemnities.
    const targets: RfTarget[] = ranked.map(([orderId, matched]) => ({
      orderId,
      matched,
      names: namesByOrder.get(orderId) ?? [],
      indemnities: [],
    }));
    const missing = people.filter((p) => !p.found).length;
    const note =
      `${records.length} name(s) read • linked to ${targets.length} order(s)` +
      (missing ? ` • ${missing} name(s) not found in the archive` : "");
    addLog(`"${rep.file.name}": ${note} — ${targets.map((t) => orderLabel(t.orderId)).join(" | ")}`);
    write((list) => list.map((r) => (r.id === rep.id ? { ...r, state: "ready", note, people, targets } : r)));
  };

  const addReports = async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list as any as File[]);
    if (!files.length) return;

    const fresh: RfReport[] = [];
    let skipped = 0;
    for (const file of files) {
      if (isMasterIndemnity(file.name)) { skipped += 1; continue; }
      const rel = (file as any).webkitRelativePath || "";
      let folderDate: string | null = null;
      for (const part of String(rel).split("/").filter(Boolean)) {
        const d = dateFromFolder(part);
        if (d) folderDate = d;
      }
      fresh.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`,
        file, folderDate, state: "reading", note: "Reading the names off this report…",
        people: [], targets: [], progress: "",
      });
    }
    if (skipped) toast.info(`${skipped} master indemnity file(s) skipped`);
    if (!fresh.length) return;

    write((prev) => [...fresh, ...prev]);
    setReading(true);
    for (const rep of fresh) {
      try {
        await readReport(rep);
      } catch (e: any) {
        write((l) => l.map((r) => (r.id === rep.id ? { ...r, state: "unmatched", note: e.message ?? "Reading failed" } : r)));
      }
    }
    setReading(false);
  };

  const setTargets = (reportId: string, fn: (t: RfTarget[]) => RfTarget[]) =>
    write((list) => list.map((r) => (r.id === reportId ? { ...r, targets: fn(r.targets) } : r)));

  const addTarget = (reportId: string, orderId: string) =>
    setTargets(reportId, (t) =>
      t.some((x) => x.orderId === orderId) ? t : [...t, { orderId, matched: 0, names: [], indemnities: [] }]);

  const addIndemnities = (reportId: string, orderId: string, list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list as any as File[]);
    let blocked = 0;
    setTargets(reportId, (t) =>
      t.map((x) => {
        if (x.orderId !== orderId) return x;
        const have = new Set(x.indemnities.map((i) => i.file.name.toLowerCase()));
        const add: RfIndemnity[] = [];
        for (const f of files) {
          if (isMasterIndemnity(f.name)) { blocked += 1; continue; }
          if (have.has(f.name.toLowerCase())) continue;
          have.add(f.name.toLowerCase());
          add.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`, file: f });
        }
        return { ...x, indemnities: [...x.indemnities, ...add] };
      }),
    );
    if (blocked) toast.info(`${blocked} master indemnity file(s) skipped — use the individual indemnities`);
  };

  /** Uploads one report and its indemnities in the background. */
  const approve = (rep: RfReport) => {
    const targets = rep.targets;
    if (!targets.length) { toast.error("Link this report to an order first"); return; }

    write((l) => l.map((r) => (r.id === rep.id ? { ...r, state: "uploading", progress: "Starting…" } : r)));
    const setProgress = (p: string) =>
      write((l) => l.map((r) => (r.id === rep.id ? { ...r, progress: p } : r)));

    void (async () => {
      let ok = 0, bad = 0;
      for (const t of targets) {
        const sub = submissions.find((s) => s.id === t.orderId);
        if (!sub) { bad += 1; continue; }
        const cn = clientName(sub.client_id);
        try {
          setProgress(`Report → ${sub.order_number}`);
          await attachDocumentToOrder({ sub, file: rep.file, kind: "report", clientName: cn, addLog });
          ok += 1;
        } catch (e: any) {
          bad += 1;
          addLog(`Report "${rep.file.name}" failed on ${sub.order_number}: ${e.message}`);
        }
        for (let i = 0; i < t.indemnities.length; i++) {
          setProgress(`Indemnity ${i + 1}/${t.indemnities.length} → ${sub.order_number}`);
          try {
            await attachDocumentToOrder({ sub, file: t.indemnities[i].file, kind: "indemnity", clientName: cn, addLog });
            ok += 1;
          } catch (e: any) {
            bad += 1;
            addLog(`Indemnity "${t.indemnities[i].file.name}" failed on ${sub.order_number}: ${e.message}`);
          }
        }
      }
      if (bad && !ok) {
        write((l) =>
          l.map((r) =>
            r.id === rep.id
              ? { ...r, state: "failed", progress: `${ok} file(s) uploaded, ${bad} failed` }
              : r,
          ),
        );
        toast.error(`${rep.file.name} — nothing could be uploaded`);
      } else {
        write((l) => l.filter((r) => r.id !== rep.id));
        toast.success(`${rep.file.name} — ${ok} file(s) uploaded${bad ? `, ${bad} failed` : ""}`);
      }
      onChanged();
    })();
  };

  const remove = (reportId: string) => write((l) => l.filter((r) => r.id !== reportId));

  // ---- files already filed against an order ----
  const [busyFile, setBusyFile] = useState<string | null>(null);

  const odDelete = async (itemId: string | null | undefined) => {
    if (!itemId) return;
    try {
      const { data, error } = await sb.functions.invoke("upload-manual-risk-to-onedrive", {
        body: { action: "delete", itemId },
      });
      if (error) throw error;
      if ((data as any)?.success === false) throw new Error((data as any)?.error || "OneDrive delete failed");
    } catch (e: any) {
      addLog(`OneDrive copy could not be deleted: ${e.message}`);
    }
  };

  const openStored = async (bucket: string, path: string) => {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data) { toast.error(error?.message ?? "Could not open the file"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const deleteExistingReport = async (
    sub: ArchiveSubmission,
    target: { path: string; name: string; onedrive_item_id?: string | null; shared_onedrive_item_id?: string | null },
  ) => {
    if (!confirm(`Delete the report "${target.name}" from ${sub.order_number}? You can then upload the correct one.`)) return;
    setBusyFile(`rep-${target.path}`);
    try {
      await sb.storage.from("archive-reports").remove([target.path]);
      await odDelete(target.onedrive_item_id);
      await odDelete(target.shared_onedrive_item_id);
      const remaining = archiveReportFiles(sub).filter((f) => f.path !== target.path);
      const primary = remaining[0] ?? null;
      const { error } = await sb.from("manual_risk_submissions").update({
        archive_report_files: remaining as any,
        archive_report_path: primary?.path ?? null,
        archive_report_name: primary?.name ?? null,
        report_onedrive_web_url: null,
        report_onedrive_item_id: primary?.onedrive_item_id ?? null,
        report_onedrive_path: null,
        report_shared_onedrive_web_url: null,
        report_shared_onedrive_item_id: primary?.shared_onedrive_item_id ?? null,
        report_shared_onedrive_path: null,
      } as any).eq("id", sub.id);
      if (error) throw error;
      (sub as any).archive_report_files = remaining;
      (sub as any).archive_report_path = primary?.path ?? null;
      (sub as any).archive_report_name = primary?.name ?? null;
      (sub as any).report_onedrive_item_id = primary?.onedrive_item_id ?? null;
      (sub as any).report_shared_onedrive_item_id = primary?.shared_onedrive_item_id ?? null;
      addLog(`Deleted the report on ${sub.order_number}`);
      toast.success("Report deleted — upload the correct one and approve");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete the report");
    } finally {
      setBusyFile(null);
    }
  };

  const deleteExistingIndemnity = async (
    sub: ArchiveSubmission,
    f: { name: string; path: string; onedrive_item_id?: string | null; shared_onedrive_item_id?: string | null },
  ) => {
    if (!confirm(`Delete the indemnity "${f.name}" from ${sub.order_number}?`)) return;
    setBusyFile(`ind-${f.path}`);
    try {
      await sb.storage.from("manual-risk-indemnities").remove([f.path]);
      await odDelete(f.onedrive_item_id);
      await odDelete(f.shared_onedrive_item_id);
      const next = (sub.indemnity_files ?? []).filter((x) => x.path !== f.path);
      const { error } = await sb.from("manual_risk_submissions")
        .update({ indemnity_files: next as any }).eq("id", sub.id);
      if (error) throw error;
      (sub as any).indemnity_files = next;
      addLog(`Deleted indemnity "${f.name}" on ${sub.order_number}`);
      toast.success("Indemnity deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete the indemnity");
    } finally {
      setBusyFile(null);
    }
  };


  const stateBadge = (r: RfReport) => {
    switch (r.state) {
      case "reading": return <Badge variant="outline" className="text-[10px]">Reading names…</Badge>;
      case "ready": return <Badge className="bg-emerald-600 text-[10px]">Linked</Badge>;
      case "unmatched": return <Badge className="bg-amber-500 text-[10px]">Needs an order</Badge>;
      case "uploading": return <Badge variant="outline" className="text-[10px]">Uploading…</Badge>;
      case "done": return <Badge className="bg-emerald-600 text-[10px]">Uploaded</Badge>;
      default: return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <FileText className="h-4 w-4 text-red-600" /> Reports first — read the names, then add the indemnities
      </h3>
      <p className="text-sm text-muted-foreground">
        Drop a batch of risk assessment reports here. Each report is read, the people on it are matched to
        their archive order, and you see the submission date so you know which folder it came from. Then drop
        the matching indemnities under each order and click Approve — the upload runs on its own while you
        carry on finding the next lot. If the order already has the right indemnities on record, you do not
        need to add them again; Approve will attach the report and leave the existing documents in place.
        Once a report is successfully approved it disappears from this list.
      </p>

      <div
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault(); e.stopPropagation(); setDragOver(false);
          filesFromDrop(e.dataTransfer).then((files) => addReports(files));
        }}
        onClick={() => reportInput.current?.click()}
        className={`rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition ${
          dragOver ? "border-red-600 bg-red-50" : "border-muted-foreground/30"
        }`}
      >
        <Upload className="h-5 w-5 mx-auto mb-2 text-red-600" />
        <p className="text-sm font-medium">Drop the reports here</p>
        <p className="text-xs text-muted-foreground">or click to choose them {reading ? "• still reading the last lot…" : ""}</p>
        <input
          ref={reportInput}
          type="file"
          multiple
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => { addReports(e.target.files); e.currentTarget.value = ""; }}
        />
      </div>

      {reports.length > 0 && (
        <p className="text-xs text-muted-foreground">{reports.length} report(s) on the list</p>
      )}

      {reports.length > 0 && (
        <div>
          <Label className="text-xs">Find an order (used by the "link to another order" pickers below)</Label>
          <Input
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            placeholder="Store, date or order number"
            className="h-8 max-w-sm"
          />
        </div>
      )}

      <div className="space-y-3">
        {reports.map((r) => (
          <div key={r.id} className="rounded-md border p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm break-all">{r.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.folderDate
                    ? `Submission date from the folder: ${new Date(r.folderDate).toLocaleDateString()}`
                    : "No submission date on the folder — the date below comes from the linked order"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{r.note}</p>
                {r.targets.some((t) => hasArchiveReport(orderById(t.orderId))) && (
                  <p className="text-xs text-amber-700 mt-1">
                    A report is already on record for one of the linked orders — check it below before approving.
                  </p>
                )}

                {r.progress && <p className="text-xs text-red-600 mt-1">{r.progress}</p>}
              </div>
              <div className="flex items-center gap-2">
                {stateBadge(r)}
                {r.state !== "uploading" && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => remove(r.id)}>Remove</Button>
                )}
              </div>
            </div>

            {r.people.length > 0 && (
              <div className="text-xs">
                <p className="font-medium mb-1">Names on this report</p>
                <div className="flex flex-wrap gap-1">
                  {r.people.map((p, i) => (
                    <span
                      key={i}
                      className={`rounded px-1.5 py-0.5 border ${
                        p.found ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {r.targets.map((t) => {
                const sub = orderById(t.orderId);
                return (
                  <div key={t.orderId} className="rounded-md bg-muted/40 p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs">
                        <p className="font-medium">{orderLabel(t.orderId)}</p>
                        <p className="text-muted-foreground">
                          Submission date {sub ? new Date(sub.created_at).toLocaleDateString() : "—"}
                          {t.matched ? ` • ${t.matched} of the names on this report belong here` : " • added by hand"}
                        </p>
                        {t.names.length > 0 && (
                          <p className="text-muted-foreground">{t.names.join(", ")}</p>
                        )}
                      </div>
                      {r.state !== "uploading" && r.state !== "done" && (
                        <Button
                          variant="ghost" size="sm" className="text-xs"
                          onClick={() => setTargets(r.id, (list) => list.filter((x) => x.orderId !== t.orderId))}
                        >
                          Unlink
                        </Button>
                      )}
                    </div>

                    {sub && (hasArchiveReport(sub) || (sub.indemnity_files ?? []).length > 0) && (
                      <div className="rounded border border-amber-400 bg-amber-50 p-2 space-y-1.5 text-xs">
                        <p className="flex items-center gap-1 font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          This order already has documents on record — they will stay attached unless you delete them. Click to review, and delete any that are wrong before you approve.
                        </p>
                        {archiveReportFiles(sub).map((reportFile) => (
                          <div key={reportFile.path} className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">Report:</span>
                            <button
                              className="text-red-700 underline break-all text-left"
                              onClick={() => openStored("archive-reports", reportFile.path)}
                            >
                              {reportFile.name}
                            </button>
                            <Button
                              variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-700"
                              disabled={busyFile === `rep-${reportFile.path}`}
                              onClick={() => deleteExistingReport(sub, reportFile)}
                            >
                              {busyFile === `rep-${reportFile.path}` ? "Deleting…" : "Delete"}
                            </Button>
                          </div>
                        ))}
                        {(sub.indemnity_files ?? []).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-muted-foreground">
                              Indemnities on record ({(sub.indemnity_files ?? []).length}):
                            </span>
                            {(sub.indemnity_files ?? []).map((f) => (
                              <div key={f.path} className="flex flex-wrap items-center gap-2">
                                <button
                                  className="text-red-700 underline break-all text-left"
                                  onClick={() => openStored("manual-risk-indemnities", f.path)}
                                >
                                  {f.name}
                                </button>
                                <Button
                                  variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-700"
                                  disabled={busyFile === `ind-${f.path}`}
                                  onClick={() => deleteExistingIndemnity(sub, f)}
                                >
                                  {busyFile === `ind-${f.path}` ? "Deleting…" : "Delete"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {hasArchiveReport(sub) && (
                          <p className="text-amber-800">
                            A new report is added alongside the one(s) above — delete only what is wrong.
                          </p>
                        )}
                      </div>
                    )}



                    <div
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        filesFromDrop(e.dataTransfer).then((files) => addIndemnities(r.id, t.orderId, files));
                      }}
                      className="rounded border border-dashed p-2 text-xs text-center text-muted-foreground"
                    >
                      Drop the indemnities for this order here, or{" "}
                      <label className="text-red-600 cursor-pointer hover:underline">
                        choose files
                        <input
                          type="file" multiple className="hidden"
                          onChange={(e) => { addIndemnities(r.id, t.orderId, e.target.files); e.currentTarget.value = ""; }}
                        />
                      </label>
                      {t.indemnities.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 justify-center">
                          {t.indemnities.map((i) => (
                            <span key={i.id} className="rounded border bg-background px-1.5 py-0.5">
                              {i.file.name}
                              {r.state !== "uploading" && r.state !== "done" && (
                                <button
                                  className="ml-1 text-red-600"
                                  onClick={() =>
                                    setTargets(r.id, (list) =>
                                      list.map((x) =>
                                        x.orderId === t.orderId
                                          ? { ...x, indemnities: x.indemnities.filter((y) => y.id !== i.id) }
                                          : x,
                                      ))
                                  }
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {r.state !== "uploading" && r.state !== "done" && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-80">
                  <Select value="" onValueChange={(v) => addTarget(r.id, v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Link to another order…" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {clientName(s.client_id)} — {new Date(s.created_at).toLocaleDateString()} ({s.order_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700"
                  disabled={r.state === "reading" || r.targets.length === 0}
                  onClick={() => approve(r)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve &amp; upload
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default ArchiveImportTab;

