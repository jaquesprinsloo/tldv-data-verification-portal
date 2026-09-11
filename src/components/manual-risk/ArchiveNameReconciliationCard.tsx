import { useMemo, useState } from "react";
import { supabase as sb } from "@/integrations/supabase/client";
import { useArchiveCandidates } from "@/lib/archiveCandidatesQuery";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, UserPlus, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { UnmatchedReportName } from "@/lib/archiveNameReconciliation";

type OrderLite = {
  id: string;
  order_number: string;
  client_id: string | null;
  created_at: string;
  archive_batch_label?: string | null;
};

type ClientLite = { id: string; client_name: string };

type FoundRecord = {
  id: string;
  first_name: string | null;
  surname: string | null;
  id_number: string | null;
  submission_id: string;
  order_number: string;
  client_name: string;
  is_archive: boolean;
  created_at: string;
};

/**
 * Two lists side by side:
 *  - people named on the original reports who are not in the archive at all, and
 *  - archive people no report has confirmed yet.
 * A name in the first list can be investigated against everything on record and
 * then added straight onto an order, so it becomes searchable.
 */
export function ArchiveNameReconciliationCard({
  submissions, clients, onChanged,
}: {
  submissions: OrderLite[];
  clients: ClientLite[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [orderSearch, setOrderSearch] = useState("");
  const [investigating, setInvestigating] = useState<UnmatchedReportName | null>(null);
  const [found, setFound] = useState<FoundRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<UnmatchedReportName | null>(null);
  const [form, setForm] = useState({ orderId: "", firstName: "", surname: "", idNumber: "" });
  const [saving, setSaving] = useState(false);
  const [showOutstanding, setShowOutstanding] = useState(false);

  const clientName = (id: string | null) =>
    (id ? clients.find((c) => c.id === id)?.client_name ?? "—" : "—");
  const orderLabel = (id: string | null) => {
    if (!id) return "—";
    const s = submissions.find((x) => x.id === id);
    if (!s) return "Unknown order";
    return `${clientName(s.client_id)} — ${new Date(s.created_at).toLocaleDateString()} (${s.order_number})`;
  };

  // ---- names on reports but not in the archive ----
  const { data: pending = [], refetch: refetchPending } = useQuery<UnmatchedReportName[]>({
    queryKey: ["mra-archive-unmatched-names"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_report_unmatched_names")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as UnmatchedReportName[];
    },
  });

  // ---- archive people not yet confirmed by any report ----
  // One shared read of the archive people, grouped per order in the browser,
  // instead of dozens of separate database requests.
  const { data: archiveCands = [], refetch: refetchOutstanding } = useArchiveCandidates();

  const outstanding = useMemo(() => {
    const byOrder = new Map<string, string[]>();
    for (const r of archiveCands) {
      if (r.report_matched_at) continue;
      const label = `${r.first_name ?? ""} ${r.surname ?? ""}`.trim() || "(no name)";
      byOrder.set(r.submission_id, [...(byOrder.get(r.submission_id) ?? []), `${label} — ${r.id_number ?? "?"}`]);
    }
    return Array.from(byOrder.entries())
      .map(([submission_id, names]) => ({ submission_id, names }))
      .sort((a, b) => b.names.length - a.names.length);
  }, [archiveCands]);

  const outstandingTotal = outstanding.reduce((n, o) => n + o.names.length, 0);

  /** Opens the original report this name was read from, in a new window. */
  const openReport = async (row: UnmatchedReportName) => {
    try {
      // Prefer the order the report was linked to; otherwise find the order
      // carrying this exact report file name.
      let q = sb
        .from("manual_risk_submissions")
        .select("archive_report_path")
        .not("archive_report_path", "is", null);
      if (row.linked_submission_id) q = q.eq("id", row.linked_submission_id);
      else q = q.eq("archive_report_name", row.report_file_name);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      const path = (data as any)?.archive_report_path as string | undefined;
      if (!path) {
        // Fall back to a name search when the linked order had no report path.
        if (row.linked_submission_id) return openReport({ ...row, linked_submission_id: null });
        toast.error("The report file could not be found on record");
        return;
      }
      const { data: signed, error: sErr } = await sb.storage.from("archive-reports").createSignedUrl(path, 300);
      if (sErr || !signed) throw sErr ?? new Error("Could not open the report");
      window.open(signed.signedUrl, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open the report");
    }
  };

  /** Everything on record for this person, archive or live. */
  const investigate = async (row: UnmatchedReportName) => {
    setInvestigating(row);
    setFound(null);
    setSearching(true);
    // Open the report the name was read from alongside the search.
    openReport(row);
    try {
      const hits = new Map<string, FoundRecord>();
      const collect = async (q: any) => {
        const { data, error } = await q.limit(60);
        if (error) throw error;
        for (const r of (data ?? []) as any[]) {
          hits.set(r.id, {
            id: r.id,
            first_name: r.first_name,
            surname: r.surname,
            id_number: r.id_number,
            submission_id: r.submission_id,
            order_number: r.manual_risk_submissions?.order_number ?? "—",
            client_name: clientName(r.manual_risk_submissions?.client_id ?? null),
            is_archive: !!r.manual_risk_submissions?.is_archive,
            created_at: r.manual_risk_submissions?.created_at ?? r.created_at,
          });
        }
      };
      const base = () =>
        sb.from("manual_risk_candidates")
          .select("id, first_name, surname, id_number, submission_id, created_at, manual_risk_submissions(order_number, client_id, is_archive, created_at)");

      if (row.surname) await collect(base().ilike("surname", `%${row.surname.trim()}%`));
      if (row.first_names) await collect(base().ilike("first_name", `%${row.first_names.trim().split(/\s+/)[0]}%`));
      if (row.id_prefix && row.id_prefix.replace(/\D/g, "").length >= 6) {
        await collect(base().like("id_number", `${row.id_prefix.replace(/\D/g, "").slice(0, 6)}%`));
      }
      setFound(Array.from(hits.values()));
    } catch (e: any) {
      toast.error(e.message ?? "Could not search the records");
      setFound([]);
    } finally {
      setSearching(false);
    }
  };

  const openAdd = (row: UnmatchedReportName) => {
    setAdding(row);
    setForm({
      orderId: row.linked_submission_id ?? "",
      firstName: row.first_names ?? "",
      surname: row.surname ?? "",
      idNumber: "",
    });
    setOrderSearch("");
  };

  const orderOptions = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const sorted = [...submissions].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const filtered = q
      ? sorted.filter((s) =>
          `${s.order_number} ${s.archive_batch_label ?? ""} ${clientName(s.client_id)} ${new Date(s.created_at).toLocaleDateString()}`
            .toLowerCase().includes(q))
      : sorted;
    return filtered.slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, orderSearch, clients]);

  const addToArchive = async () => {
    if (!adding) return;
    if (!form.orderId) { toast.error("Pick the order this person belongs to"); return; }
    if (!form.surname.trim()) { toast.error("A surname is needed"); return; }
    const id = form.idNumber.replace(/\D/g, "");
    if (id && id.length !== 13) { toast.error("An ID number must be 13 digits"); return; }
    setSaving(true);
    try {
      const { count } = await sb
        .from("manual_risk_candidates")
        .select("id", { count: "exact", head: true })
        .eq("submission_id", form.orderId);

      const { data, error } = await sb
        .from("manual_risk_candidates")
        .insert({
          submission_id: form.orderId,
          first_name: form.firstName.trim(),
          surname: form.surname.trim(),
          id_number: id || "0000000000000",
          sort_order: (count ?? 0) + 1,
          report_matched_at: new Date().toISOString(),
          report_matched_file: adding.report_file_name,
        } as never)
        .select("id")
        .single();
      if (error) throw error;

      const { error: uErr } = await sb
        .from("manual_risk_report_unmatched_names")
        .update({
          status: "added",
          resolved_candidate_id: (data as any).id,
          resolved_at: new Date().toISOString(),
        } as never)
        .eq("id", adding.id);
      if (uErr) throw uErr;

      toast.success(`${form.firstName} ${form.surname} added to ${orderLabel(form.orderId)}`);
      setAdding(null);
      refetchPending();
      refetchOutstanding();
      qc.invalidateQueries({ queryKey: ["mra-archive-submissions"] });
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Could not add this person");
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async (row: UnmatchedReportName) => {
    const { error } = await sb
      .from("manual_risk_report_unmatched_names")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    refetchPending();
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Name reconciliation
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          People found on the original reports who are not in the archive, and archive people no report has confirmed yet.
          A name drops off the second list the moment a report naming that person is read.
        </p>
      </div>

      {/* --- on reports, not in the archive --- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            On a report but not in the archive
            <Badge variant="outline" className="ml-2">{pending.length}</Badge>
          </h4>
        </div>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Nothing outstanding.
          </p>
        ) : (
          <div className="max-h-80 overflow-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">ID (first 6)</TableHead>
                  <TableHead className="text-xs">Report</TableHead>
                  <TableHead className="text-xs">Linked order</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.id} className="text-xs">
                    <TableCell className="font-medium">{row.full_name}</TableCell>
                    <TableCell>{row.id_prefix ?? "—"}</TableCell>
                    <TableCell>
                      <div>{row.report_file_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.report_date ? new Date(row.report_date).toLocaleDateString() : ""} {row.store_label ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>{orderLabel(row.linked_submission_id)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => investigate(row)}>
                          <Search className="h-3 w-3 mr-1" /> Investigate
                        </Button>
                        <Button size="sm" className="h-7 text-[11px] bg-red-600 hover:bg-red-700" onClick={() => openAdd(row)}>
                          <UserPlus className="h-3 w-3 mr-1" /> Add to archive
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => dismiss(row)}>
                          Dismiss
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* --- in the archive, no report yet --- */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            In the archive but not yet on any report
            <Badge variant="outline" className="ml-2">{outstandingTotal}</Badge>
          </h4>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowOutstanding((v) => !v)}>
            {showOutstanding ? "Hide" : "Show"} {outstanding.length} order(s)
          </Button>
        </div>
        {showOutstanding && (
          <div className="max-h-80 overflow-auto border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Order</TableHead>
                  <TableHead className="text-xs">People still waiting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((o) => (
                  <TableRow key={o.submission_id} className="text-xs align-top">
                    <TableCell className="font-medium">{orderLabel(o.submission_id)}</TableCell>
                    <TableCell>
                      <div className="mb-1"><Badge variant="outline">{o.names.length}</Badge></div>
                      <div className="text-[11px] text-muted-foreground">{o.names.join(" • ")}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* investigate dialog */}
      <Dialog open={!!investigating} onOpenChange={(o) => { if (!o) { setInvestigating(null); setFound(null); } }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{investigating?.full_name}</DialogTitle>
            <DialogDescription>
              Everything on record that could be this person — from the archive and from live submissions.
            </DialogDescription>
          </DialogHeader>
          {searching ? (
            <p className="text-sm text-muted-foreground">Searching the records…</p>
          ) : !found?.length ? (
            <p className="text-sm text-muted-foreground">No record of this person anywhere yet.</p>
          ) : (
            <div className="max-h-96 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">ID number</TableHead>
                    <TableHead className="text-xs">Account / order</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {found.map((f) => (
                    <TableRow key={f.id} className="text-xs">
                      <TableCell>{`${f.first_name ?? ""} ${f.surname ?? ""}`.trim()}</TableCell>
                      <TableCell>{f.id_number ?? "—"}</TableCell>
                      <TableCell>
                        {f.client_name} — {f.order_number}
                        <div className="text-[11px] text-muted-foreground">
                          {f.created_at ? new Date(f.created_at).toLocaleDateString() : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.is_archive ? "outline" : "secondary"}>
                          {f.is_archive ? "Archive" : "Live"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setInvestigating(null); setFound(null); }}>Close</Button>
            {investigating && (
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={() => { const r = investigating; setInvestigating(null); setFound(null); openAdd(r); }}
              >
                <UserPlus className="h-4 w-4 mr-1" /> Add to archive
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* add dialog */}
      <Dialog open={!!adding} onOpenChange={(o) => { if (!o) setAdding(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add {adding?.full_name} to the archive</DialogTitle>
            <DialogDescription>
              The person is placed on the order the report belongs to, so they can be found in searches.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name(s)</Label>
                <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Surname</Label>
                <Input value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">ID number (13 digits)</Label>
              <Input
                value={form.idNumber}
                placeholder={adding?.id_prefix ? `${adding.id_prefix}…` : "13 digits"}
                onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Order</Label>
              <Input
                className="mb-2"
                placeholder="Search by account, order number or date"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-auto border rounded divide-y">
                {orderOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, orderId: s.id }))}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted ${form.orderId === s.id ? "bg-muted font-medium" : ""}`}
                  >
                    {orderLabel(s.id)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={saving} onClick={addToArchive}>
              {saving ? "Adding…" : "Add to archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ArchiveNameReconciliationCard;
