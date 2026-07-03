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
};
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
            <TabsTrigger value="clients"><Users className="h-4 w-4 mr-2" />Clients</TabsTrigger>
            <TabsTrigger value="settings">T&amp;Cs</TabsTrigger>
          </TabsList>

          <TabsContent value="submissions" className="mt-4">
            <Card className="p-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">{submissions.length} submission(s)</p>
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
                    {submissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No submissions yet — click "New Submission" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                    {submissions.map((s) => (
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
          clientName: sub?.client_name ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Report sent to Admin@tldv.co.za");
      setEmailOpen(false); setEmailMsg("");
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
              <div>
                <Label>Recipients (comma-separated)</Label>
                <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="name@example.com" />
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