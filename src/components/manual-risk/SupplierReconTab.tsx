import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as sb } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Trash2, FileSpreadsheet, Download, AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { isPlaceholderCandidate } from "@/lib/manualRiskPdf";
import PricingPanel from "./PricingPanel";
import {
  usePricing, priceMap, supplierTitleToCheckKey, checkLabel, money,
  candidateRevenue, CHECK_PRICE_KEYS,
} from "./pricing";

interface SupplierBatch {
  id: string;
  name: string;
  period_start: string | null;
  period_end: string | null;
  source_file_name: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_total: number | null;
  notes: string | null;
  created_at: string;
}

interface SupplierLine {
  id: string;
  batch_id: string;
  enquiry_no: string | null;
  supplier_created_at: string | null;
  internal_order_number: string | null;
  contact_name: string | null;
  full_name: string | null;
  id_number: string | null;
  dob: string | null;
  gender: string | null;
  check_status: string | null;
  check_title: string | null;
  check_result: string | null;
  check_key: string | null;
  matched_candidate_id: string | null;
  matched_submission_id: string | null;
  match_status: string;
}

interface OurCandidate {
  id: string;
  submission_id: string;
  id_number: string;
  first_name: string;
  surname: string;
  is_tldv_internal: boolean | null;
  is_ptvs_discount: boolean | null;
  override_client_id: string | null;
}

interface OurSubmission {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  requested_checks: string[] | null;
}

const norm = (v: any) => String(v ?? "").trim();
const digits = (v: any) => norm(v).replace(/\D/g, "");
/**
 * Comparable ID key. Excel drops leading zeros on numeric ID cells, so a 13-digit
 * SA ID can arrive as 12 digits — pad it back before matching.
 */
const idKey = (v: any) => {
  const d = digits(v);
  if (!d) return "";
  if (d.length < 13) return d.padStart(13, "0");
  if (d.length > 13) return d.slice(-13);
  return d;
};

/**
 * Comparable name key: lowercase letters only, words sorted so
 * "Surname Firstname" and "Firstname Surname" match.
 */
const nameKey = (v: any) =>
  norm(v)
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");

function buildNameIndex(cands: OurCandidate[]) {
  const m = new Map<string, OurCandidate[]>();
  for (const c of cands) {
    const key = nameKey(`${c.first_name ?? ""} ${c.surname ?? ""}`);
    if (!key) continue;
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(c);
  }
  return m;
}

/**
 * Match a statement line to one of our candidates: first on ID number, and when
 * the line has no usable ID number (passport used instead) on first name + surname.
 */
function resolveMatch(
  line: { id_number?: string | null; full_name?: string | null },
  checkKey: string | null,
  candByIdNumber: Map<string, OurCandidate[]>,
  candByName: Map<string, OurCandidate[]>,
  subById: Map<string, OurSubmission>,
): { match: OurCandidate | null; status: string } {
  const byId = digits(line.id_number).length >= 6 ? candByIdNumber.get(idKey(line.id_number)) ?? [] : [];
  const cands = byId.length ? byId : candByName.get(nameKey(line.full_name)) ?? [];
  if (!cands.length) return { match: null, status: "not_on_system" };

  // Prefer a candidate whose submission actually requested this check type.
  for (const c of cands) {
    const sub = subById.get(c.submission_id);
    const requested = sub?.requested_checks?.length ? sub.requested_checks : ["id_verification", "risk_assessment"];
    if (checkKey && requested.includes(checkKey)) return { match: c, status: "matched" };
  }
  return { match: cands[0], status: "check_not_requested" };
}

