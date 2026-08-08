import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { blobToBase64, isPlaceholderCandidate } from "@/lib/manualRiskPdf";
import { Eye, Upload, Trash2, Undo2, FileDown, ExternalLink, Receipt, Percent } from "lucide-react";

const sb = supabase as any;

export type InvoiceBatch = {
  id: string;
  client_id: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_file_path: string | null;
  invoice_file_name: string | null;
  invoice_onedrive_web_url: string | null;
  invoice_onedrive_item_id: string | null;
  invoice_onedrive_path: string | null;
  notes: string | null;
  created_at: string;
};

type BatchCand = {
  id: string;
  submission_id: string;
  invoice_batch_id: string | null;
  id_number: string;
  surname: string;
  first_name: string;
  is_tldv_internal: boolean | null;
  is_ptvs_discount: boolean | null;
};

export async function uploadInvoiceToOneDrive(
  file: File,
  clientName: string,
  invoiceNumber: string,
): Promise<{ webUrl: string | null; itemId: string | null; path: string | null }> {
  try {
    const base64 = await blobToBase64(file);
    const { data, error } = await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
      body: {
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type || "application/pdf",
        clientName,
        orderNumber: invoiceNumber,
        kind: "invoice",
      },
    });
    if (error) throw error;
    if ((data as any)?.success) {
      return {
        webUrl: (data as any).webUrl ?? null,
        itemId: (data as any).itemId ?? null,
        path: (data as any).fullPath ?? null,
      };
    }
    throw new Error((data as any)?.error || "OneDrive upload failed");
  } catch (e) {
    toast.warning(`Invoice saved, but the OneDrive copy failed: ${(e as Error).message}`);
    return { webUrl: null, itemId: null, path: null };
  }
}

