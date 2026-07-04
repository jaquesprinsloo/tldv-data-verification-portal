import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Home, Plus, FileDown, Mail, Trash2, Pencil, Upload, ClipboardList, Users, FileText, Download, Eye, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { generateManualRiskPdf, blobToBase64, CHECK_META, CHECK_COLUMNS, type ManualRiskCandidatePdf } from "@/lib/manualRiskPdf";
import { Checkbox } from "@/components/ui/checkbox";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------- helpers ----------

type Client = {
  id: string; client_name: string; contact_person: string | null;
  email: string | null; phone: string | null; address: string | null;
};
type Submission = {
  id: string; order_number: string; client_id: string | null;
  submission_type: "single" | "batch"; status: "open" | "completed";
  notes: string | null; created_at: string;
  requested_checks: string[] | null;
  sent_at: string | null;
  invoiced_at: string | null;
  invoice_number: string | null;
  invoice_file_path: string | null;
  indemnity_files: IndemnityFile[] | null;
  report_onedrive_web_url: string | null;
  report_onedrive_item_id: string | null;
  report_onedrive_path: string | null;
};
export type IndemnityFile = {
  name: string;
  path: string; // storage path in manual-risk-indemnities bucket
  uploaded_at: string;
  size?: number;
  content_type?: string;
  onedrive_web_url?: string | null;
  onedrive_item_id?: string | null;
};