function excelDate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const d = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null;
    return d && !isNaN(d.getTime()) ? d.toISOString() : null;
  }
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function SupplierReconTab() {
  const qc = useQueryClient();
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);

  const { data: batches = [], isLoading } = useQuery<SupplierBatch[]>({
    queryKey: ["mra-supplier-batches"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_supplier_batches" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const { data: ourCandidates = [] } = useQuery<OurCandidate[]>({
    queryKey: ["mra-recon-candidates"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_candidates")
        .select("id, submission_id, id_number, first_name, surname, is_tldv_internal, is_ptvs_discount, override_client_id");
      if (error) throw error;
      return ((data ?? []) as any[]).filter((c) => !isPlaceholderCandidate(c as any)) as any;
    },
  });

  const { data: ourSubmissions = [] } = useQuery<OurSubmission[]>({
    queryKey: ["mra-recon-submissions"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_submissions")
        .select("id, order_number, client_id, created_at, requested_checks");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", period_start: "", period_end: "", supplier_invoice_number: "", supplier_invoice_total: "", notes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const candByIdNumber = useMemo(() => {
    const m = new Map<string, OurCandidate[]>();
    for (const c of ourCandidates) {
      const key = idKey(c.id_number);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [ourCandidates]);

  const candByName = useMemo(() => buildNameIndex(ourCandidates), [ourCandidates]);

  const subById = useMemo(() => new Map(ourSubmissions.map((s) => [s.id, s])), [ourSubmissions]);

  const parseWorkbook = async (f: File) => {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const headerIdx = aoa.findIndex((row) => row.some((c) => norm(c).toLowerCase() === "enquiry no"));
    if (headerIdx < 0) throw new Error("Could not find the header row (expected a column called 'Enquiry no').");
    const headers = aoa[headerIdx].map((h) => norm(h).toLowerCase());
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = headers.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = {
      enquiry: col("enquiry no", "enquiry number"),
      created: col("created at", "created"),
      order: col("internal order number", "order number"),
      cost: col("cost centre", "cost center"),
      contact: col("contact name"),
      full: col("full name", "name"),
      id: col("id number", "idnumber"),
      passport: col("passport"),
      dob: col("dob", "date of birth"),
      gender: col("gender"),
      status: col("check status", "status"),
      title: col("check title", "check name"),
      result: col("check result", "result"),
    };
    const get = (row: any[], i: number) => (i >= 0 ? row[i] : null);
    const rows = aoa.slice(headerIdx + 1).filter((r) => r && r.some((c) => norm(c) !== ""));
    return rows.map((r) => ({
      enquiry_no: norm(get(r, idx.enquiry)) || null,
      supplier_created_at: excelDate(get(r, idx.created)),
      internal_order_number: norm(get(r, idx.order)) || null,
      cost_centre: norm(get(r, idx.cost)) || null,
      contact_name: norm(get(r, idx.contact)) || null,
      full_name: norm(get(r, idx.full)) || null,
      id_number: norm(get(r, idx.id)) || null,
      passport: norm(get(r, idx.passport)) || null,
      dob: excelDate(get(r, idx.dob))?.slice(0, 10) ?? null,
      gender: norm(get(r, idx.gender)) || null,
      check_status: norm(get(r, idx.status)) || null,
      check_title: norm(get(r, idx.title)) || null,
      check_result: norm(get(r, idx.result)) || null,
    }));
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Choose a spreadsheet first"); return; }
    setUploading(true);
    try {
      const parsed = await parseWorkbook(file);
      if (!parsed.length) throw new Error("No data rows found in the spreadsheet.");

      const { data: batch, error: bErr } = await sb
        .from("manual_risk_supplier_batches" as any)
        .insert({
          name: form.name.trim() || file.name.replace(/\.xlsx?$/i, ""),
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          source_file_name: file.name,
          supplier_invoice_number: form.supplier_invoice_number.trim() || null,
          supplier_invoice_total: form.supplier_invoice_total ? parseFloat(form.supplier_invoice_total) : null,
          notes: form.notes.trim() || null,
        } as any)
        .select("id")
        .single();
      if (bErr) throw bErr;

      const rows = parsed.map((p) => {
        const key = supplierTitleToCheckKey(p.check_title);
        const { match, status } = resolveMatch(p, key, candByIdNumber, candByName, subById);
        return {
          batch_id: (batch as any).id,
          ...p,
          check_key: key,
          matched_candidate_id: match?.id ?? null,
          matched_submission_id: match?.submission_id ?? null,
          match_status: status,
        };
      });

      for (let i = 0; i < rows.length; i += 300) {
        const { error } = await sb.from("manual_risk_supplier_lines" as any).insert(rows.slice(i, i + 300) as any);
        if (error) throw error;
      }

      toast.success(`Imported ${rows.length} statement line(s)`);
      setUploadOpen(false);
      setFile(null);
      setForm({ name: "", period_start: "", period_end: "", supplier_invoice_number: "", supplier_invoice_total: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["mra-supplier-batches"] });
      setOpenBatchId((batch as any).id);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setUploading(false);
    }
  };

  const deleteBatch = async (id: string, name: string) => {
    if (!confirm(`Delete statement batch "${name}" and all its lines? This cannot be undone.`)) return;
    const { error } = await sb.from("manual_risk_supplier_batches" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Batch deleted");
    qc.invalidateQueries({ queryKey: ["mra-supplier-batches"] });
  };

  if (openBatchId) {
    return (
      <BatchDetail
        batchId={openBatchId}
        batches={batches}
        onBack={() => setOpenBatchId(null)}
        ourCandidates={ourCandidates}
        ourSubmissions={ourSubmissions}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold">Supplier statements</h3>
            <p className="text-xs text-muted-foreground">
              Upload the provider's .xlsx statement to reconcile what they charge us against what we actually submitted.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload statement
          </Button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : batches.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No supplier statements uploaded yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Supplier invoice</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      {b.name}
                    </div>
                    {b.source_file_name && <div className="text-xs text-muted-foreground">{b.source_file_name}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {b.period_start || b.period_end
                      ? `${b.period_start ?? "…"} → ${b.period_end ?? "…"}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {b.supplier_invoice_number ?? "—"}
                    {b.supplier_invoice_total != null && (
                      <div className="text-xs text-muted-foreground">{money(Number(b.supplier_invoice_total))}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{new Date(b.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setOpenBatchId(b.id)}>Open</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteBatch(b.id, b.name)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <PricingPanel />

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Upload supplier statement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Spreadsheet (.xlsx)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2 mt-1">
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Choose file
                </Button>
                <span className="text-xs text-muted-foreground truncate">{file?.name ?? "No file chosen"}</span>
              </div>
            </div>
            <div>
              <Label>Batch name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Online August 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period from</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div>
                <Label>Period to</Label>
                <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier invoice #</Label>
                <Input value={form.supplier_invoice_number} onChange={(e) => setForm({ ...form, supplier_invoice_number: e.target.value })} />
              </div>
              <div>
                <Label>Supplier invoice total (R)</Label>
                <Input type="number" step="0.01" value={form.supplier_invoice_total} onChange={(e) => setForm({ ...form, supplier_invoice_total: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Import & reconcile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "matched") return <Badge className="bg-emerald-600 text-white">Matched</Badge>;
  if (status === "check_not_requested")
    return <Badge className="bg-amber-500 text-white">Check not requested</Badge>;
  return <Badge className="bg-destructive text-destructive-foreground">Not on system</Badge>;
}

function BatchDetail({
  batchId, batches, onBack, ourCandidates, ourSubmissions,
}: {
  batchId: string;
  batches: SupplierBatch[];
  onBack: () => void;
  ourCandidates: OurCandidate[];
  ourSubmissions: OurSubmission[];
}) {
  const qc = useQueryClient();
  const batch = batches.find((b) => b.id === batchId);
  const { data: prices = [] } = usePricing();
  const pm = useMemo(() => priceMap(prices), [prices]);

  const [filter, setFilter] = useState<"all" | "unmatched" | "matched">("all");
  const [search, setSearch] = useState("");
  const [invNumber, setInvNumber] = useState(batch?.supplier_invoice_number ?? "");
  const [invTotal, setInvTotal] = useState(batch?.supplier_invoice_total != null ? String(batch.supplier_invoice_total) : "");
  const [savingInv, setSavingInv] = useState(false);

  const { data: lines = [], isLoading } = useQuery<SupplierLine[]>({
    queryKey: ["mra-supplier-lines", batchId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_supplier_lines" as any)
        .select("*")
        .eq("batch_id", batchId)
        .order("supplier_created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const subById = useMemo(() => new Map(ourSubmissions.map((s) => [s.id, s])), [ourSubmissions]);

  const counts = useMemo(() => {
    const c = { total: lines.length, matched: 0, notRequested: 0, notOnSystem: 0 };
    for (const l of lines) {
      if (l.match_status === "matched") c.matched += 1;
      else if (l.match_status === "check_not_requested") c.notRequested += 1;
      else c.notOnSystem += 1;
    }
    return c;
  }, [lines]);

  // Supplier cost calculated from statement lines × the price list.
  const supplierCost = useMemo(
    () => lines.reduce((sum, l) => sum + (l.check_key ? pm.get(l.check_key)?.supplier_cost ?? 0 : 0), 0),
    [lines, pm],
  );

  // Our billing: every candidate matched in this statement, billed at client prices.
  const billing = useMemo(() => {
    const seen = new Set<string>();
    let gross = 0, discount = 0;
    let candidateCount = 0;
    for (const l of lines) {
      if (!l.matched_candidate_id || seen.has(l.matched_candidate_id)) continue;
      seen.add(l.matched_candidate_id);
      const cand = ourCandidates.find((c) => c.id === l.matched_candidate_id);
      if (!cand) continue;
      const sub = subById.get(cand.submission_id);
      const r = candidateRevenue(sub?.requested_checks, {
        isTldvInternal: !!cand.is_tldv_internal,
        isPtvsDiscount: !!cand.is_ptvs_discount,
      }, pm);
      gross += r.gross;
      discount += r.discount;
      candidateCount += 1;
    }
    return { gross, discount, net: gross - discount, candidateCount };
  }, [lines, ourCandidates, subById, pm]);

  const invoiceTotalNum = batch?.supplier_invoice_total != null ? Number(batch.supplier_invoice_total) : null;
  const effectiveCost = invoiceTotalNum ?? supplierCost;
  const profit = billing.net - effectiveCost;
  const margin = billing.net > 0 ? (profit / billing.net) * 100 : 0;

  // Reverse view: checks we submitted inside the batch period that the supplier
  // statement does not list.
  const missingOnStatement = useMemo(() => {
    const from = batch?.period_start ? new Date(batch.period_start + "T00:00:00").getTime() : null;
    const to = batch?.period_end ? new Date(batch.period_end + "T23:59:59").getTime() : null;
    const statementKeys = new Set(
      lines.map((l) => `${idKey(l.id_number)}|${l.check_key ?? ""}`),
    );
    const out: { candidate: OurCandidate; sub: OurSubmission; checkKey: string }[] = [];
    for (const c of ourCandidates) {
      const sub = subById.get(c.submission_id);
      if (!sub) continue;
      const ts = new Date(sub.created_at).getTime();
      if (from !== null && ts < from) continue;
      if (to !== null && ts > to) continue;
      const requested = (sub.requested_checks?.length ? sub.requested_checks : ["id_verification", "risk_assessment"])
        .filter((k) => CHECK_PRICE_KEYS.includes(k));
      for (const k of requested) {
        if (!statementKeys.has(`${idKey(c.id_number)}|${k}`)) out.push({ candidate: c, sub, checkKey: k });
      }
    }
    return out;
  }, [ourCandidates, subById, lines, batch]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (filter === "matched" && l.match_status !== "matched") return false;
      if (filter === "unmatched" && l.match_status === "matched") return false;
      if (!q) return true;
      return `${l.full_name ?? ""} ${l.id_number ?? ""} ${l.internal_order_number ?? ""}`.toLowerCase().includes(q);
    });
  }, [lines, filter, search]);

  const [rematching, setRematching] = useState(false);
  const rematch = async () => {
    setRematching(true);
    try {
      const candByIdNumber = new Map<string, OurCandidate[]>();
      for (const c of ourCandidates) {
        const k = idKey(c.id_number);
        if (!k) continue;
        if (!candByIdNumber.has(k)) candByIdNumber.set(k, []);
        candByIdNumber.get(k)!.push(c);
      }
      const candByName = buildNameIndex(ourCandidates);
      let changed = 0;
      for (const l of lines) {
        const key = l.check_key ?? supplierTitleToCheckKey(l.check_title);
        const { match, status } = resolveMatch(l, key, candByIdNumber, candByName, subById);
        if (status === l.match_status && (match?.id ?? null) === l.matched_candidate_id && key === l.check_key) continue;
        const { error } = await sb.from("manual_risk_supplier_lines" as any)
          .update({
            check_key: key,
            matched_candidate_id: match?.id ?? null,
            matched_submission_id: match?.submission_id ?? null,
            match_status: status,
          } as any)
          .eq("id", l.id);
        if (error) throw error;
        changed += 1;
      }
      toast.success(changed ? `Re-matched ${changed} line(s)` : "No changes — everything already matched");
      qc.invalidateQueries({ queryKey: ["mra-supplier-lines", batchId] });
    } catch (e: any) {
      toast.error(e.message ?? "Re-match failed");
    } finally {
      setRematching(false);
    }
  };

  const saveInvoice = async () => {
    setSavingInv(true);
    const { error } = await sb.from("manual_risk_supplier_batches" as any)
      .update({
        supplier_invoice_number: invNumber.trim() || null,
        supplier_invoice_total: invTotal ? parseFloat(invTotal) : null,
      })
      .eq("id", batchId);
    setSavingInv(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Batch invoice details saved");
    qc.invalidateQueries({ queryKey: ["mra-supplier-batches"] });
  };

  const exportRecon = () => {
    const wsData = [
      ["Enquiry no", "Supplier created", "Order number", "Full name", "ID number", "Check title", "Check status", "Check result", "Reconciliation", "Our order #", "Supplier cost (R)"],
      ...lines.map((l) => [
        l.enquiry_no ?? "",
        l.supplier_created_at ? new Date(l.supplier_created_at).toLocaleString() : "",
        l.internal_order_number ?? "",
        l.full_name ?? "",
        l.id_number ?? "",
        l.check_title ?? "",
        l.check_status ?? "",
        l.check_result ?? "",
        l.match_status === "matched" ? "Matched" : l.match_status === "check_not_requested" ? "Check not requested" : "Not on system",
        l.matched_submission_id ? subById.get(l.matched_submission_id)?.order_number ?? "" : "",
        l.check_key ? pm.get(l.check_key)?.supplier_cost ?? 0 : 0,
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "Reconciliation");
    const missing = [
      ["Order #", "First name", "Surname", "ID number", "Check", "Submitted"],
      ...missingOnStatement.map((m) => [
        m.sub.order_number, m.candidate.first_name, m.candidate.surname, m.candidate.id_number,
        checkLabel(m.checkKey), new Date(m.sub.created_at).toLocaleDateString(),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(missing), "Not on statement");
    XLSX.writeFile(wb, `${(batch?.name ?? "batch").replace(/[^a-z0-9]+/gi, "_")}_Reconciliation.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back to batches</Button>
        <h3 className="font-semibold">{batch?.name ?? "Statement batch"}</h3>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={rematch} disabled={rematching || !lines.length}>
          {rematching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Re-match lines
        </Button>
        <Button size="sm" variant="outline" onClick={exportRecon}><Download className="h-4 w-4 mr-2" /> Export</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Statement lines</p>
          <p className="text-2xl font-bold">{counts.total}</p>
          <p className="text-xs text-emerald-600">{counts.matched} matched</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Unaccounted for</p>
          <p className="text-2xl font-bold text-destructive">{counts.notOnSystem + counts.notRequested}</p>
          <p className="text-xs text-muted-foreground">{counts.notOnSystem} not on system · {counts.notRequested} not requested</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Not on statement</p>
          <p className="text-2xl font-bold">{missingOnStatement.length}</p>
          <p className="text-xs text-muted-foreground">our checks in this period</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Gross profit</p>
          <p className={`text-2xl font-bold ${profit < 0 ? "text-destructive" : "text-emerald-600"}`}>{money(profit)}</p>
          <p className="text-xs text-muted-foreground">{margin.toFixed(1)}% margin</p>
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="font-semibold mb-3">Batch profitability</h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Supplier cost (from price list)</span><span>{money(supplierCost)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Supplier invoice total (entered)</span><span>{invoiceTotalNum != null ? money(invoiceTotalNum) : "—"}</span></div>
            {invoiceTotalNum != null && Math.abs(invoiceTotalNum - supplierCost) > 0.009 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                <AlertTriangle className="h-4 w-4" />
                Difference of {money(Math.abs(invoiceTotalNum - supplierCost))} between the invoice total and the calculated cost.
              </div>
            )}
            <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Client billing (gross)</span><span>{money(billing.gross)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discounts (TLDV / PTVS)</span><span className="text-amber-700">-{money(billing.discount)}</span></div>
            <div className="flex justify-between font-medium"><span>Client billing (net)</span><span>{money(billing.net)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Gross profit</span>
              <span className={profit < 0 ? "text-destructive" : "text-emerald-600"}>{money(profit)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{billing.candidateCount} candidate(s) billed from this statement.</p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier invoice #</Label>
                <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} />
              </div>
              <div>
                <Label>Supplier invoice total (R)</Label>
                <Input type="number" step="0.01" value={invTotal} onChange={(e) => setInvTotal(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={saveInvoice} disabled={savingInv}>
              {savingInv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save invoice details
            </Button>
            {batch?.notes && <p className="text-xs text-muted-foreground pt-2">{batch.notes}</p>}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <Label className="text-xs">Show</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lines</SelectItem>
                <SelectItem value="unmatched">Unmatched only</SelectItem>
                <SelectItem value="matched">Matched only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <Input className="h-9" placeholder="Name, ID number or order number…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enquiry</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Supplier order ref</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reconciliation</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLines.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No lines to show.</TableCell></TableRow>
                ) : visibleLines.map((l) => (
                  <TableRow
                    key={l.id}
                    className={
                      l.match_status === "not_on_system"
                        ? "bg-red-50 hover:bg-red-100"
                        : l.match_status === "check_not_requested"
                          ? "bg-amber-50 hover:bg-amber-100"
                          : undefined
                    }
                  >
                    <TableCell className="text-xs">{l.enquiry_no ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.supplier_created_at ? new Date(l.supplier_created_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-xs">{l.internal_order_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{l.full_name ?? "—"}</TableCell>
                    <TableCell>{l.id_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.check_title ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.check_result ?? l.check_status ?? "—"}</TableCell>
                    <TableCell>{statusBadge(l.match_status)}</TableCell>
                    <TableCell className="text-right text-xs">
                      {l.check_key ? money(pm.get(l.check_key)?.supplier_cost ?? 0) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold mb-1">Our checks not on this statement</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Checks we submitted between the batch period dates that do not appear on the supplier statement.
        </p>
        {missingOnStatement.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">Everything we submitted in this period appears on the statement.</p>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>Check</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingOnStatement.map((m, i) => (
                  <TableRow key={`${m.candidate.id}-${m.checkKey}-${i}`}>
                    <TableCell className="text-xs">{m.sub.order_number}</TableCell>
                    <TableCell>{m.candidate.first_name} {m.candidate.surname}</TableCell>
                    <TableCell>{m.candidate.id_number}</TableCell>
                    <TableCell className="text-xs">{checkLabel(m.checkKey)}</TableCell>
                    <TableCell className="text-xs">{new Date(m.sub.created_at).toLocaleDateString()}</TableCell>
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
