import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Inbox, Loader2, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { blobToBase64Client } from "./intakeClientUtils";
import {
  buildCsiRows, buildOrderNumberBase, CSI_HEADERS, CSI_INSTRUCTION,
  CSI_LICENSE_NOTE, CSI_QUALIFICATION_NOTE, CSI_SOCIAL_NOTE,
} from "./intakeLogic";

const sb = supabase as any;
const INDEMNITY_BUCKET = "manual-risk-indemnities";

type IndemnityMeta = {
  name: string; path: string; uploaded_at?: string;
  onedrive_web_url?: string | null; onedrive_item_id?: string | null;
  shared_onedrive_web_url?: string | null; shared_onedrive_item_id?: string | null;
  [key: string]: any;
};

type IntakeRow = {
  id: string; order_number: string; client_id: string | null;
  submission_type: string; submitter_name: string; submitter_email: string;
  submitter_phone: string | null; consent_confirmed_at: string;
  indemnity_files: IndemnityMeta[] | null; notes: string | null;
  status: string; created_at: string;
};

type IntakeCandidateRow = {
  id: string; intake_id: string; first_name: string; surname: string;
  id_number: string; gender: string | null; date_of_birth: string | null; sort_order: number;
};

export default function IntakeTab({ clients, userId }: { clients: any[]; userId: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [cands, setCands] = useState<Record<string, IntakeCandidateRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const clientName = useCallback(
    (id: string | null) => clients.find((c) => c.id === id)?.client_name ?? "Unassigned",
    [clients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: intakes, error } = await sb
        .from("manual_risk_intakes").select("*").eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (intakes ?? []) as IntakeRow[];
      setRows(list);
      if (list.length) {
        const { data: cRows, error: cErr } = await sb
          .from("manual_risk_intake_candidates").select("*")
          .in("intake_id", list.map((r) => r.id))
          .order("sort_order");
        if (cErr) throw cErr;
        const grouped: Record<string, IntakeCandidateRow[]> = {};
        for (const c of (cRows ?? []) as IntakeCandidateRow[]) {
          (grouped[c.intake_id] ??= []).push(c);
        }
        setCands(grouped);
      } else {
        setCands({});
      }
    } catch (e) {
      toast.error(`Could not load intake requests: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const pendingCount = rows.length;

  const downloadCsi = (row: IntakeRow) => {
    const candidates = cands[row.id] ?? [];
    const aoa: (string | undefined)[][] = [
      [CSI_INSTRUCTION, "", "", "", "", CSI_QUALIFICATION_NOTE, "", "", "", "", "", CSI_SOCIAL_NOTE, "", "", "", "", "", CSI_LICENSE_NOTE],
      [], // spacer row (template row 2 in xlsx terms: blank)
      [...CSI_HEADERS],
      ...buildCsiRows(candidates),
    ];
    // Remove the blank spacer: template row 1 = instruction, row 2 = headers.
    aoa.splice(1, 1);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Supplier reads ID numbers as text so leading zeros survive.
    for (let r = 2; r <= 2 + candidates.length - 1; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell) cell.t = "s";
    }
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const out = XLSX.write(wb, { bookType: "xls", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CSI ${row.order_number}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mirrorIndemnitiesToOneDrive = async (submissionId: string, orderNumber: string, files: IndemnityMeta[], clientNameValue: string) => {
    const updated = [...files];
    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      try {
        const { data: blobData, error: dlErr } = await sb.storage.from(INDEMNITY_BUCKET).download(f.path);
        if (dlErr) throw dlErr;
        const base64 = await blobToBase64Client(blobData);
        for (const shared of [false, true]) {
          if (shared ? updated[i].shared_onedrive_web_url : updated[i].onedrive_web_url) continue;
          const { data, error } = await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
            body: {
              fileName: f.name, fileBase64: base64,
              contentType: f.content_type || "application/pdf",
              clientName: clientNameValue, orderNumber, kind: "indemnity", shared,
            },
          });
          if (error) throw error;
          if ((data as any)?.success) {
            if (shared) {
              updated[i] = { ...updated[i], shared_onedrive_web_url: (data as any).webUrl ?? null, shared_onedrive_item_id: (data as any).itemId ?? null };
            } else {
              updated[i] = { ...updated[i], onedrive_web_url: (data as any).webUrl ?? null, onedrive_item_id: (data as any).itemId ?? null };
            }
          } else {
            throw new Error((data as any)?.error || "OneDrive upload failed");
          }
        }
      } catch (e) {
        toast.warning(`OneDrive copy of "${f.name}" failed: ${(e as Error).message}`);
      }
    }
    await sb.from("manual_risk_submissions").update({ indemnity_files: updated }).eq("id", submissionId);
    return updated;
  };

  const processIntake = async (row: IntakeRow) => {
    const candidates = cands[row.id] ?? [];
    if (!candidates.length) { toast.error("This request has no candidates"); return; }
    if (!confirm(`Process request ${row.order_number}?\n\nThis creates the order under "${clientName(row.client_id)}" with ID Verification + Risk Assessment, notifies ${row.submitter_email}, and moves it to the Submissions tab.`)) return;
    setBusyId(row.id);
    try {
      const { data: sub, error: subErr } = await sb.from("manual_risk_submissions")
        .insert({
          order_number: row.order_number,
          client_id: row.client_id,
          submission_type: row.submission_type,
          status: "open",
          requested_checks: ["id_verification", "risk_assessment"],
          created_by: userId,
          recipients: [{ name: row.submitter_name, email: row.submitter_email, primary: true }],
          indemnity_files: row.indemnity_files ?? [],
          notes: row.notes,
        })
        .select("id").single();
      if (subErr) throw subErr;

      const { error: candErr } = await sb.from("manual_risk_candidates").insert(
        candidates.map((c, idx) => ({
          submission_id: sub.id,
          id_number: c.id_number,
          surname: c.surname,
          first_name: c.first_name,
          gender: c.gender,
          date_of_birth: c.date_of_birth,
          sort_order: idx,
        })),
      );
      if (candErr) throw candErr;

      if (row.indemnity_files?.length) {
        await mirrorIndemnitiesToOneDrive(sub.id, row.order_number, row.indemnity_files, clientName(row.client_id));
      }

      const { error: upErr } = await sb.from("manual_risk_intakes")
        .update({ status: "processed", processed_at: new Date().toISOString(), processed_submission_id: sub.id })
        .eq("id", row.id);
      if (upErr) throw upErr;

      const { error: mailErr } = await supabase.functions.invoke("send-intake-processed", {
        body: {
          to: row.submitter_email,
          orderNumber: row.order_number,
          clientName: clientName(row.client_id),
          contactName: row.submitter_name,
        },
      });
      if (mailErr) {
        toast.error(`Order created, but the "processed" email failed: ${mailErr.message}`);
      } else {
        toast.success(`${row.order_number} is now in the Submissions tab — ${row.submitter_email} has been notified.`);
      }

      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      await load();
    } catch (e) {
      toast.error(`Processing failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const discardIntake = async (row: IntakeRow) => {
    if (!confirm(`Discard request ${row.order_number}? This permanently removes the request, its candidates and the uploaded documents.`)) return;
    setBusyId(row.id);
    try {
      const paths = (row.indemnity_files ?? []).map((f) => f.path).filter(Boolean);
      if (paths.length) {
        const { error: rmErr } = await sb.storage.from(INDEMNITY_BUCKET).remove(paths);
        if (rmErr) toast.warning(`Some documents could not be removed from storage: ${rmErr.message}`);
      }
      const { error } = await sb.from("manual_risk_intakes").delete().eq("id", row.id);
      if (error) throw error;
      toast.success(`${row.order_number} discarded`);
      await load();
    } catch (e) {
      toast.error(`Discard failed: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  };

  const openIndemnity = async (path: string) => {
    try {
      const { data, error } = await sb.storage.from(INDEMNITY_BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("No signed URL");
      window.open(data.signedUrl, "_blank");
    } catch (e) {
      toast.error(`Could not open document: ${(e as Error).message}`);
    }
  };

  const todayBase = useMemo(() => buildOrderNumberBase("Cash Crusaders", new Date()).replace(/^CC Cash Crusaders/, "CC"), []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-5 w-5 text-red-600" />
              External Requests
              {pendingCount > 0 && (
                <Badge className="bg-red-600 text-white">{pendingCount} awaiting processing</Badge>
              )}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Submissions captured by store staff on the public request page. Download the supplier sheet, place the order, then click Process — today's numbering starts at <span className="font-mono">{todayBase}</span>.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading requests…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              No external requests are waiting. New submissions from the request page will appear here automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Store / Account</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead>Candidates</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const candidates = cands[row.id] ?? [];
                    const open = expanded === row.id;
                    return (
                      <TableRow key={row.id} className="align-top">
                        <TableCell>
                          <button onClick={() => setExpanded(open ? null : row.id)} className="p-1 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label={open ? "Collapse" : "Expand"}>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{row.order_number}</TableCell>
                        <TableCell className="whitespace-nowrap">{clientName(row.client_id)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.submitter_name}</div>
                          <div className="text-xs text-muted-foreground">{row.submitter_email}</div>
                          {row.submitter_phone && <div className="text-xs text-muted-foreground">{row.submitter_phone}</div>}
                        </TableCell>
                        <TableCell>{row.submission_type === "batch" ? `${candidates.length} (batch)` : "1"}</TableCell>
                        <TableCell>{row.indemnity_files?.length ?? 0}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(row.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="outline" disabled={!candidates.length} onClick={() => downloadCsi(row)}>
                              <FileSpreadsheet className="h-4 w-4 mr-1" /> CSI Sheet
                            </Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busyId === row.id} onClick={() => void processIntake(row)}>
                              {busyId === row.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
                              Process
                            </Button>
                            <Button size="sm" variant="destructive" disabled={busyId === row.id} onClick={() => void discardIntake(row)}>
                              <Trash2 className="h-4 w-4 mr-1" /> Discard
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {expanded && (() => {
        const row = rows.find((r) => r.id === expanded);
        if (!row) return null;
        const candidates = cands[row.id] ?? [];
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                <Download className="h-4 w-4 text-red-600" /> {row.order_number} — details
                <Badge variant="outline">Consent confirmed {new Date(row.consent_confirmed_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {row.notes && (
                <div className="text-sm bg-muted/50 rounded-md p-3 border">
                  <span className="font-medium">Submitter notes:</span> {row.notes}
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold mb-2">Candidates ({candidates.length})</h4>
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>First Name</TableHead>
                        <TableHead>Surname</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Date of Birth</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.map((c, i) => (
                        <TableRow key={c.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{c.first_name}</TableCell>
                          <TableCell>{c.surname}</TableCell>
                          <TableCell className="font-mono text-xs">{c.id_number}</TableCell>
                          <TableCell>{c.gender === "M" ? "Male" : c.gender === "F" ? "Female" : "—"}</TableCell>
                          <TableCell>{c.date_of_birth ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Attached documents ({row.indemnity_files?.length ?? 0})</h4>
                {row.indemnity_files?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {row.indemnity_files.map((f, i) => (
                      <Button key={i} size="sm" variant="outline" onClick={() => void openIndemnity(f.path)}>
                        <Download className="h-4 w-4 mr-1" /> {f.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents attached.</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