// Uploads a single file to the manual-risk-indemnities storage bucket
// AND mirrors it to OneDrive, returning the metadata to persist.
async function uploadIndemnity(
  file: File,
  submissionId: string,
  orderNumber: string,
  clientName: string | null,
): Promise<IndemnityFile> {
  const path = `${submissionId}/${Date.now()}_${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await supabase.storage
    .from("manual-risk-indemnities")
    .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  if (upErr) throw upErr;

  let onedrive_web_url: string | null = null;
  let onedrive_item_id: string | null = null;
  try {
    const base64 = await blobToBase64(file);
    const { data, error } = await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
      body: {
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type || "application/pdf",
        clientName: clientName ?? "Unassigned",
        orderNumber,
        kind: "indemnity",
      },
    });
    if (error) throw error;
    if ((data as any)?.success) {
      onedrive_web_url = (data as any).webUrl ?? null;
      onedrive_item_id = (data as any).itemId ?? null;
    } else if ((data as any)?.error) {
      throw new Error((data as any).error);
    }
  } catch (e) {
    toast.warning(`Uploaded "${file.name}" to storage, but OneDrive mirror failed: ${(e as Error).message}`);
  }

  return {
    name: file.name,
    path,
    uploaded_at: new Date().toISOString(),
    size: file.size,
    content_type: file.type || "application/pdf",
    onedrive_web_url,
    onedrive_item_id,
  };
}

type Candidate = {
  id: string; submission_id: string; id_number: string;
  surname: string; first_name: string;
  sort_order: number;
  [key: string]: any;
};

const sb = supabase as any;

const AVAILABLE_CHECKS: { key: string; label: string }[] = [
  { key: "id_verification", label: "ID Verification" },
  { key: "credit", label: "Credit Check" },
  { key: "risk_assessment", label: "Risk Assessment" },
  { key: "drivers_license", label: "Driver's License Verification" },
  { key: "pdp", label: "PDP Verification" },
  { key: "qualification", label: "Qualification Verification" },
];

// ---------- page ----------

export default function ManualRiskAssessments() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [detailsSubId, setDetailsSubId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<{ blob: Blob; title: string } | null>(null);

  const closePreviewReport = () => {
    setPreviewReport(null);
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/admin/login"); return; }
      setUserId(session.user.id);
      const { data: roleData } = await sb
        .from("user_roles").select("role").eq("user_id", session.user.id);
      const isMaster = (roleData ?? []).some((r: any) => r.role === "master_admin");
      if (!isMaster) {
        toast.error("Master admin access required");
        navigate("/admin/portal"); return;
      }
      const { data: p } = await sb.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
      setUserName(p?.full_name ?? "");
      setAllowed(true);
    })();
  }, [navigate]);

  const { data: submissions = [] } = useQuery({
    queryKey: ["mra-submissions"],
    enabled: !!allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_submissions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Submission[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["mra-clients"],
    enabled: !!allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from("manual_risk_clients")
        .select("*")
        .order("client_name", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
  });

  const clientById = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const openSubmissions = useMemo(
    () => submissions.filter((s) => !s.sent_at),
    [submissions],
  );
  const sentSubmissions = useMemo(
    () => submissions.filter((s) => !!s.sent_at),
    [submissions],
  );

  const previewPdf = async (submissionId: string) => {
    setPreviewing(submissionId);
    try {
      const sub = submissions.find((s) => s.id === submissionId);
      if (!sub) throw new Error("Submission not found");

      const [{ data: cands }, { data: settings }] = await Promise.all([
        sb.from("manual_risk_candidates")
          .select("*")
          .eq("submission_id", submissionId)
          .order("sort_order", { ascending: true }),
        sb.from("manual_risk_settings").select("terms_and_conditions").limit(1).maybeSingle(),
      ]);

      const client = sub.client_id ? clientById.get(sub.client_id) : undefined;
      const activeChecks = (sub.requested_checks?.length
        ? sub.requested_checks
        : ["id_verification", "credit", "criminal"]
      ).filter((k) => CHECK_COLUMNS[k]);

      const pdfCandidates: ManualRiskCandidatePdf[] = (cands ?? []).map((c: any) => {
        const results: Record<string, string | null> = {};
        const notes: Record<string, string | null> = {};
        for (const k of activeChecks) {
          results[k] = c[CHECK_COLUMNS[k].result] ?? null;
          notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
        }
        return { id_number: c.id_number, surname: c.surname, first_name: c.first_name, results, notes };
      });

      const blob = await generateManualRiskPdf({
        orderNumber: sub.order_number,
        clientName: client?.client_name,
        clientContact: client?.contact_person,
        clientEmail: client?.email,
        submissionType: sub.submission_type,
        candidates: pdfCandidates,
        termsAndConditions: settings?.terms_and_conditions ?? "",
        generatedByName: userName,
        requestedChecks: activeChecks,
      });

      setPreviewReport({ blob, title: `PreAppliCheck Report — ${sub.order_number}` });
    } catch (e: any) {
      toast.error("Failed to preview report: " + e.message);
    } finally {
      setPreviewing(null);
    }
  };

  if (allowed === null) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 sm:px-6 pt-4">
        <button
          onClick={() => navigate("/admin/portal")}
          className="bg-white border-[3px] border-red-600 text-foreground px-6 py-2 rounded-lg hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] transition-all duration-500 flex items-center gap-2 font-medium"
        >
          <Home className="h-4 w-4" /> Main Portal
        </button>
      </div>

      <main className="container mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardList className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold">Manual Risk Assessments</h1>
        </div>

        <Tabs defaultValue="submissions">
          <TabsList>
            <TabsTrigger value="submissions"><FileText className="h-4 w-4 mr-2" />Submissions</TabsTrigger>
            <TabsTrigger value="accounts"><Users className="h-4 w-4 mr-2" />Accounts</TabsTrigger>
            <TabsTrigger value="clients"><Users className="h-4 w-4 mr-2" />Clients</TabsTrigger>
            <TabsTrigger value="settings">T&amp;Cs</TabsTrigger>
          </TabsList>

          <TabsContent value="submissions" className="mt-4">
            <Card className="p-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">{openSubmissions.length} submission(s)</p>
                <Button onClick={() => setNewSubOpen(true)} className="bg-red-600 hover:bg-red-700">
                  <Plus className="h-4 w-4 mr-2" /> New Submission
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openSubmissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No submissions yet — click "New Submission" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                    {openSubmissions.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => setDetailsSubId(s.id)}>
                        <TableCell className="font-mono">{s.order_number}</TableCell>
                        <TableCell>{s.client_id ? clientById.get(s.client_id)?.client_name ?? "—" : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.submission_type === "single" ? "Single" : "Batch"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={s.status === "completed" ? "bg-emerald-600" : "bg-amber-600"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              previewPdf(s.id);
                            }}
                            disabled={previewing === s.id}
                            title="View Report"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDetailsSubId(s.id); }}>
                            Open
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Delete submission ${s.order_number}? This permanently removes all candidates and results.`)) return;
                              const { error: cErr } = await sb.from("manual_risk_candidates").delete().eq("submission_id", s.id);
                              if (cErr) { toast.error(cErr.message); return; }
                              const { error } = await sb.from("manual_risk_submissions").delete().eq("id", s.id);
                              if (error) { toast.error(error.message); return; }
                              toast.success("Submission deleted");
                              qc.invalidateQueries({ queryKey: ["mra-submissions"] });
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="mt-4">
            <AccountsTab
              submissions={sentSubmissions}
              clients={clients}
              onChanged={() => qc.invalidateQueries({ queryKey: ["mra-submissions"] })}
            />
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <ClientsTab clients={clients} userId={userId} onChanged={() => qc.invalidateQueries({ queryKey: ["mra-clients"] })} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <TermsSettingsTab userId={userId} />
          </TabsContent>
        </Tabs>
      </main>

      {newSubOpen && (
        <NewSubmissionDialog
          open={newSubOpen}
          onClose={() => setNewSubOpen(false)}
          clients={clients}
          userId={userId}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ["mra-submissions"] });
            qc.invalidateQueries({ queryKey: ["mra-clients"] });
            setNewSubOpen(false);
            setDetailsSubId(id);
          }}
        />
      )}

      {detailsSubId && (
        <SubmissionDetailsDialog
          submissionId={detailsSubId}
          onClose={() => setDetailsSubId(null)}
          clients={clients}
          userName={userName}
          onChanged={() => qc.invalidateQueries({ queryKey: ["mra-submissions"] })}
        />
      )}

      <Dialog open={!!previewReport} onOpenChange={(open) => !open && closePreviewReport()}>
        <DialogContent className="max-w-6xl h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2 border-b">
            <DialogTitle>{previewReport?.title ?? "Report Preview"}</DialogTitle>
          </DialogHeader>
          {previewReport && (
            <PdfPreview
              blob={previewReport.blob}
              title={previewReport.title}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PdfPreview({ blob, title }: { blob: Blob; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading preview...");

  useEffect(() => {
    let cancelled = false;
    let pdfDocument: any = null;
    const renderTasks: any[] = [];

    const renderPdf = async () => {
      try {
        const container = containerRef.current;
        if (!container) return;

        setStatus("Loading preview...");
        container.innerHTML = "";

        const data = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data });
        pdfDocument = await loadingTask.promise;
        if (cancelled) return;

        const targetWidth = Math.min(900, Math.max(320, container.clientWidth - 32));
        const pixelRatio = window.devicePixelRatio || 1;

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.display = "block";
          canvas.style.background = "white";
          canvas.style.boxShadow = "0 1px 8px rgba(0,0,0,0.12)";
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

          const pageWrap = document.createElement("div");
          pageWrap.style.display = "flex";
          pageWrap.style.justifyContent = "center";
          pageWrap.style.padding = "16px";
          pageWrap.appendChild(canvas);
          container.appendChild(pageWrap);

          const renderTask = page.render({ canvasContext: context as any, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }

        if (!cancelled) setStatus("");
      } catch (error: any) {
        if (cancelled || error?.name === "RenderingCancelledException") return;
        setStatus("Unable to load report preview.");
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel?.());
      pdfDocument?.destroy?.();
    };
  }, [blob]);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-muted/30" aria-label={title}>
      {status && <div className="p-6 text-sm text-muted-foreground">{status}</div>}
      <div ref={containerRef} className="min-h-full" role="document" />
    </div>
  );
}

// ---------- Clients tab ----------

function ClientsTab({ clients, userId, onChanged }: { clients: Client[]; userId: string; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<Client> | null>(null);

  const save = async () => {
    if (!editing?.client_name?.trim()) { toast.error("Client name is required"); return; }
    const payload = {
      client_name: editing.client_name.trim(),
      contact_person: editing.contact_person?.trim() || null,
      email: editing.email?.trim() || null,
      phone: editing.phone?.trim() || null,
      address: editing.address?.trim() || null,
    };
    if (editing.id) {
      const { error } = await sb.from("manual_risk_clients").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await sb.from("manual_risk_clients").insert({ ...payload, created_by: userId });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Client saved");
    setEditing(null); onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this client? Existing submissions keep the client name.")) return;
    const { error } = await sb.from("manual_risk_clients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">{clients.length} saved client(s)</p>
        <Button onClick={() => setEditing({})} className="bg-red-600 hover:bg-red-700">
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No saved clients.</TableCell></TableRow>
          )}
          {clients.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.client_name}</TableCell>
              <TableCell>{c.contact_person ?? "—"}</TableCell>
              <TableCell>{c.email ?? "—"}</TableCell>
              <TableCell>{c.phone ?? "—"}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Client" : "Add Client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Client Name *</Label><Input value={editing?.client_name ?? ""} onChange={(e) => setEditing((p) => ({ ...p, client_name: e.target.value }))} /></div>
            <div><Label>Contact Person</Label><Input value={editing?.contact_person ?? ""} onChange={(e) => setEditing((p) => ({ ...p, contact_person: e.target.value }))} /></div>
            <div><Label>Email</Label><Input type="email" value={editing?.email ?? ""} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={editing?.phone ?? ""} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div><Label>Address</Label><Textarea value={editing?.address ?? ""} onChange={(e) => setEditing((p) => ({ ...p, address: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} className="bg-red-600 hover:bg-red-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Settings tab ----------

function TermsSettingsTab({ userId }: { userId: string }) {
  const [terms, setTerms] = useState("");
  const [loading, setLoading] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("manual_risk_settings").select("*").limit(1).maybeSingle();
      const val = data?.terms_and_conditions ?? "";
      setTerms(val);
      if (editorRef.current) editorRef.current.innerHTML = val;
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading && editorRef.current && editorRef.current.innerHTML !== terms) {
      editorRef.current.innerHTML = terms;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    if (editorRef.current) setTerms(editorRef.current.innerHTML);
  };

  const save = async () => {
    const { data: existing } = await sb.from("manual_risk_settings").select("id").limit(1).maybeSingle();
    if (existing?.id) {
      const { error } = await sb.from("manual_risk_settings")
        .update({ terms_and_conditions: terms, updated_by: userId }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await sb.from("manual_risk_settings")
        .insert({ terms_and_conditions: terms, updated_by: userId });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Disclaimer saved");
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Report Disclaimer</h3>
        <p className="text-xs text-muted-foreground">Applied to every Manual Risk Assessment PDF.</p>
      </div>
      <div className="border rounded-md">
        <div className="flex flex-wrap items-center gap-1 border-b p-1 bg-muted/40">
          <Button type="button" variant="ghost" size="icon" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}><Bold className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}><Italic className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}><Underline className="h-4 w-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button type="button" variant="ghost" size="icon" title="Align left" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyLeft")}><AlignLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title="Align center" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyCenter")}><AlignCenter className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title="Align right" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyRight")}><AlignRight className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" size="icon" title="Justify" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyFull")}><AlignJustify className="h-4 w-4" /></Button>
        </div>
        <div
          ref={editorRef}
          contentEditable={!loading}
          suppressContentEditableWarning
          onInput={(e) => setTerms((e.target as HTMLDivElement).innerHTML)}
          className="min-h-[280px] p-3 text-sm focus:outline-none prose prose-sm max-w-none [&_*]:my-1"
          style={{ textAlign: "justify" }}
          data-placeholder="Enter the disclaimer shown at the bottom of the report..."
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} className="bg-red-600 hover:bg-red-700" disabled={loading}>Save T&amp;Cs</Button>
      </div>
    </Card>
  );
}