export function MrInvoicedTab({
  clients,
  submissions,
  onChanged,
}: {
  clients: { id: string; client_name: string }[];
  submissions: { id: string; order_number: string; client_id: string | null; sent_at: string | null }[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [openAccountKey, setOpenAccountKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const subById = useMemo(() => new Map(submissions.map((s) => [s.id, s])), [submissions]);

  const { data: batches = [] } = useQuery<InvoiceBatch[]>({
    queryKey: ["mra-invoice-batches"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_invoice_batches")
        .select("*")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as InvoiceBatch[];
    },
  });

  const { data: invoicedCands = [] } = useQuery<BatchCand[]>({
    queryKey: ["mra-invoiced-cands"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_candidates")
        .select("id, submission_id, invoice_batch_id, id_number, surname, first_name, is_tldv_internal, is_ptvs_discount")
        .not("invoice_batch_id", "is", null);
      if (error) throw error;
      return (data as BatchCand[]).filter((c) => !isPlaceholderCandidate(c as any));
    },
  });

  const candsByBatch = useMemo(() => {
    const m = new Map<string, BatchCand[]>();
    for (const c of invoicedCands) {
      if (!c.invoice_batch_id) continue;
      if (!m.has(c.invoice_batch_id)) m.set(c.invoice_batch_id, []);
      m.get(c.invoice_batch_id)!.push(c);
    }
    return m;
  }, [invoicedCands]);

  const rows = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const q = search.trim().toLowerCase();
    return batches
      .filter((b) => {
        const ts = new Date(b.invoice_date + "T12:00:00").getTime();
        if (from !== null && ts < from) return false;
        if (to !== null && ts > to) return false;
        if (clientFilter && (b.client_id ?? "__unassigned__") !== clientFilter) return false;
        if (q) {
          const cands = candsByBatch.get(b.id) ?? [];
          const hit =
            b.invoice_number.toLowerCase().includes(q) ||
            cands.some((c) =>
              `${c.first_name} ${c.surname} ${c.id_number}`.toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .map((b) => {
        const cands = candsByBatch.get(b.id) ?? [];
        return {
          batch: b,
          clientName: b.client_id ? clientById.get(b.client_id)?.client_name ?? "Unknown" : "Unassigned",
          checks: cands.length,
          discounted: cands.filter((c) => c.is_tldv_internal || c.is_ptvs_discount).length,
          orders: Array.from(new Set(cands.map((c) => subById.get(c.submission_id)?.order_number).filter(Boolean))) as string[],
        };
      });
  }, [batches, candsByBatch, clientById, subById, fromDate, toDate, clientFilter, search]);

  // Mirror every account from the Accounts tab — even accounts with no invoiced
  // checks yet. Invoicing a check simply moves it from the Accounts tab into the
  // same account here, so nothing is duplicated.
  const accounts = useMemo(() => {
    const keys = new Set<string>();
    for (const s of submissions) keys.add(s.client_id ?? "__unassigned__");
    for (const b of batches) keys.add(b.client_id ?? "__unassigned__");
    const searching = search.trim().length > 0;
    return Array.from(keys)
      .map((key) => {
        const brs = rows.filter((r) => (r.batch.client_id ?? "__unassigned__") === key);
        return {
          key,
          name: key === "__unassigned__" ? "Unassigned" : clientById.get(key)?.client_name ?? "Unknown",
          batchRows: brs,
          checks: brs.reduce((n, r) => n + r.checks, 0),
          discounted: brs.reduce((n, r) => n + r.discounted, 0),
        };
      })
      .filter((a) => (clientFilter ? a.key === clientFilter : true))
      .filter((a) => (searching ? a.batchRows.length > 0 : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions, batches, rows, clientById, clientFilter, search]);

  const viewFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const attachInvoiceFile = async (batch: InvoiceBatch, file: File, clientName: string) => {
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `manual-risk/${batch.client_id ?? "unassigned"}/${batch.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, {
        contentType: file.type || "application/pdf", upsert: false,
      });
      if (upErr) throw upErr;
      // Remove the previous storage copy + OneDrive copy so we never duplicate.
      if (batch.invoice_file_path) {
        await supabase.storage.from("invoices").remove([batch.invoice_file_path]);
      }
      if (batch.invoice_onedrive_item_id) {
        await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
          body: { action: "delete", itemId: batch.invoice_onedrive_item_id },
        });
      }
      const od = await uploadInvoiceToOneDrive(file, clientName, batch.invoice_number);
      const { error } = await sb.from("manual_risk_invoice_batches").update({
        invoice_file_path: path,
        invoice_file_name: file.name,
        invoice_onedrive_web_url: od.webUrl,
        invoice_onedrive_item_id: od.itemId,
        invoice_onedrive_path: od.path,
      }).eq("id", batch.id);
      if (error) throw error;
      toast.success("Invoice attached");
      qc.invalidateQueries({ queryKey: ["mra-invoice-batches"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unInvoiceBatch = async (batch: InvoiceBatch, keepFile: boolean) => {
    if (!confirm(`Move the checks on invoice ${batch.invoice_number} back to the account tab?`)) return;
    setBusy(true);
    try {
      const { error: cErr } = await sb.from("manual_risk_candidates")
        .update({ invoice_batch_id: null })
        .eq("invoice_batch_id", batch.id);
      if (cErr) throw cErr;
      if (!keepFile) {
        if (batch.invoice_file_path) {
          await supabase.storage.from("invoices").remove([batch.invoice_file_path]);
        }
        if (batch.invoice_onedrive_item_id) {
          await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
            body: { action: "delete", itemId: batch.invoice_onedrive_item_id },
          });
        }
        const { error } = await sb.from("manual_risk_invoice_batches").delete().eq("id", batch.id);
        if (error) throw error;
      }
      toast.success("Checks moved back to the account");
      setOpenBatchId(null);
      qc.invalidateQueries({ queryKey: ["mra-invoice-batches"] });
      qc.invalidateQueries({ queryKey: ["mra-invoiced-cands"] });
      qc.invalidateQueries({ queryKey: ["mra-accounts-all-cands"] });
      qc.invalidateQueries({ queryKey: ["mra-dashboard-cands"] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportBatch = (batch: InvoiceBatch, clientName: string) => {
    const cands = candsByBatch.get(batch.id) ?? [];
    const wsData = [
      ["Invoice #", "Invoice Date", "Client", "Order #", "First Name", "Surname", "ID Number", "Discount"],
      ...cands.map((c) => [
        batch.invoice_number,
        batch.invoice_date,
        clientName,
        subById.get(c.submission_id)?.order_number ?? "",
        c.first_name,
        c.surname,
        c.id_number,
        c.is_tldv_internal ? "100% (TLDV internal)" : c.is_ptvs_discount ? "PTVS discount" : "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoiced");
    XLSX.writeFile(wb, `Invoice_${batch.invoice_number.replace(/[^a-z0-9]+/gi, "_")}.xlsx`);
  };

  const openBatch = rows.find((r) => r.batch.id === openBatchId) ?? null;

  const totalInvoiced = rows.reduce((n, r) => n + r.checks, 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex items-center gap-2 mr-2">
          <Receipt className="h-5 w-5 text-red-600" />
          <span className="font-semibold">Invoiced checks</span>
        </div>
        <div>
          <Label className="text-xs">From (invoice date)</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
        </div>
        <div>
          <Label className="text-xs">Client</Label>
          <select
            className="h-8 w-56 border rounded-md px-2 text-sm bg-background"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="">All clients</option>
            <option value="__unassigned__">Unassigned</option>
            {[...clients].sort((a, b) => a.client_name.localeCompare(b.client_name)).map((c) => (
              <option key={c.id} value={c.id}>{c.client_name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Search (invoice #, candidate, ID)</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" placeholder="Search…" />
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        {accounts.length} account(s) • {rows.length} invoice batch(es) • {totalInvoiced} invoiced check(s).
        Accounts mirror the Accounts tab and stay listed even when nothing has been invoiced yet.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-center">Invoiced checks</TableHead>
              <TableHead className="text-center">Discounted</TableHead>
              <TableHead className="text-center">Invoice batches</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No accounts yet. Once a submission is sent its client account appears here.
                </TableCell>
              </TableRow>
            )}
            {accounts.map((a) => (
              <TableRow key={a.key} className={a.checks === 0 ? "text-muted-foreground" : undefined}>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-center">{a.checks}</TableCell>
                <TableCell className="text-center">
                  {a.discounted
                    ? <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{a.discounted} discounted</Badge>
                    : <span className="text-xs">—</span>}
                </TableCell>
                <TableCell className="text-center">{a.batchRows.length}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={a.batchRows.length === 0}
                    onClick={() => setOpenAccountKey(a.key)}
                  >
                    {a.batchRows.length === 0 ? "Empty" : "Open account"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {openAccountKey && (() => {
        const acc = accounts.find((a) => a.key === openAccountKey);
        if (!acc) return null;
        return (
          <Dialog open onOpenChange={(v) => !v && setOpenAccountKey(null)}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{acc.name} — invoiced checks</DialogTitle>
                <DialogDescription>
                  {acc.checks} invoiced check(s) across {acc.batchRows.length} invoice batch(es)
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Invoice date</TableHead>
                      <TableHead className="text-center">Checks</TableHead>
                      <TableHead className="text-center">Discounted</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Attachment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acc.batchRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nothing invoiced for this account yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {acc.batchRows.map((r) => (
                      <TableRow key={r.batch.id}>
                        <TableCell className="font-mono text-xs">{r.batch.invoice_number}</TableCell>
                        <TableCell className="text-xs">{new Date(r.batch.invoice_date + "T12:00:00").toLocaleDateString()}</TableCell>
                        <TableCell className="text-center">{r.checks}</TableCell>
                        <TableCell className="text-center">
                          {r.discounted ? <Badge className="bg-amber-500 text-white">{r.discounted}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate" title={r.orders.join(", ")}>
                          {r.orders.join(", ") || "—"}
                        </TableCell>
                        <TableCell>
                          {r.batch.invoice_file_path ? (
                            <div className="flex items-center gap-1">
                              <Badge className="bg-emerald-600">Attached</Badge>
                              <Button variant="ghost" size="icon" title="View invoice" onClick={() => viewFile(r.batch.invoice_file_path!)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              {r.batch.invoice_onedrive_web_url && (
                                <Button variant="ghost" size="icon" title="Open in OneDrive" onClick={() => window.open(r.batch.invoice_onedrive_web_url!, "_blank")}>
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="border-amber-500 text-amber-700">No file</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setOpenBatchId(r.batch.id)}>Open</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenAccountKey(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {openBatch && (
        <Dialog open onOpenChange={(v) => !v && setOpenBatchId(null)}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice {openBatch.batch.invoice_number} — {openBatch.clientName}</DialogTitle>
              <DialogDescription>
                {openBatch.checks} check(s) invoiced on {new Date(openBatch.batch.invoice_date + "T12:00:00").toLocaleDateString()}
                {openBatch.batch.invoice_onedrive_path ? ` • OneDrive: ${openBatch.batch.invoice_onedrive_path}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              {openBatch.batch.invoice_file_path ? (
                <Button variant="outline" size="sm" onClick={() => viewFile(openBatch.batch.invoice_file_path!)}>
                  <Eye className="h-4 w-4 mr-2" /> View invoice ({openBatch.batch.invoice_file_name ?? "file"})
                </Button>
              ) : null}
              {openBatch.batch.invoice_onedrive_web_url && (
                <Button variant="outline" size="sm" onClick={() => window.open(openBatch.batch.invoice_onedrive_web_url!, "_blank")}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Open in OneDrive
                </Button>
              )}
              <label className="inline-flex">
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attachInvoiceFile(openBatch.batch, f, openBatch.clientName);
                    e.currentTarget.value = "";
                  }}
                />
                <Button variant="outline" size="sm" asChild disabled={busy}>
                  <span className="cursor-pointer inline-flex items-center">
                    <Upload className="h-4 w-4 mr-2" />
                    {openBatch.batch.invoice_file_path ? "Replace invoice file" : "Attach invoice file"}
                  </span>
                </Button>
              </label>
              <Button variant="outline" size="sm" onClick={() => exportBatch(openBatch.batch, openBatch.clientName)}>
                <FileDown className="h-4 w-4 mr-2" /> Export list
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="border-amber-600 text-amber-700 hover:bg-amber-50"
                disabled={busy}
                onClick={() => unInvoiceBatch(openBatch.batch, true)}
                title="Return checks to the account but keep this invoice record"
              >
                <Undo2 className="h-4 w-4 mr-2" /> Un-invoice checks
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-600 text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => unInvoiceBatch(openBatch.batch, false)}
                title="Delete this invoice batch (file + OneDrive copy) and return the checks"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete batch
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Discount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(candsByBatch.get(openBatch.batch.id) ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{subById.get(c.submission_id)?.order_number ?? "—"}</TableCell>
                      <TableCell>{c.surname}, {c.first_name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.id_number}</TableCell>
                      <TableCell>
                        {c.is_tldv_internal && <Badge className="bg-blue-600 gap-1"><Percent className="h-3 w-3" /> 100%</Badge>}
                        {c.is_ptvs_discount && <Badge className="bg-amber-500 text-white gap-1 ml-1"><Percent className="h-3 w-3" /> PTVS</Badge>}
                        {!c.is_tldv_internal && !c.is_ptvs_discount && <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenBatchId(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