// ---------- New submission dialog ----------

function NewSubmissionDialog({
  open, onClose, clients, userId, onCreated,
}: {
  open: boolean; onClose: () => void; clients: Client[]; userId: string;
  onCreated: (submissionId: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<"single" | "batch">("single");
  const [orderNumber, setOrderNumber] = useState("");
  const [clientMode, setClientMode] = useState<"existing" | "new" | "none">("existing");
  const [clientId, setClientId] = useState<string>("");
  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [saveClient, setSaveClient] = useState(true);
  const [selectedChecks, setSelectedChecks] = useState<string[]>(["id_verification"]);
  // single mode candidate
  const [singleC, setSingleC] = useState<{ id_number: string; surname: string; first_name: string }>({
    id_number: "", surname: "", first_name: "",
  });
  // batch candidates
  const [batchRows, setBatchRows] = useState<Array<{ id_number: string; surname: string; first_name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [indemnityFiles, setIndemnityFiles] = useState<File[]>([]);

  useEffect(() => {
    if (clients.length === 0) setClientMode("new");
  }, [clients.length]);

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: "" });
      const parsed: typeof batchRows = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const a = String(r?.[0] ?? "").trim();
        const b = String(r?.[1] ?? "").trim();
        const c = String(r?.[2] ?? "").trim();
        if (!a && !b && !c) continue;
        // skip header row if it doesn't look like an ID (13 digits)
        if (i === 0 && !/^\d{6,}$/.test(a)) continue;
        if (!a || !b || !c) continue;
        parsed.push({ id_number: a, surname: b, first_name: c });
      }
      if (!parsed.length) { toast.error("No candidate rows found. Use Column A=ID, B=Surname, C=First Name."); return; }
      setBatchRows(parsed);
      toast.success(`${parsed.length} candidate(s) loaded`);
    } catch (e) {
      toast.error("Failed to read spreadsheet: " + (e as Error).message);
    }
  };

  const submit = async () => {
    if (!orderNumber.trim()) { toast.error("Order number is required"); return; }
    if (!selectedChecks.length) { toast.error("Select at least one check"); return; }
    let resolvedClientId: string | null = null;
    if (clientMode === "existing") {
      if (!clientId) { toast.error("Select a client"); return; }
      resolvedClientId = clientId;
    } else if (clientMode === "new") {
      if (!newClient.client_name?.trim()) { toast.error("Client name is required"); return; }
      if (saveClient) {
        const { data, error } = await sb.from("manual_risk_clients")
          .insert({
            client_name: newClient.client_name!.trim(),
            contact_person: newClient.contact_person?.trim() || null,
            email: newClient.email?.trim() || null,
            phone: newClient.phone?.trim() || null,
            address: newClient.address?.trim() || null,
            created_by: userId,
          })
          .select("id").single();
        if (error) { toast.error(error.message); return; }
        resolvedClientId = data.id;
      }
    }

    const candidates = type === "single"
      ? [singleC].filter((c) => c.id_number && c.surname && c.first_name)
      : batchRows;
    if (!candidates.length) { toast.error("Add at least one candidate"); return; }

    setBusy(true);
    try {
      const { data: sub, error: subErr } = await sb.from("manual_risk_submissions")
        .insert({
          order_number: orderNumber.trim(),
          client_id: resolvedClientId,
          submission_type: type,
          status: "open",
          requested_checks: selectedChecks,
          created_by: userId,
        })
        .select("id").single();
      if (subErr) throw subErr;

      const rows = candidates.map((c, idx) => ({
        submission_id: sub.id,
        id_number: c.id_number.trim(),
        surname: c.surname.trim(),
        first_name: c.first_name.trim(),
        sort_order: idx,
      }));
      const { error: candErr } = await sb.from("manual_risk_candidates").insert(rows);
      if (candErr) throw candErr;

      // Upload indemnity files (storage + OneDrive) and persist metadata
      if (indemnityFiles.length) {
        const resolvedClientName =
          clientMode === "existing"
            ? clients.find((c) => c.id === resolvedClientId)?.client_name ?? null
            : clientMode === "new"
              ? newClient.client_name?.trim() ?? null
              : null;
        const uploaded: IndemnityFile[] = [];
        for (const f of indemnityFiles) {
          try {
            const meta = await uploadIndemnity(f, sub.id, orderNumber.trim(), resolvedClientName);
            uploaded.push(meta);
          } catch (e) {
            toast.error(`Indemnity "${f.name}" failed: ${(e as Error).message}`);
          }
        }
        if (uploaded.length) {
          await sb
            .from("manual_risk_submissions")
            .update({ indemnity_files: uploaded })
            .eq("id", sub.id);
          toast.success(`${uploaded.length} indemnity file(s) uploaded`);
        }
      }

      toast.success("Submission created");
      onCreated(sub.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Manual Risk Submission</DialogTitle>
          <DialogDescription>Step {step} of 3</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Label>Submission Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setType("single")}
                className={`p-4 rounded-lg border-2 text-left ${type === "single" ? "border-red-600 bg-red-50" : "border-gray-200"}`}>
                <div className="font-semibold">Single Submission</div>
                <div className="text-xs text-muted-foreground">Add one candidate manually.</div>
              </button>
              <button onClick={() => setType("batch")}
                className={`p-4 rounded-lg border-2 text-left ${type === "batch" ? "border-red-600 bg-red-50" : "border-gray-200"}`}>
                <div className="font-semibold">Batch Submission</div>
                <div className="text-xs text-muted-foreground">Upload Excel: A=ID, B=Surname, C=First Name.</div>
              </button>
            </div>
            <DialogFooter>
              <Button onClick={() => setStep(2)} className="bg-red-600 hover:bg-red-700">Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Order Number *</Label>
              <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. ORD-2026-0142" />
            </div>

            <div>
              <Label>Checks Requested *</Label>
              <p className="text-xs text-muted-foreground mb-2">Select one or more checks to run for this submission.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-md p-3">
                {AVAILABLE_CHECKS.map((c) => {
                  const checked = selectedChecks.includes(c.key);
                  return (
                    <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedChecks((prev) =>
                            v ? Array.from(new Set([...prev, c.key])) : prev.filter((k) => k !== c.key),
                          );
                        }}
                      />
                      <span>{c.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Client</Label>
              <div className="flex gap-2 mb-2 mt-1">
                <Button type="button" size="sm" variant={clientMode === "existing" ? "default" : "outline"}
                  onClick={() => setClientMode("existing")} disabled={clients.length === 0}>
                  Existing Client
                </Button>
                <Button type="button" size="sm" variant={clientMode === "new" ? "default" : "outline"}
                  onClick={() => setClientMode("new")}>
                  New Client
                </Button>
                <Button type="button" size="sm" variant={clientMode === "none" ? "default" : "outline"}
                  onClick={() => setClientMode("none")}>
                  No Client
                </Button>
              </div>

              {clientMode === "existing" && (
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {clientMode === "new" && (
                <div className="space-y-2 border p-3 rounded-md">
                  <Input placeholder="Client name *" value={newClient.client_name ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, client_name: e.target.value }))} />
                  <Input placeholder="Contact person" value={newClient.contact_person ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, contact_person: e.target.value }))} />
                  <Input placeholder="Email" value={newClient.email ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="Phone" value={newClient.phone ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} />
                    Save this client for future submissions
                  </label>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} className="bg-red-600 hover:bg-red-700">Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {type === "single" ? (
              <div className="space-y-2">
                <Label>Candidate</Label>
                <Input placeholder="ID Number *" value={singleC.id_number} onChange={(e) => setSingleC({ ...singleC, id_number: e.target.value })} />
                <Input placeholder="Surname *" value={singleC.surname} onChange={(e) => setSingleC({ ...singleC, surname: e.target.value })} />
                <Input placeholder="First Name *" value={singleC.first_name} onChange={(e) => setSingleC({ ...singleC, first_name: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border-2 border-dashed rounded-md p-4 text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm mb-2">Upload Excel file (.xlsx / .csv)</p>
                  <p className="text-xs text-muted-foreground mb-3">Column A: ID Number • B: Surname • C: First Name</p>
                  <Input type="file" accept=".xlsx,.xls,.csv"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </div>
                {batchRows.length > 0 && (
                  <div className="max-h-56 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>ID</TableHead><TableHead>Surname</TableHead><TableHead>First Name</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {batchRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{r.id_number}</TableCell>
                            <TableCell>{r.surname}</TableCell><TableCell>{r.first_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label>Indemnity Forms (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Upload signed candidate indemnity forms. They stay with the submission and are saved to OneDrive — they are <strong>not</strong> attached when the Background Screening Report is emailed.
              </p>
              <Input
                type="file"
                accept="application/pdf,.pdf,image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setIndemnityFiles((prev) => [...prev, ...files]);
                  e.currentTarget.value = "";
                }}
              />
              {indemnityFiles.length > 0 && (
                <ul className="text-xs space-y-1 mt-2">
                  {indemnityFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between border rounded px-2 py-1">
                      <span className="truncate mr-2">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setIndemnityFiles((prev) => prev.filter((_, ix) => ix !== i))}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={submit} className="bg-red-600 hover:bg-red-700" disabled={busy}>
                {busy ? "Creating..." : "Create Submission"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Submission details / results dialog ----------

function SubmissionDetailsDialog({
  submissionId, onClose, clients, userName, onChanged,
}: {
  submissionId: string; onClose: () => void;
  clients: Client[]; userName: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: sub } = useQuery<Submission | null>({
    queryKey: ["mra-sub", submissionId],
    queryFn: async () => {
      const { data, error } = await sb.from("manual_risk_submissions").select("*").eq("id", submissionId).maybeSingle();
      if (error) throw error;
      return data as Submission | null;
    },
  });
  const { data: candidates = [], refetch } = useQuery<Candidate[]>({
    queryKey: ["mra-cands", submissionId],
    queryFn: async () => {
      const { data, error } = await sb.from("manual_risk_candidates")
        .select("*").eq("submission_id", submissionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Candidate[];
    },
  });
  const [local, setLocal] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => { setLocal(candidates); }, [candidates]);

  const client = sub?.client_id ? clients.find((c) => c.id === sub.client_id) : undefined;
  useEffect(() => { if (client?.email) setEmailTo(client.email); }, [client?.email]);

  const updateRow = (idx: number, patch: Partial<Candidate>) => {
    setLocal((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const activeChecks = (sub?.requested_checks && sub.requested_checks.length
    ? sub.requested_checks
    : ["id_verification", "credit", "criminal"]
  ).filter((k) => CHECK_COLUMNS[k]);

  const saveResults = async () => {
    setSaving(true);
    try {
      for (const c of local) {
        const patch: Record<string, any> = {};
        for (const k of activeChecks) {
          const cols = CHECK_COLUMNS[k];
          patch[cols.result] = c[cols.result] ?? null;
          patch[cols.notes] = c[cols.notes] ?? null;
        }
        const { error } = await sb.from("manual_risk_candidates").update(patch).eq("id", c.id);
        if (error) throw error;
      }
      const allComplete = local.every((c) =>
        activeChecks.every((k) => {
          const v = c[CHECK_COLUMNS[k].result];
          return v && v !== "pending";
        }),
      );
      if (allComplete && sub?.status !== "completed") {
        await sb.from("manual_risk_submissions").update({ status: "completed" }).eq("id", submissionId);
      }
      toast.success("Results saved");
      refetch();
      qc.invalidateQueries({ queryKey: ["mra-sub", submissionId] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const buildPdfBlob = async () => {
    const { data: settings } = await sb.from("manual_risk_settings").select("terms_and_conditions").limit(1).maybeSingle();
    const pdfCandidates: ManualRiskCandidatePdf[] = local.map((c) => {
      const results: Record<string, string | null> = {};
      const notes: Record<string, string | null> = {};
      for (const k of activeChecks) {
        results[k] = c[CHECK_COLUMNS[k].result] ?? null;
        notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
      }
      return { id_number: c.id_number, surname: c.surname, first_name: c.first_name, results, notes };
    });
    return await generateManualRiskPdf({
      orderNumber: sub?.order_number ?? "",
      clientName: client?.client_name,
      clientContact: client?.contact_person,
      clientEmail: client?.email,
      submissionType: (sub?.submission_type ?? "single") as "single" | "batch",
      candidates: pdfCandidates,
      termsAndConditions: settings?.terms_and_conditions ?? "",
      generatedByName: userName,
      requestedChecks: activeChecks,
    });
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const blob = await buildPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PreAppliCheck-Report-${sub?.order_number ?? "report"}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error((e as Error).message); }
    finally { setDownloading(false); }
  };

  const sendEmail = async () => {
    setSending(true);
    try {
      const blob = await buildPdfBlob();
      const base64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("send-manual-risk-report", {
        body: {
          message: emailMsg, pdfBase64: base64,
          filename: `PreAppliCheck-Report-${sub?.order_number ?? "report"}.pdf`,
          orderNumber: sub?.order_number,
          clientName: client?.client_name ?? null,
          contactName: client?.contact_person ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Mirror the Background Screening Report (only) to OneDrive
      let odWebUrl: string | null = null;
      let odItemId: string | null = null;
      let odPath: string | null = null;
      try {
        const { data: odData, error: odErr } = await supabase.functions.invoke(
          "upload-manual-risk-to-onedrive",
          {
            body: {
              fileName: `PreAppliCheck-Report-${sub?.order_number ?? "report"}.pdf`,
              fileBase64: base64,
              contentType: "application/pdf",
              clientName: client?.client_name ?? "Unassigned",
              orderNumber: sub?.order_number,
              kind: "report",
            },
          },
        );
        if (odErr) throw odErr;
        if ((odData as any)?.success) {
          odWebUrl = (odData as any).webUrl ?? null;
          odItemId = (odData as any).itemId ?? null;
          odPath = (odData as any).fullPath ?? null;
        } else if ((odData as any)?.error) {
          throw new Error((odData as any).error);
        }
      } catch (e) {
        toast.warning(`Report emailed, but OneDrive save failed: ${(e as Error).message}`);
      }

      // Mark submission as sent so it moves to Accounts tab
      await sb
        .from("manual_risk_submissions")
        .update({
          sent_at: new Date().toISOString(),
          report_onedrive_web_url: odWebUrl,
          report_onedrive_item_id: odItemId,
          report_onedrive_path: odPath,
        })
        .eq("id", submissionId);
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      onChanged();
      toast.success("Report sent to Admin@tldv.co.za");
      setEmailOpen(false); setEmailMsg("");
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const reopenSubmission = async () => {
    setReopening(true);
    try {
      const { error } = await sb
        .from("manual_risk_submissions")
        .update({ status: "open" })
        .eq("id", submissionId);
      if (error) throw error;
      toast.success("Submission reopened — you can now edit the checks");
      refetch();
      qc.invalidateQueries({ queryKey: ["mra-sub", submissionId] });
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReopening(false);
    }
  };

  if (!sub) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submission — Order {sub.order_number}</DialogTitle>
          <DialogDescription>
            {client?.client_name ?? "No client"} • {sub.submission_type === "single" ? "Single" : "Batch"} • {local.length} candidate(s) • Status: {sub.status}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Candidate</TableHead>
                <TableHead className="w-32">ID</TableHead>
                {activeChecks.map((k) => (
                  <TableHead key={k}>{CHECK_META[k]?.label ?? k}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {local.map((c, idx) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.surname}, {c.first_name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.id_number}</TableCell>
                  {activeChecks.map((k) => {
                    const cols = CHECK_COLUMNS[k];
                    return (
                      <TableCell key={k}>
                        <ResultCell
                          value={c[cols.result] ?? null}
                          options={CHECK_META[k]?.options ?? []}
                          onValue={(v) => updateRow(idx, { [cols.result]: v } as any)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <div className="flex-1" />
          {sub.status === "completed" && (
            <Button
              variant="outline"
              onClick={reopenSubmission}
              disabled={reopening}
              title="Reopen this submission so results can be edited"
            >
              <Pencil className="h-4 w-4 mr-2" />
              {reopening ? "Reopening..." : "Reopen for Editing"}
            </Button>
          )}
          <Button onClick={saveResults} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? "Saving..." : "Save Results"}
          </Button>
          <Button variant="outline" onClick={downloadPdf} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" /> {downloading ? "Building..." : "Download PDF"}
          </Button>
          <Button onClick={() => setEmailOpen(true)}>
            <Mail className="h-4 w-4 mr-2" /> Email PDF
          </Button>
        </DialogFooter>

        <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Email Report</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Recipient</div>
                <div className="font-medium">Admin@tldv.co.za</div>
                <div className="text-xs text-muted-foreground mt-1">
                  All risk assessment reports are routed to the admin mailbox only.
                </div>
              </div>
              <div>
                <Label>Message (optional)</Label>
                <Textarea rows={4} value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)}
                  placeholder="Add a short message that will appear in the email body..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
              <Button onClick={sendEmail} disabled={sending} className="bg-red-600 hover:bg-red-700">
                {sending ? "Sending..." : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function ResultCell({
  value, options, onValue,
}: {
  value: string | null;
  options: { v: string; l: string }[];
  onValue: (v: string) => void;
}) {
  const isRisk = value === "risk_identified";
  return (
    <div className="min-w-[160px]">
      <Select value={value ?? ""} onValueChange={onValue}>
        <SelectTrigger className={`h-8 text-xs ${isRisk ? "text-red-500 font-bold" : ""}`}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------- Accounts tab ----------

type AccountRow = {
  submissionId: string;
  candidateId: string;
  orderNumber: string;
  sentAt: string;
  invoicedAt: string | null;
  invoiceNumber: string | null;
  invoiceFilePath: string | null;
  idNumber: string;
  surname: string;
  firstName: string;
};

function AccountsTab({
  submissions, clients, onChanged,
}: {
  submissions: Submission[];
  clients: Client[];
  onChanged: () => void;
}) {
  const [openClientId, setOpenClientId] = useState<string | "unassigned" | null>(null);

  // Group sent submissions by client
  const groups = useMemo(() => {
    const m = new Map<string, { client: Client | null; subs: Submission[] }>();
    for (const s of submissions) {
      const key = s.client_id ?? "__unassigned__";
      if (!m.has(key)) {
        const client = s.client_id ? clients.find((c) => c.id === s.client_id) ?? null : null;
        m.set(key, { client, subs: [] });
      }
      m.get(key)!.subs.push(s);
    }
    return Array.from(m.entries()).map(([key, v]) => ({
      key,
      client: v.client,
      name: v.client?.client_name ?? "Unassigned",
      subs: v.subs,
      pendingInvoice: v.subs.filter((s) => !s.invoiced_at).length,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [submissions, clients]);

  return (
    <Card className="p-4">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          {submissions.length} sent check(s) across {groups.length} client account(s). Select a client to export or invoice.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No sent submissions yet. Once you email a report from the Submissions tab it will appear here under its client.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-center">Sent checks</TableHead>
              <TableHead className="text-center">Awaiting invoice</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-center">{g.subs.length}</TableCell>
                <TableCell className="text-center">
                  <Badge className={g.pendingInvoice ? "bg-amber-600" : "bg-emerald-600"}>
                    {g.pendingInvoice}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpenClientId(g.key === "__unassigned__" ? "unassigned" : g.key)}>
                    Open account
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {openClientId && (
        <ClientAccountDialog
          groupKey={openClientId === "unassigned" ? "__unassigned__" : openClientId}
          onClose={() => setOpenClientId(null)}
          submissions={submissions}
          clients={clients}
          onChanged={onChanged}
        />
      )}
    </Card>
  );
}

function ClientAccountDialog({
  groupKey, onClose, submissions, clients, onChanged,
}: {
  groupKey: string;
  onClose: () => void;
  submissions: Submission[];
  clients: Client[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const client = groupKey === "__unassigned__" ? null : clients.find((c) => c.id === groupKey) ?? null;
  const clientName = client?.client_name ?? "Unassigned";
  const subs = useMemo(
    () => submissions
      .filter((s) => (s.client_id ?? "__unassigned__") === groupKey)
      .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? "")),
    [submissions, groupKey],
  );

  // Date range filter
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Load all candidates for these submissions
  const submissionIds = useMemo(() => subs.map((s) => s.id), [subs]);
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["mra-account-cands", groupKey, submissionIds.join(",")],
    enabled: submissionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.from("manual_risk_candidates")
        .select("*").in("submission_id", submissionIds)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Candidate[];
    },
  });

  const rows: AccountRow[] = useMemo(() => {
    const bySub = new Map(subs.map((s) => [s.id, s]));
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    return candidates
      .map((c) => {
        const s = bySub.get(c.submission_id);
        if (!s || !s.sent_at) return null;
        const sentTs = new Date(s.sent_at).getTime();
        if (from !== null && sentTs < from) return null;
        if (to !== null && sentTs > to) return null;
        return {
          submissionId: s.id,
          candidateId: c.id,
          orderNumber: s.order_number,
          sentAt: s.sent_at,
          invoicedAt: s.invoiced_at,
          invoiceNumber: s.invoice_number,
          invoiceFilePath: s.invoice_file_path,
          idNumber: c.id_number,
          surname: c.surname,
          firstName: c.first_name,
        } as AccountRow;
      })
      .filter((r): r is AccountRow => r !== null);
  }, [candidates, subs, fromDate, toDate]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [groupKey]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.submissionId)));
  };
  const toggleOne = (subId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId); else next.add(subId);
      return next;
    });
  };

  const selectedSubmissionIds = useMemo(
    () => Array.from(new Set(rows.filter((r) => selected.has(r.submissionId)).map((r) => r.submissionId))),
    [rows, selected],
  );

  const exportExcel = () => {
    const source = rows.filter((r) => selected.size === 0 || selected.has(r.submissionId));
    if (!source.length) { toast.error("No rows to export"); return; }
    const wsData = [
      ["Client", "Order #", "Sent Date", "First Name", "Surname", "ID Number", "Invoiced", "Invoice #"],
      ...source.map((r) => [
        clientName,
        r.orderNumber,
        new Date(r.sentAt).toLocaleDateString(),
        r.firstName,
        r.surname,
        r.idNumber,
        r.invoicedAt ? new Date(r.invoicedAt).toLocaleDateString() : "",
        r.invoiceNumber ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checks");
    const safe = clientName.replace(/[^a-z0-9]+/gi, "_");
    const range = fromDate || toDate ? `_${fromDate || "start"}_to_${toDate || "today"}` : "";
    XLSX.writeFile(wb, `${safe}_Checks${range}.xlsx`);
    toast.success(`Exported ${source.length} row(s)`);
  };

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const markInvoiced = async () => {
    if (!selectedSubmissionIds.length) { toast.error("Select at least one submission first"); return; }
    if (!invoiceFile) { toast.error("Attach the invoice file"); return; }
    setUploading(true);
    try {
      const ext = invoiceFile.name.split(".").pop() ?? "pdf";
      const path = `manual-risk/${groupKey}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, invoiceFile, {
        contentType: invoiceFile.type || "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { error } = await sb
        .from("manual_risk_submissions")
        .update({
          invoiced_at: new Date().toISOString(),
          invoice_number: invoiceNumber.trim() || null,
          invoice_file_path: path,
        })
        .in("id", selectedSubmissionIds);
      if (error) throw error;

      toast.success(`${selectedSubmissionIds.length} submission(s) marked invoiced`);
      setInvoiceOpen(false);
      setInvoiceFile(null);
      setInvoiceNumber("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const viewInvoice = async (path: string) => {
    const { data, error } = await supabase.storage.from("invoices").createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const deleteSubmission = async (submissionId: string, orderNumber: string) => {
    if (!confirm(`Delete submission ${orderNumber}? This removes the submission and all its candidates permanently.`)) return;
    try {
      const sub = subs.find((s) => s.id === submissionId);
      if (sub?.invoice_file_path) {
        await supabase.storage.from("invoices").remove([sub.invoice_file_path]);
      }
      const { error: cErr } = await sb.from("manual_risk_candidates").delete().eq("submission_id", submissionId);
      if (cErr) throw cErr;
      const { error } = await sb.from("manual_risk_submissions").delete().eq("id", submissionId);
      if (error) throw error;
      toast.success("Submission deleted");
      setSelected((prev) => { const n = new Set(prev); n.delete(submissionId); return n; });
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const deleteSelected = async () => {
    if (!selectedSubmissionIds.length) return;
    if (!confirm(`Delete ${selectedSubmissionIds.length} submission(s)? This removes them and all their candidates permanently.`)) return;
    try {
      const paths = subs
        .filter((s) => selectedSubmissionIds.includes(s.id) && s.invoice_file_path)
        .map((s) => s.invoice_file_path!) as string[];
      if (paths.length) await supabase.storage.from("invoices").remove(paths);
      const { error: cErr } = await sb.from("manual_risk_candidates").delete().in("submission_id", selectedSubmissionIds);
      if (cErr) throw cErr;
      const { error } = await sb.from("manual_risk_submissions").delete().in("id", selectedSubmissionIds);
      if (error) throw error;
      toast.success(`${selectedSubmissionIds.length} submission(s) deleted`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName} — Account</DialogTitle>
          <DialogDescription>
            {rows.length} check(s) shown • {selectedSubmissionIds.length} submission(s) selected
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <Label className="text-xs">From (sent date)</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
          </div>
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={exportExcel}>
            <FileDown className="h-4 w-4 mr-2" /> Export to Excel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => setInvoiceOpen(true)}
            disabled={!selectedSubmissionIds.length}
          >
            <FileText className="h-4 w-4 mr-2" /> Mark as Invoiced
          </Button>
          <Button
            variant="outline"
            className="border-red-600 text-red-600 hover:bg-red-50"
            onClick={deleteSelected}
            disabled={!selectedSubmissionIds.length}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && selected.size === new Set(rows.map(r => r.submissionId)).size}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No checks in this range.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.candidateId}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.submissionId)}
                      onCheckedChange={() => toggleOne(r.submissionId)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.orderNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(r.sentAt).toLocaleDateString()}</TableCell>
                  <TableCell>{r.surname}, {r.firstName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.idNumber}</TableCell>
                  <TableCell>
                    {r.invoicedAt ? (
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-600">Invoiced</Badge>
                        {r.invoiceFilePath && (
                          <Button variant="ghost" size="icon" title="View invoice" onClick={() => viewInvoice(r.invoiceFilePath!)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete submission"
                      onClick={() => deleteSubmission(r.submissionId, r.orderNumber)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>

        <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Attach Invoice</DialogTitle>
              <DialogDescription>
                Marking {selectedSubmissionIds.length} submission(s) as invoiced for {clientName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Invoice number (optional)</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-0142" />
              </div>
              <div>
                <Label>Invoice file (PDF)</Label>
                <Input type="file" accept="application/pdf,.pdf" onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={markInvoiced} disabled={uploading}>
                {uploading ? "Uploading..." : "Save Invoice"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}