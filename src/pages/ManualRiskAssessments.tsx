import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Home, Plus, FileDown, Mail, Trash2, Pencil, Upload, ClipboardList, Users, FileText, Download, Eye, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, RefreshCw } from "lucide-react";
import { Star, ArrowRightLeft, Percent, FolderOpen, LayoutDashboard, ShieldAlert } from "lucide-react";
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
import { generateManualRiskPdf, blobToBase64, CHECK_META, CHECK_COLUMNS, isPlaceholderCandidate, type ManualRiskCandidatePdf } from "@/lib/manualRiskPdf";
import { Checkbox } from "@/components/ui/checkbox";
import { RecipientPicker, ClientAddressBookDialog, type MrRecipient } from "@/components/manual-risk/AddressBook";
import { AddressBookTab } from "@/components/manual-risk/AddressBookTab";
import { MrDashboardTab } from "@/components/manual-risk/MrDashboardTab";
import SupplierReconTab from "@/components/manual-risk/SupplierReconTab";
import { MrInvoicedTab, uploadInvoiceToOneDrive } from "@/components/manual-risk/MrInvoicedTab";
import { MrClientDashboardTab } from "@/components/manual-risk/MrClientDashboardTab";
import { IndemnityViewerDialog, type IndemnityFileRef } from "@/components/manual-risk/IndemnityViewerDialog";
import { ArchiveImportTab } from "@/components/manual-risk/ArchiveImportTab";
import DuplicateClientsDialog from "@/components/manual-risk/DuplicateClientsDialog";

import { BookUser } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------- helpers ----------

/** De-dupe email addresses case-insensitively while preserving order. */
function dedupeEmails(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((e) => e.trim())
    .filter(Boolean)
    .filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Split saved submission recipients into the "To" address and CC list. */
function routeRecipients(recipients: MrRecipient[] | null | undefined) {
  const list = (recipients ?? []).filter((r) => r?.email?.trim());
  if (!list.length) return { to: "", toName: null as string | null, cc: [] as string[] };
  const primary = list.find((r) => r.primary) ?? list[0];
  return {
    to: primary.email.trim(),
    toName: primary.name?.trim() || null,
    cc: dedupeEmails(
      list.filter((r) => r.email.toLowerCase() !== primary.email.toLowerCase()).map((r) => r.email),
    ),
  };
}

type Client = {
  id: string; client_name: string; contact_person: string | null;
  email: string | null; phone: string | null; address: string | null;
  cc_emails: string | null;
  is_regular?: boolean;
};
type Submission = {
  id: string; order_number: string; client_id: string | null;
  submission_type: "single" | "batch"; status: "open" | "completed";
  notes: string | null; created_at: string;
  requested_checks: string[] | null;
  sent_at: string | null;
  sent_to_supplier_at?: string | null;
  compliance_flag?: string | null;

  invoiced_at: string | null;
  invoice_number: string | null;
  invoice_file_path: string | null;
  indemnity_files: IndemnityFile[] | null;
  report_onedrive_web_url: string | null;
  report_onedrive_item_id: string | null;
  report_onedrive_path: string | null;
  report_shared_onedrive_web_url?: string | null;
  report_shared_onedrive_item_id?: string | null;
  report_shared_onedrive_path?: string | null;
  supplier_report_files: SupplierReportFile[] | null;
  recipients?: MrRecipient[] | null;
  // Historical archive import: already invoiced, kept for record keeping only.
  is_archive?: boolean | null;
  archive_batch_label?: string | null;
  archive_report_path?: string | null;
  archive_report_name?: string | null;
};

export type IndemnityFile = {
  name: string;
  path: string; // storage path in manual-risk-indemnities bucket
  uploaded_at: string;
  uploaded_by?: string | null;
  uploaded_by_name?: string | null;
  size?: number;
  content_type?: string;
  onedrive_web_url?: string | null;
  onedrive_item_id?: string | null;
  // Copy in the client-shared OneDrive folder (PreAppliCheck/ClientShared/...)
  shared_onedrive_web_url?: string | null;
  shared_onedrive_item_id?: string | null;
};
export type SupplierReportFile = {
  name: string;
  path: string; // storage path in manual-risk-supplier-reports bucket
  uploaded_at: string;
  uploaded_by?: string | null;
  uploaded_by_name?: string | null;
  size?: number;
  content_type?: string;
  onedrive_web_url?: string | null;
  onedrive_item_id?: string | null;
  extracted_id_numbers?: string[];
};

/** Who is doing this, for the record trail. Cached for the session. */
let actorCache: { id: string; name: string } | null = null;
export async function currentActor(): Promise<{ id: string; name: string }> {
  if (actorCache) return actorCache;
  const { data: { session } } = await supabase.auth.getSession();
  const id = session?.user?.id ?? "";
  let name = "";
  if (id) {
    const { data } = await (supabase as any).from("profiles").select("full_name, email").eq("id", id).maybeSingle();
    name = data?.full_name || data?.email || "";
  }
  actorCache = { id, name };
  return actorCache;
}

/** Records that a user opened a consent form, supplier report or client report. */
export async function logRecordAccess(args: {
  submissionId?: string | null;
  candidateId?: string | null;
  action: string;
  detail?: string | null;
}): Promise<void> {
  try {
    const actor = await currentActor();
    if (!actor.id) return;
    await (supabase as any).from("manual_risk_access_log").insert({
      user_id: actor.id,
      submission_id: args.submissionId ?? null,
      candidate_id: args.candidateId ?? null,
      action: args.action,
      detail: args.detail ?? null,
    });
  } catch (e) {
    console.warn("access log failed", e);
  }
}

type OneDriveUploadResult = { webUrl: string | null; itemId: string | null; fullPath: string | null };


/** Uploads a file to OneDrive via the edge function. `shared: true` targets the
 *  client-facing folder tree (reports + indemnities only, never supplier reports). */
async function uploadToOneDrive(args: {
  fileName: string;
  base64: string;
  contentType: string;
  clientName: string | null | undefined;
  orderNumber: string;
  kind: "report" | "indemnity" | "supplier";
  shared?: boolean;
}): Promise<OneDriveUploadResult> {
  const { data, error } = await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
    body: {
      fileName: args.fileName,
      fileBase64: args.base64,
      contentType: args.contentType,
      clientName: args.clientName ?? "Unassigned",
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

// Uploads supplier risk report PDF to storage + OneDrive (SupplierReports subfolder)
async function deleteFromOneDrive(itemId: string | null | undefined): Promise<void> {
  if (!itemId) return;
  try {
    const { data, error } = await supabase.functions.invoke("upload-manual-risk-to-onedrive", {
      body: { action: "delete", itemId },
    });
    if (error) throw error;
    if ((data as any)?.success === false) throw new Error((data as any)?.error || "OneDrive delete failed");
  } catch (e) {
    toast.warning(`OneDrive copy could not be deleted: ${(e as Error).message}`);
  }
}

/** Removes every OneDrive copy (internal + client-shared) belonging to a submission. */
async function purgeSubmissionOneDrive(s: Partial<Submission>): Promise<void> {
  await deleteFromOneDrive(s.report_onedrive_item_id);
  await deleteFromOneDrive(s.report_shared_onedrive_item_id);
  for (const f of (s.indemnity_files ?? []) as IndemnityFile[]) {
    await deleteFromOneDrive(f.onedrive_item_id);
    await deleteFromOneDrive(f.shared_onedrive_item_id);
  }
  for (const f of (s.supplier_report_files ?? []) as SupplierReportFile[]) {
    await deleteFromOneDrive(f.onedrive_item_id);
  }
}

async function uploadSupplierReport(
  file: File,
  submissionId: string,
  orderNumber: string,
  clientName: string | null,
  extractedIds: string[],
): Promise<SupplierReportFile> {
  const path = `${submissionId}/${Date.now()}_${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const { error: upErr } = await supabase.storage
    .from("manual-risk-supplier-reports")
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
        kind: "supplier",
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
    uploaded_by: (await currentActor()).id || null,
    uploaded_by_name: (await currentActor()).name || null,

    size: file.size,
    content_type: file.type || "application/pdf",
    onedrive_web_url,
    onedrive_item_id,
    extracted_id_numbers: extractedIds,
  };
}

// Structured record extracted per candidate from a supplier vetting report.
export type SupplierIdRecord = {
  id_number: string | null;   // may be masked e.g. "981201XXXXXXX"
  id_prefix: string | null;   // first 6 digits, used to match candidates
  status: string | null;      // e.g. "Confirmed"
  first_names?: string | null;
  initials?: string | null;
  surname?: string | null;
  date_of_birth?: string | null;
  age?: string | null;
  gender?: string | null;
  citizenship?: string | null;
  dead_alive?: string | null;
  risk_assessment?: string | null;
};

// Extract ID Verification records from a supplier report PDF via the
// extract-supplier-report-ids edge function (Gemini OCR).
async function extractSupplierRecordsFromPdf(
  file: File,
): Promise<{ ids: string[]; records: SupplierIdRecord[] }> {
  try {
    const base64 = await blobToBase64(file);
    const { data, error } = await supabase.functions.invoke("extract-supplier-report-ids", {
      body: { fileBase64: base64, contentType: file.type || "application/pdf" },
    });
    if (error) throw error;
    if ((data as any)?.success) {
      const ids = Array.isArray((data as any).ids) ? ((data as any).ids as string[]) : [];
      const records = Array.isArray((data as any).records)
        ? ((data as any).records as SupplierIdRecord[])
        : [];
      return { ids, records };
    }
    if ((data as any)?.error) throw new Error((data as any).error);
  } catch (e) {
    console.error("Supplier report extraction failed", e);
    toast.warning(`ID auto-extraction failed: ${(e as Error).message}`);
  }
  return { ids: [], records: [] };
}

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
  let shared_onedrive_web_url: string | null = null;
  let shared_onedrive_item_id: string | null = null;
  const contentType = file.type || "application/pdf";
  const base64 = await blobToBase64(file);
  const common = { fileName: file.name, base64, contentType, clientName, orderNumber, kind: "indemnity" as const };
  try {
    const od = await uploadToOneDrive(common);
    onedrive_web_url = od.webUrl; onedrive_item_id = od.itemId;
  } catch (e) {
    toast.warning(`Uploaded "${file.name}" to storage, but OneDrive mirror failed: ${(e as Error).message}`);
  }
  try {
    const od = await uploadToOneDrive({ ...common, shared: true });
    shared_onedrive_web_url = od.webUrl; shared_onedrive_item_id = od.itemId;
  } catch (e) {
    toast.warning(`Client-shared OneDrive copy of "${file.name}" failed: ${(e as Error).message}`);
  }

  return {
    name: file.name,
    path,
    uploaded_at: new Date().toISOString(),
    uploaded_by: (await currentActor()).id || null,
    uploaded_by_name: (await currentActor()).name || null,

    size: file.size,
    content_type: contentType,
    onedrive_web_url,
    onedrive_item_id,
    shared_onedrive_web_url,
    shared_onedrive_item_id,
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
  const [activeTab, setActiveTab] = useState<string>("submissions");
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Client-facing profiles get a read-only view: no costing, no invoicing,
  // no supplier reports and no ability to create or change submissions.
  const [clientFacing, setClientFacing] = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);


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
      const roles = (roleData ?? []).map((r: any) => r.role as string);
      const isMaster = roles.includes("master_admin");
      const isClientFacing = !isMaster && roles.includes("client_facing");
      // Admins may also be granted the portal explicitly via Profile Management.
      let hasPortalPermission = false;
      if (!isMaster && !isClientFacing) {
        const { data: perm } = await sb
          .from("user_permissions")
          .select("granted")
          .eq("user_id", session.user.id)
          .eq("permission_key", "portal.manual_risk_assessments")
          .maybeSingle();
        hasPortalPermission = !!perm?.granted;
      }
      if (!isMaster && !isClientFacing && !hasPortalPermission) {
        toast.error("You do not have access to the Risk Assessments portal");
        navigate("/admin/portal"); return;
      }
      const { data: p } = await sb.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
      setUserName(p?.full_name ?? "");
      setClientFacing(isClientFacing);
      setIsMasterAdmin(isMaster);

      if (isClientFacing) setActiveTab("dashboard");
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

  // Archive records are historical, already-invoiced imports: they never appear
  // in the working queues (submissions / invoicing) but stay searchable in Accounts.
  const liveSubmissions = useMemo(
    () => submissions.filter((s) => !s.is_archive),
    [submissions],
  );
  const openSubmissions = useMemo(
    () => liveSubmissions.filter((s) => !s.sent_at),
    [liveSubmissions],
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

      const pdfCandidates: ManualRiskCandidatePdf[] = (cands ?? [])
        .filter((c: any) => !isPlaceholderCandidate(c))
        .map((c: any) => {
        const results: Record<string, string | null> = {};
        const notes: Record<string, string | null> = {};
        for (const k of activeChecks) {
          results[k] = c[CHECK_COLUMNS[k].result] ?? null;
          notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
        }
        return {
          id_number: c.id_number,
          surname: c.surname,
          first_name: c.first_name,
          results,
          notes,
          id_verification_data: c.id_verification_data ?? null,
        };
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
        skipEncryption: true,
      });

      void logRecordAccess({ submissionId: sub.id, action: "view_client_report", detail: sub.order_number });
      setPreviewReport({ blob, title: `PreAppliCheck Report — ${sub.order_number}` });

    } catch (e: any) {
      toast.error("Failed to preview report: " + e.message);
    } finally {
      setPreviewing(null);
    }
  };

  const resendConfirmation = async (submissionId: string) => {
    setResendingId(submissionId);
    try {
      const sub = submissions.find((s) => s.id === submissionId);
      if (!sub) throw new Error("Submission not found");
      const client = sub.client_id ? clientById.get(sub.client_id) : undefined;
      const saved = Array.isArray(sub.recipients) ? sub.recipients : [];
      const routed = routeRecipients(saved);
      const toEmail = routed.to || client?.email?.trim();
      if (!toEmail) {
        toast.error("Cannot resend confirmation: client has no email address");
        return;
      }
      const { data: cands, error: candsErr } = await sb
        .from("manual_risk_candidates")
        .select("first_name, surname, id_number")
        .eq("submission_id", submissionId)
        .order("sort_order", { ascending: true });
      if (candsErr) throw candsErr;
      const emailCandidates = (cands ?? [])
        .filter((c: any) => !isPlaceholderCandidate(c as Candidate))
        .map((c: any) => ({
          first_name: (c.first_name ?? "").trim(),
          surname: (c.surname ?? "").trim(),
          id_number: (c.id_number ?? "").trim(),
        }));
      if (!emailCandidates.length) {
        toast.error("Cannot resend confirmation: no candidates found");
        return;
      }
      const { error: mailErr } = await sb.functions.invoke("send-submission-confirmation", {
        body: {
          to: toEmail,
          cc: dedupeEmails([
            "admin@tldv.co.za",
            ...(routed.to
              ? routed.cc
              : (client?.cc_emails?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])),
          ]),
          orderNumber: sub.order_number.trim(),
          clientName: client?.client_name ?? undefined,
          contactName: routed.toName ?? client?.contact_person ?? undefined,
          candidates: emailCandidates,
        },
      });
      if (mailErr) throw mailErr;
      toast.success("Confirmation email resent to client");
    } catch (e) {
      toast.error("Failed to resend confirmation: " + (e as Error).message);
    } finally {
      setResendingId(null);
    }
  };


  if (allowed === null) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Loading...</div>;
  }

  if (clientFacing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6 pt-4">
          <button
            onClick={() => navigate("/admin/portal")}
            className="bg-white border-[3px] border-red-600 text-foreground px-6 py-2 rounded-lg hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] transition-all duration-500 flex items-center gap-2 font-medium"
          >
            <Home className="h-4 w-4" /> Main Portal
          </button>
        </div>

        <main className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-1">
            <ClipboardList className="h-6 w-6 text-red-600" />
            <h1 className="text-2xl font-bold tracking-tight">Risk Assessments</h1>
            <Badge variant="outline" className="border-slate-300 text-slate-600">View only</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Screening overview, account search and released reports. Documents open in the app only —
            downloading, printing and sharing are disabled.
          </p>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-2" />Dashboard</TabsTrigger>
              <TabsTrigger value="submissions"><FileText className="h-4 w-4 mr-2" />In Progress</TabsTrigger>
              <TabsTrigger value="accounts"><Users className="h-4 w-4 mr-2" />Accounts</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="mt-4">
              <MrClientDashboardTab submissions={submissions as any} clients={clients} />
            </TabsContent>

            <TabsContent value="submissions" className="mt-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground mb-4">
                  {openSubmissions.length} check group(s) still awaiting verification feedback.
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openSubmissions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nothing outstanding — every submission has been released.
                          </TableCell>
                        </TableRow>
                      ) : openSubmissions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.order_number}</TableCell>
                          <TableCell>{s.client_id ? clientById.get(s.client_id)?.client_name ?? "—" : "—"}</TableCell>
                          <TableCell><Badge variant="outline">{s.submission_type === "single" ? "Single" : "Batch"}</Badge></TableCell>
                          <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge className={s.status === "completed" ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-500"}>
                              {s.status === "completed" ? "Ready for release" : "In progress"}
                            </Badge>
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
                userName={userName}
                clientFacing
                onChanged={() => qc.invalidateQueries({ queryKey: ["mra-submissions"] })}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard"><ClipboardList className="h-4 w-4 mr-2" />Dashboard</TabsTrigger>
            <TabsTrigger value="submissions"><FileText className="h-4 w-4 mr-2" />Submissions</TabsTrigger>
            <TabsTrigger value="accounts"><Users className="h-4 w-4 mr-2" />Accounts</TabsTrigger>
            <TabsTrigger value="invoiced"><FileText className="h-4 w-4 mr-2" />Invoiced</TabsTrigger>
            <TabsTrigger value="clients"><Users className="h-4 w-4 mr-2" />Clients</TabsTrigger>
            <TabsTrigger value="address-book"><Users className="h-4 w-4 mr-2" />Address Book</TabsTrigger>
            <TabsTrigger value="supplier-recon"><ClipboardList className="h-4 w-4 mr-2" />Supplier Recon</TabsTrigger>
            <TabsTrigger value="compliance"><ShieldAlert className="h-4 w-4 mr-2" />Compliance</TabsTrigger>
            {isMasterAdmin && (
              <TabsTrigger value="archive"><FolderOpen className="h-4 w-4 mr-2" />Archive Import</TabsTrigger>
            )}
            <TabsTrigger value="settings">T&amp;Cs</TabsTrigger>
          </TabsList>

          <TabsContent value="compliance" className="mt-4">
            <ComplianceTab userId={userId} userName={userName} />
          </TabsContent>


          <TabsContent value="dashboard" className="mt-4">
            <ClientFolderSyncCard submissions={liveSubmissions} clients={clients} userName={userName} />
            <MrDashboardTab submissions={submissions} clients={clients} />
          </TabsContent>

          {isMasterAdmin && (
            <TabsContent value="archive" className="mt-4">
              <ArchiveImportTab clients={clients} userId={userId} onChanged={() => {
                qc.invalidateQueries({ queryKey: ["mra-submissions"] });
                qc.invalidateQueries({ queryKey: ["mra-clients"] });
              }} />
            </TabsContent>
          )}


          <TabsContent value="supplier-recon" className="mt-4">
            <SupplierReconTab />
          </TabsContent>


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
                              await resendConfirmation(s.id);
                            }}
                            disabled={resendingId === s.id}
                            title="Resend submission confirmation"
                          >
                            {resendingId === s.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Delete submission ${s.order_number}? This permanently removes all candidates and results.`)) return;
                              // Purge OneDrive copies (internal + client-shared)
                              await purgeSubmissionOneDrive(s as any);
                              // Also purge storage buckets
                              const indPaths = (((s as any).indemnity_files ?? []) as IndemnityFile[]).map((f) => f.path);
                              if (indPaths.length) await supabase.storage.from("manual-risk-indemnities").remove(indPaths);
                              const supPaths = (((s as any).supplier_report_files ?? []) as SupplierReportFile[]).map((f) => f.path);
                              if (supPaths.length) await supabase.storage.from("manual-risk-supplier-reports").remove(supPaths);
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
              submissions={submissions}
              clients={clients}
              userName={userName}
              onChanged={() => qc.invalidateQueries({ queryKey: ["mra-submissions"] })}
            />
          </TabsContent>

          <TabsContent value="invoiced" className="mt-4">
            <MrInvoicedTab
              clients={clients}
              submissions={liveSubmissions}

              onChanged={() => qc.invalidateQueries({ queryKey: ["mra-submissions"] })}
            />
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <ClientsTab clients={clients} userId={userId} onChanged={() => qc.invalidateQueries({ queryKey: ["mra-clients"] })} />
          </TabsContent>

          <TabsContent value="address-book" className="mt-4">
            <AddressBookTab clients={clients} />
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
          onSent={() => setActiveTab("accounts")}
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

export function PdfPreview({ blob, title }: { blob: Blob; title: string }) {
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
  const [bookClient, setBookClient] = useState<Client | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  const save = async () => {
    if (!editing?.client_name?.trim()) { toast.error("Client name is required"); return; }
    const payload = {
      client_name: editing.client_name.trim(),
      contact_person: editing.contact_person?.trim() || null,
      email: editing.email?.trim() || null,
      phone: editing.phone?.trim() || null,
      address: editing.address?.trim() || null,
      cc_emails: editing.cc_emails?.trim() || null,
      is_regular: !!editing.is_regular,
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
      <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">{clients.length} saved client(s)</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDupOpen(true)}>
            <Users className="h-4 w-4 mr-2" /> Find similar accounts
          </Button>
          <Button onClick={() => setEditing({})} className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" /> Add Client
          </Button>
        </div>
      </div>

      <DuplicateClientsDialog open={dupOpen} onOpenChange={setDupOpen} clients={clients} onChanged={onChanged} />

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
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {c.client_name}
                  {c.is_regular && (
                    <Badge className="bg-amber-500 text-white gap-1"><Star className="h-3 w-3 fill-current" /> Regular</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{c.contact_person ?? "—"}</TableCell>
              <TableCell>{c.email ?? "—"}</TableCell>
              <TableCell>{c.phone ?? "—"}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button variant="ghost" size="sm" title="Address book" onClick={() => setBookClient(c)}>
                  <BookUser className="h-4 w-4" />
                </Button>
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
            <div>
              <Label>CC Emails</Label>
              <Input
                type="text"
                placeholder="cc1@example.com, cc2@example.com"
                value={editing?.cc_emails ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, cc_emails: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Comma-separated. These addresses are CC'd on confirmation emails.</p>
            </div>
            <div><Label>Phone</Label><Input value={editing?.phone ?? ""} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} /></div>
            <div><Label>Address</Label><Textarea value={editing?.address ?? ""} onChange={(e) => setEditing((p) => ({ ...p, address: e.target.value }))} /></div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="mra-client-regular"
                checked={!!editing?.is_regular}
                onCheckedChange={(v) => setEditing((p) => ({ ...p, is_regular: !!v }))}
              />
              <label htmlFor="mra-client-regular" className="text-sm cursor-pointer flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Regular pre-employment client
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} className="bg-red-600 hover:bg-red-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientAddressBookDialog
        clientId={bookClient?.id ?? null}
        clientName={bookClient?.client_name}
        open={!!bookClient}
        onClose={() => setBookClient(null)}
      />
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
  // Universal previous-check lookup (by ID number) before creating the submission
  const [dupes, setDupes] = useState<
    | {
        id_number: string;
        name: string;
        previous: { name: string; orderNumber: string; clientName: string; date: string }[];
      }[]
    | null
  >(null);
  const [dupChecking, setDupChecking] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [recipients, setRecipients] = useState<MrRecipient[]>([]);
  // Editable confirmation-email preview
  const [mailTo, setMailTo] = useState("");
  const [mailName, setMailName] = useState("");
  const [mailCc, setMailCc] = useState("admin@tldv.co.za");
  const [mailSubject, setMailSubject] = useState("");
  const [mailMessage, setMailMessage] = useState("");



  useEffect(() => {
    if (clients.length === 0) setClientMode("new");
  }, [clients.length]);

  const currentClient: Partial<Client> | null =
    clientMode === "existing"
      ? clients.find((c) => c.id === clientId) ?? null
      : clientMode === "new"
        ? {
            client_name: newClient.client_name ?? "",
            contact_person: newClient.contact_person ?? null,
            email: newClient.email ?? null,
            cc_emails: newClient.cc_emails ?? null,
          }
        : null;

  // Keep the editable email preview in sync with the selected recipients/client.
  useEffect(() => {
    const routed = routeRecipients(recipients);
    setMailTo(routed.to || currentClient?.email?.trim() || "");
    setMailName(routed.toName || currentClient?.contact_person?.trim() || "");
    setMailCc(
      dedupeEmails([
        "admin@tldv.co.za",
        ...(routed.to
          ? routed.cc
          : (currentClient?.cc_emails?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])),
      ]).join(", "),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, clientId, clientMode, newClient.email, newClient.contact_person, newClient.cc_emails]);

  useEffect(() => {
    setMailSubject(
      `PreAppliCheck Submission Received${orderNumber.trim() ? ` — Order ${orderNumber.trim()}` : ""}`,
    );
  }, [orderNumber]);

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
        if (isPlaceholderCandidate({ id_number: a, surname: b, first_name: c })) continue;
        parsed.push({ id_number: a, surname: b, first_name: c });
      }
      if (!parsed.length) { toast.error("No candidate rows found. Use Column A=ID, B=Surname, C=First Name."); return; }
      setBatchRows(parsed);
      toast.success(`${parsed.length} candidate(s) loaded`);
    } catch (e) {
      toast.error("Failed to read spreadsheet: " + (e as Error).message);
    }
  };

  const findPreviousChecks = async (
    cands: Array<{ id_number: string; surname: string; first_name: string }>,
  ) => {
    const ids = Array.from(new Set(cands.map((c) => c.id_number.trim()).filter(Boolean)));
    if (!ids.length) return [];
    const { data, error } = await sb
      .from("manual_risk_candidates")
      .select("id_number, first_name, surname, submission_id, created_at")
      .in("id_number", ids);
    if (error || !data?.length) return [];
    const prior = (data as any[]).filter((c) => !isPlaceholderCandidate(c));
    if (!prior.length) return [];
    const subIds = Array.from(new Set(prior.map((c) => c.submission_id)));
    const { data: subs } = await sb
      .from("manual_risk_submissions")
      .select("id, order_number, client_id, created_at")
      .in("id", subIds);
    const subMap = new Map((subs ?? []).map((s: any) => [s.id, s]));
    return ids
      .map((id) => {
        const hits = prior.filter((c) => c.id_number.trim() === id);
        if (!hits.length) return null;
        const incoming = cands.find((c) => c.id_number.trim() === id);
        return {
          id_number: id,
          name: `${incoming?.first_name ?? ""} ${incoming?.surname ?? ""}`.trim(),
          previous: hits.map((h) => {
            const s: any = subMap.get(h.submission_id);
            return {
              name: `${h.first_name ?? ""} ${h.surname ?? ""}`.trim(),
              orderNumber: s?.order_number ?? "—",
              clientName: s?.client_id ? clients.find((cl) => cl.id === s.client_id)?.client_name ?? "Unknown" : "Unassigned",
              date: s?.created_at ? new Date(s.created_at).toLocaleDateString() : "—",
            };
          }),
        };
      })
      .filter(Boolean) as NonNullable<typeof dupes>;
  };

  const submit = async (force = false) => {
    if (!orderNumber.trim()) { toast.error("Order number is required"); return; }
    if (!selectedChecks.length) { toast.error("Select at least one check"); return; }

    const preCandidates = type === "single"
      ? [singleC].filter((c) => c.id_number && c.surname && c.first_name)
      : batchRows;
    if (!preCandidates.length) { toast.error("Add at least one candidate"); return; }
    if (!force) {
      setDupChecking(true);
      try {
        const found = await findPreviousChecks(preCandidates);
        if (found.length) { setDupes(found); return; }
      } finally {
        setDupChecking(false);
      }
    }

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
            cc_emails: newClient.cc_emails?.trim() || null,
            created_by: userId,
          })
          .select("id").single();
        if (error) { toast.error(error.message); return; }
        resolvedClientId = data.id;
        // Seed the address book for the brand-new client
        const seedRows = dedupeEmails([
          newClient.email?.trim() ?? "",
          ...(newClient.cc_emails?.split(",") ?? []),
        ]).map((email, i) => ({
          client_id: data.id,
          name: i === 0 ? (newClient.contact_person?.trim() || null) : null,
          email: email.toLowerCase(),
          is_default: true,
        }));
        if (seedRows.length) await sb.from("manual_risk_contacts").insert(seedRows);
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
          recipients: recipients.filter((r) => r.email?.trim()),
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

      // Fire-and-forget confirmation email to the client
      try {
        if (!sendConfirmation) {
          // Admin opted out of sending the confirmation email
        } else {
        const resolvedClient =
          clientMode === "existing"
            ? clients.find((c) => c.id === resolvedClientId)
            : clientMode === "new"
              ? {
                  client_name: newClient.client_name?.trim() ?? null,
                  contact_person: newClient.contact_person?.trim() ?? null,
                  email: newClient.email?.trim() ?? null,
                  cc_emails: newClient.cc_emails?.trim() ?? null,
                }
              : null;
        const routed = routeRecipients(recipients);
        const toEmail = mailTo.trim() || routed.to || resolvedClient?.email?.trim();
        if (toEmail) {
          const emailCandidates = candidates.map((c) => ({
            first_name: c.first_name.trim(),
            surname: c.surname.trim(),
            id_number: c.id_number.trim(),
          }));
          const { error: mailErr } = await sb.functions.invoke("send-submission-confirmation", {
            body: {
              to: toEmail,
              cc: dedupeEmails(mailCc.split(/[,;\s]+/)),
              orderNumber: orderNumber.trim(),
              clientName: resolvedClient?.client_name ?? undefined,
              contactName: mailName.trim() || routed.toName || resolvedClient?.contact_person || undefined,
              subject: mailSubject.trim() || undefined,
              message: mailMessage.trim() || undefined,
              candidates: emailCandidates,
            },
          });
          if (mailErr) {
            toast.error("Submission saved, but confirmation email failed: " + mailErr.message);
          } else {
            toast.success("Confirmation email sent to client");
          }
        }
        }
      } catch (e) {
        toast.error("Submission saved, but confirmation email failed: " + (e as Error).message);
      }
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
                <div className="space-y-3">
                  <Select value={clientId} onValueChange={(v) => { setClientId(v); setRecipients([]); }}>
                    <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {clientId && (
                    <RecipientPicker
                      clientId={clientId}
                      value={recipients}
                      onChange={setRecipients}
                      fallbackEmail={clients.find((c) => c.id === clientId)?.email}
                      fallbackName={clients.find((c) => c.id === clientId)?.contact_person}
                    />
                  )}
                </div>
              )}

              {clientMode === "new" && (
                <div className="space-y-2 border p-3 rounded-md">
                  <Input placeholder="Client name *" value={newClient.client_name ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, client_name: e.target.value }))} />
                  <Input placeholder="Contact person" value={newClient.contact_person ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, contact_person: e.target.value }))} />
                  <Input placeholder="Email" value={newClient.email ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="CC emails (comma-separated)" value={newClient.cc_emails ?? ""}
                    onChange={(e) => setNewClient((p) => ({ ...p, cc_emails: e.target.value }))} />
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




            <div className="border-t pt-4">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={sendConfirmation}
                  onCheckedChange={(v) => setSendConfirmation(!!v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Send confirmation email to the client</span>
                  <span className="block text-xs text-muted-foreground">
                    Sends the submission-received notification to the email(s) on file for this account. Untick to skip.
                  </span>
                </span>
              </label>
            </div>

            {sendConfirmation && (
              <div className="space-y-3 border rounded-md p-3 bg-gray-50">
                <div className="text-sm font-medium">Confirmation Email Preview</div>
                <p className="text-xs text-muted-foreground">
                  Review and edit before the submission is created and the email is sent.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">To (email)</Label>
                    <Input value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="client@example.com" />
                  </div>
                  <div>
                    <Label className="text-xs">Recipient name (used in greeting)</Label>
                    <Input value={mailName} onChange={(e) => setMailName(e.target.value)} placeholder="e.g. Jane Smith" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">CC (comma-separated)</Label>
                  <Input value={mailCc} onChange={(e) => setMailCc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Additional message (optional)</Label>
                  <Textarea
                    rows={3}
                    value={mailMessage}
                    onChange={(e) => setMailMessage(e.target.value)}
                    placeholder="Added just below the greeting."
                  />
                </div>
                <div className="rounded border bg-white p-3 text-xs leading-relaxed text-gray-700">
                  <p className="mb-2">Good day {mailName.trim() || "[recipient]"},</p>
                  {mailMessage.trim() && <p className="mb-2 whitespace-pre-wrap">{mailMessage.trim()}</p>}
                  <p className="mb-2">Your background screening submission has been received and submitted successfully.</p>
                  <p className="mb-2">
                    We are now awaiting verification confirmation on the below listed candidate/s. Once received, the
                    results will be sent to you. You should receive final feedback within 24 to 48 working hours.
                  </p>
                  <p className="text-muted-foreground">
                    Candidate list ({type === "single" ? (singleC.id_number ? 1 : 0) : batchRows.length}), order number
                    and client details are added automatically.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => submit()} className="bg-red-600 hover:bg-red-700" disabled={busy || dupChecking}>
                {busy ? "Creating..." : dupChecking ? "Checking history..." : "Create Submission"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {dupes && (
          <Dialog open onOpenChange={(v) => !v && setDupes(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-amber-700">Previous check(s) found</DialogTitle>
                <DialogDescription>
                  {dupes.length} candidate ID number(s) in this submission have already been checked before.
                  You can still proceed if a new check is required.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {dupes.map((d) => (
                  <div key={d.id_number} className="border rounded-md p-3 bg-amber-50/60">
                    <div className="font-medium text-sm">
                      {d.name || "Candidate"} — <span className="font-mono">{d.id_number}</span>
                    </div>
                    <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                      {d.previous.map((p, i) => (
                        <li key={i}>
                          {p.name} • Order {p.orderNumber} • {p.clientName} • {p.date}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDupes(null)}>Cancel</Button>
                <Button
                  className="bg-red-600 hover:bg-red-700"
                  disabled={busy}
                  onClick={() => { setDupes(null); submit(true); }}
                >
                  Proceed anyway
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Submission details / results dialog ----------

function SubmissionDetailsDialog({
  submissionId, onClose, clients, userName, onChanged, onSent,
}: {
  submissionId: string; onClose: () => void;
  clients: Client[]; userName: string;
  onChanged: () => void;
  onSent?: () => void;
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
  const [ccEmails, setCcEmails] = useState("Admin@tldv.co.za");
  const [emailToName, setEmailToName] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [editChecksOpen, setEditChecksOpen] = useState(false);
  const [pendingChecks, setPendingChecks] = useState<string[]>([]);
  const [savingChecks, setSavingChecks] = useState(false);

  useEffect(() => { setLocal(candidates.filter((c) => !isPlaceholderCandidate(c))); }, [candidates]);

  const client = sub?.client_id ? clients.find((c) => c.id === sub.client_id) : undefined;
  // Prefer the recipients captured when the submission was created, so the
  // report goes to exactly the same people as the confirmation email.
  const savedRouted = useMemo(() => routeRecipients(sub?.recipients), [sub?.recipients]);
  useEffect(() => {
    const to = savedRouted.to || client?.email || "";
    if (to) setEmailTo(to);
  }, [savedRouted.to, client?.email]);
  // Greeting name follows whichever recipient is in the "To" field.
  useEffect(() => {
    const match = (sub?.recipients ?? []).find(
      (r) => r?.email?.trim().toLowerCase() === emailTo.trim().toLowerCase(),
    );
    setEmailToName(
      match?.name?.trim() || savedRouted.toName || client?.contact_person?.trim() || "",
    );
  }, [emailTo, sub?.recipients, savedRouted.toName, client?.contact_person]);
  useEffect(() => {
    const extras = savedRouted.to
      ? savedRouted.cc
      : (client?.cc_emails?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
    setCcEmails(dedupeEmails(["Admin@tldv.co.za", ...extras]).join(", "));
  }, [savedRouted.to, savedRouted.cc, client?.cc_emails]);

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
      await recomputeSubmissionStatus(submissionId);
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
      return {
        id_number: c.id_number,
        surname: c.surname,
        first_name: c.first_name,
        results,
        notes,
        id_verification_data: (c as any).id_verification_data ?? null,
      };
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
      const clientEmail = (emailTo || client?.email || "").trim();
      if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        toast.error("A valid recipient email is required to send the report");
        setSending(false);
        return;
      }

      const ccList = ccEmails
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const invalidCc = ccList.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (invalidCc.length) {
        toast.error(`Invalid CC email(s): ${invalidCc.join(", ")}`);
        setSending(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-manual-risk-report", {
        body: {
          message: emailMsg, pdfBase64: base64,
          filename: `PreAppliCheck-Report-${sub?.order_number ?? "report"}.pdf`,
          orderNumber: sub?.order_number,
          clientName: client?.client_name ?? null,
          contactName: emailToName.trim() || client?.contact_person || null,
          to: clientEmail,
          cc: ccList,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Mirror the Background Screening Report to OneDrive (internal + client-shared)
      let od: OneDriveUploadResult = { webUrl: null, itemId: null, fullPath: null };
      let odShared: OneDriveUploadResult = { webUrl: null, itemId: null, fullPath: null };
      const reportArgs = {
        fileName: `PreAppliCheck-Report-${sub?.order_number ?? "report"}.pdf`,
        base64,
        contentType: "application/pdf",
        clientName: client?.client_name,
        orderNumber: sub?.order_number ?? "",
        kind: "report" as const,
      };
      try {
        od = await uploadToOneDrive(reportArgs);
      } catch (e) {
        toast.warning(`Report emailed, but OneDrive save failed: ${(e as Error).message}`);
      }
      try {
        odShared = await uploadToOneDrive({ ...reportArgs, shared: true });
      } catch (e) {
        toast.warning(`Client-shared OneDrive copy failed: ${(e as Error).message}`);
      }

      // Mark submission as sent so it moves to Accounts tab
      await sb
        .from("manual_risk_submissions")
        .update({
          sent_at: new Date().toISOString(),
          report_onedrive_web_url: od.webUrl,
          report_onedrive_item_id: od.itemId,
          report_onedrive_path: od.fullPath,
          report_shared_onedrive_web_url: odShared.webUrl,
          report_shared_onedrive_item_id: odShared.itemId,
          report_shared_onedrive_path: odShared.fullPath,
        })
        .eq("id", submissionId);
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      onChanged();
      toast.success(
        ccList.length
          ? `Report sent to ${clientEmail} (CC: ${ccList.join(", ")})`
          : `Report sent to ${clientEmail}`,
      );
      setEmailOpen(false); setEmailMsg("");
      onClose();
      onSent?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const openEditChecks = () => {
    setPendingChecks(activeChecks.slice());
    setEditChecksOpen(true);
  };

  const saveCheckSelection = async () => {
    if (!pendingChecks.length) { toast.error("Select at least one check"); return; }
    setSavingChecks(true);
    try {
      const before = new Set(activeChecks);
      const after = new Set(pendingChecks);
      const removed = [...before].filter((k) => !after.has(k));

      // Clear result/notes columns for checks that were removed, so stale data
      // from the wrong check doesn't linger on candidates.
      if (removed.length) {
        const clearPatch: Record<string, any> = {};
        for (const k of removed) {
          const cols = CHECK_COLUMNS[k];
          if (!cols) continue;
          clearPatch[cols.result] = null;
          clearPatch[cols.notes] = null;
        }
        if (Object.keys(clearPatch).length) {
          const { error: candErr } = await sb
            .from("manual_risk_candidates")
            .update(clearPatch)
            .eq("submission_id", submissionId);
          if (candErr) throw candErr;
        }
      }

      // If the submission was already marked completed but the new selection now
      // includes an unfilled check, revert status to "open" so results can be captured.
      const nextStatus =
        sub?.status === "completed" && removed.length !== pendingChecks.length
          ? "open"
          : sub?.status;

      const { error } = await sb
        .from("manual_risk_submissions")
        .update({
          requested_checks: pendingChecks,
          ...(nextStatus && nextStatus !== sub?.status ? { status: nextStatus } : {}),
        })
        .eq("id", submissionId);
      if (error) throw error;

      toast.success("Check selection updated");
      setEditChecksOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["mra-sub", submissionId] });
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingChecks(false);
    }
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

        {/* Record trail: what happened when, and who did it */}
        <div className="border rounded-md p-3 mb-3 text-xs bg-muted/20 grid gap-1 sm:grid-cols-2">
          <div><span className="text-muted-foreground">Submission captured: </span>{new Date(sub.created_at).toLocaleString("en-ZA")}</div>
          <div>
            <span className="text-muted-foreground">Sent for screening: </span>
            {sub.sent_to_supplier_at ? new Date(sub.sent_to_supplier_at).toLocaleString("en-ZA") : "not recorded yet"}
          </div>
          <div>
            <span className="text-muted-foreground">Consent form(s) uploaded: </span>
            {(sub.indemnity_files ?? []).length
              ? (sub.indemnity_files ?? []).map((f) =>
                  `${new Date(f.uploaded_at).toLocaleDateString("en-ZA")}${f.uploaded_by_name ? ` by ${f.uploaded_by_name}` : ""}`,
                ).join(", ")
              : "none"}
          </div>
          <div>
            <span className="text-muted-foreground">Provider report(s) uploaded: </span>
            {(sub.supplier_report_files ?? []).length
              ? (sub.supplier_report_files ?? []).map((f) =>
                  `${new Date(f.uploaded_at).toLocaleDateString("en-ZA")}${f.uploaded_by_name ? ` by ${f.uploaded_by_name}` : ""}`,
                ).join(", ")
              : "none"}
          </div>
          <div>
            <span className="text-muted-foreground">Report released to client: </span>
            {sub.sent_at ? new Date(sub.sent_at).toLocaleString("en-ZA") : "not yet"}
          </div>
          {sub.compliance_flag && (
            <div className="text-red-600 font-medium">Flagged for review: {sub.compliance_flag.replace(/_/g, " ")}</div>
          )}
        </div>


        <IndemnitySection
          submissionId={submissionId}
          submission={sub}
          clientName={client?.client_name ?? null}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["mra-sub", submissionId] });
            qc.invalidateQueries({ queryKey: ["mra-submissions"] });
            onChanged();
          }}
        />

        <SupplierReportSection
          submissionId={submissionId}
          submission={sub}
          candidates={local}
          clientName={client?.client_name ?? null}
          onChanged={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["mra-sub", submissionId] });
            qc.invalidateQueries({ queryKey: ["mra-submissions"] });
            onChanged();
          }}
        />

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
                          onValue={(v) => {
                            const patch: Record<string, unknown> = { [cols.result]: v };
                            // A risk assessment is only valid when the ID is valid.
                            if (k === "id_verification" && activeChecks.includes("risk_assessment")) {
                              if (v === "invalid" || v === "deceased") {
                                patch.risk_assessment_result = "invalid";
                                patch.risk_assessment_notes =
                                  "Risk Assessment invalid — ID verification could not be confirmed.";
                              } else if (c.risk_assessment_result === "invalid") {
                                patch.risk_assessment_result = "pending";
                                patch.risk_assessment_notes = null;
                              }
                            }
                            updateRow(idx, patch as any);
                          }}
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
          <Button
            variant="outline"
            onClick={openEditChecks}
            title="Change which checks are requested for this submission (fix wrong check selection)"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Edit Check Selection
          </Button>
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
                <Label>Recipient (To)</Label>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <Label>Recipient name (used in greeting)</Label>
                <Input
                  value={emailToName}
                  onChange={(e) => setEmailToName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-filled from the address book entry for the "To" address.
                </p>
              </div>
              <div>
                <Label>CC (comma-separated, optional)</Label>
                <Input
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="e.g. Admin@tldv.co.za, manager@example.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to send with no CC. Separate multiple addresses with commas.
                </p>
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

        <Dialog open={editChecksOpen} onOpenChange={setEditChecksOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Check Selection</DialogTitle>
              <DialogDescription>
                Correct the checks requested for this submission. Removing a check
                will clear any captured results/notes for that check on every candidate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              {Object.keys(CHECK_META)
                .filter((k) => CHECK_COLUMNS[k])
                .map((k) => {
                  const checked = pendingChecks.includes(k);
                  return (
                    <label key={k} className="flex items-center gap-2 rounded border px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setPendingChecks((prev) =>
                            v ? [...prev, k] : prev.filter((x) => x !== k),
                          );
                        }}
                      />
                      <span className="text-sm">{CHECK_META[k].label}</span>
                    </label>
                  );
                })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditChecksOpen(false)}>Cancel</Button>
              <Button onClick={saveCheckSelection} disabled={savingChecks} className="bg-red-600 hover:bg-red-700">
                {savingChecks ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function IndemnitySection({
  submissionId, submission, clientName, onChanged,
}: {
  submissionId: string;
  submission: Submission;
  clientName: string | null;
  onChanged: () => void;
}) {
  const files: IndemnityFile[] = Array.isArray(submission.indemnity_files) ? submission.indemnity_files : [];
  const [uploading, setUploading] = useState(false);

  const handleAdd = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    try {
      const added: IndemnityFile[] = [];
      for (const f of Array.from(list)) {
        try {
          const meta = await uploadIndemnity(f, submissionId, submission.order_number, clientName);
          added.push(meta);
        } catch (e) {
          toast.error(`Failed "${f.name}": ${(e as Error).message}`);
        }
      }
      if (added.length) {
        const next = [...files, ...added];
        const { error } = await sb
          .from("manual_risk_submissions")
          .update({ indemnity_files: next })
          .eq("id", submissionId);
        if (error) throw error;
        toast.success(`${added.length} indemnity file(s) added`);
        onChanged();
      }
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (f: IndemnityFile) => {
    const { data, error } = await supabase.storage
      .from("manual-risk-indemnities")
      .createSignedUrl(f.path, 300);
    if (error) { toast.error(error.message); return; }
    void logRecordAccess({ submissionId, action: "view_consent", detail: f.name });
    window.open(data.signedUrl, "_blank");
  };


  const handleDelete = async (f: IndemnityFile) => {
    if (!confirm(`Delete indemnity "${f.name}"? This removes it from storage and OneDrive.`)) return;
    try {
      await supabase.storage.from("manual-risk-indemnities").remove([f.path]);
      await deleteFromOneDrive(f.onedrive_item_id);
      await deleteFromOneDrive(f.shared_onedrive_item_id);
      const next = files.filter((x) => x.path !== f.path);
      const { error } = await sb
        .from("manual_risk_submissions")
        .update({ indemnity_files: next })
        .eq("id", submissionId);
      if (error) throw error;
      toast.success("Indemnity deleted");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="border rounded-md p-3 mb-3 bg-muted/30">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Indemnity Forms ({files.length})
          </div>
          <p className="text-xs text-muted-foreground">
            Stays with this submission and stored in OneDrive. Never included in the emailed report.
          </p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept="application/pdf,.pdf,image/*"
            multiple
            disabled={uploading}
            onChange={(e) => { handleAdd(e.target.files); e.currentTarget.value = ""; }}
          />
          <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Add Indemnity"}
          </span>
        </label>
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No indemnity forms uploaded yet.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center justify-between border rounded bg-background px-2 py-1 text-sm">
              <div className="min-w-0 flex-1 truncate">
                <span className="truncate">{f.name}</span>
                {f.onedrive_web_url && (
                  <a
                    href={f.onedrive_web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-xs text-red-600 hover:underline"
                  >
                    OneDrive ↗
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title="View" onClick={() => handleView(f)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(f)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Recompute a submission's open/completed status from the current candidate results.
async function recomputeSubmissionStatus(submissionId: string) {
  const { data: sub } = await sb
    .from("manual_risk_submissions")
    .select("requested_checks, status")
    .eq("id", submissionId)
    .maybeSingle();
  const { data: cands } = await sb
    .from("manual_risk_candidates")
    .select("*")
    .eq("submission_id", submissionId);

  const checks = ((sub as any)?.requested_checks?.length
    ? (sub as any).requested_checks
    : ["id_verification", "credit", "criminal"]
  ).filter((k: string) => CHECK_COLUMNS[k]);

  const rows = (cands ?? []).filter((c: any) => !isPlaceholderCandidate(c));
  const allComplete =
    rows.length > 0 &&
    rows.every((c: any) =>
      checks.every((k: string) => {
        const v = c[CHECK_COLUMNS[k].result];
        return v && v !== "pending";
      }),
    );

  const next = allComplete ? "completed" : "open";
  if ((sub as any)?.status !== next) {
    await sb.from("manual_risk_submissions").update({ status: next }).eq("id", submissionId);
  }
}

function SupplierReportSection({
  submissionId, submission, candidates, clientName, onChanged,
}: {
  submissionId: string;
  submission: Submission;
  candidates: Candidate[];
  clientName: string | null;
  onChanged: () => void;
}) {
  const files: SupplierReportFile[] = Array.isArray(submission.supplier_report_files)
    ? submission.supplier_report_files
    : [];
  const [processing, setProcessing] = useState(false);

  // Apply extracted supplier records to this submission's candidates.
  // Returns how many candidates matched, plus the extracted names that matched nothing.
  const applyRecords = async (
    allRecords: SupplierIdRecord[],
    allExtracted: Set<string>,
    sourceLabel: string,
  ) => {
    let matched = 0;
    const usedPrefixes = new Set<string>();
    for (const c of candidates) {
      if (isPlaceholderCandidate(c as any)) continue;
      const candDigits = (c.id_number || "").replace(/\D/g, "");
      const candPrefix = candDigits.slice(0, 6);
      if (!/^\d{6}$/.test(candPrefix)) continue;
      const rec =
        allRecords.find((r) => r.id_prefix === candPrefix) ||
        (allExtracted.has(candDigits)
          ? ({ id_prefix: candPrefix, status: "Confirmed" } as SupplierIdRecord)
          : undefined);
      if (!rec) continue;
      usedPrefixes.add(candPrefix);
      const statusText = String(rec.status ?? "");
      const negative =
        /not\s*confirm|unconfirm|no\s*result|invalid|not\s*found|fail|unable|error|deceased|decease/i.test(
          statusText,
        );
      const confirmed =
        !negative && /confirm|complete|verified|\bvalid\b|match/i.test(statusText);
      const result = confirmed ? "valid" : "invalid";
      const noteParts = [
        `Matched supplier report ${sourceLabel} on ID prefix ${candPrefix}`,
        rec.status ? `Status: ${rec.status}` : null,
      ].filter(Boolean);
      const actor = await currentActor();
      const update: Record<string, unknown> = {
        id_verification_result: result,
        id_verification_notes: noteParts.join(" • "),
        id_verification_data: rec as unknown as Record<string, unknown>,
        outcome_extracted_at: new Date().toISOString(),
        outcome_extracted_by: actor.id || null,
        outcome_extracted_by_name: actor.name || null,
        outcome_extracted_source: `Supplier report: ${sourceLabel}`,
      };

      // Auto-populate Risk Assessment outcome from supplier's Risk Assessment Check.
      const raText = String(rec.risk_assessment ?? "");
      if (result === "invalid") {
        // A risk assessment can only be relied on when the ID itself is valid.
        update.risk_assessment_result = "invalid";
        update.risk_assessment_notes =
          `Risk Assessment invalid — ID verification could not be confirmed${raText ? ` (supplier risk assessment: ${raText})` : ""}.`;
      } else if (raText) {
        const isNoRisk = /no\s+further\s+investigation/i.test(raText);
        const isRisk = /further\s+investigation/i.test(raText) && !isNoRisk;
        if (isNoRisk || isRisk) {
          update.risk_assessment_result = isNoRisk ? "no_risk" : "risk_identified";
          update.risk_assessment_notes = `Auto-populated from supplier report ${sourceLabel}: ${raText}`;
        }
      }
      const { error: uErr } = await sb
        .from("manual_risk_candidates")
        .update(update)
        .eq("id", c.id);
      if (!uErr) matched++;
    }

    await recomputeSubmissionStatus(submissionId);

    const unmatched = allRecords
      .filter((r) => r.id_prefix && !usedPrefixes.has(String(r.id_prefix)))
      .map((r) => `${r.first_names ?? ""} ${r.surname ?? ""} (${r.id_prefix})`.trim());

    if (matched === 0) {
      toast.error(
        allRecords.length
          ? `No candidate on this submission matched the report. The report contains: ${unmatched.join(", ")}. Check that the correct supplier report was uploaded.`
          : "No ID verification records could be read from this report — nothing was auto-filled.",
        { duration: 12000 },
      );
    } else if (unmatched.length) {
      toast.warning(
        `${matched} candidate(s) auto-verified. Not on this submission: ${unmatched.join(", ")}`,
        { duration: 10000 },
      );
    }
    return { matched, unmatched };
  };

  const handleAdd = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setProcessing(true);
    try {
      const added: SupplierReportFile[] = [];
      const allExtracted = new Set<string>();
      const allRecords: SupplierIdRecord[] = [];
      for (const f of Array.from(list)) {
        try {
          let ids: string[] = [];
          let records: SupplierIdRecord[] = [];
          if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
            try {
              const res = await extractSupplierRecordsFromPdf(f);
              ids = res.ids;
              records = res.records;
            } catch (e) { console.error("PDF extract failed", e); }
          }
          ids.forEach((i) => allExtracted.add(i));
          records.forEach((r) => allRecords.push(r));
          const meta = await uploadSupplierReport(f, submissionId, submission.order_number, clientName, ids);
          added.push(meta);
        } catch (e) {
          toast.error(`Failed "${f.name}": ${(e as Error).message}`);
        }
      }
      if (added.length) {
        const next = [...files, ...added];
        const { error } = await sb
          .from("manual_risk_submissions")
          .update({ supplier_report_files: next })
          .eq("id", submissionId);
        if (error) throw error;

        // Fully automatic ID verification. Supplier reports mask most of the ID,
        // so match candidates by the first 6 digits (date-of-birth prefix).
        const { matched } = await applyRecords(
          allRecords,
          allExtracted,
          added.map((a) => a.name).join(", "),
        );

        toast.success(
          `${added.length} supplier report(s) uploaded. ${allRecords.length || allExtracted.size} record(s) extracted, ${matched} candidate(s) auto-verified.`,
        );
        onChanged();
      }
    } finally {
      setProcessing(false);
    }
  };

  // Re-read the already-uploaded supplier reports and re-apply the auto-match,
  // for cases where the first extraction failed or was uploaded before matching.
  const handleRematch = async () => {
    if (!files.length) return;
    setProcessing(true);
    try {
      const allExtracted = new Set<string>();
      const allRecords: SupplierIdRecord[] = [];
      for (const f of files) {
        const { data, error } = await supabase.storage
          .from("manual-risk-supplier-reports")
          .download(f.path);
        if (error || !data) { toast.error(`Could not read "${f.name}"`); continue; }
        const file = new File([data], f.name, { type: f.content_type || "application/pdf" });
        const res = await extractSupplierRecordsFromPdf(file);
        res.ids.forEach((i) => allExtracted.add(i));
        res.records.forEach((r) => allRecords.push(r));
      }
      const { matched } = await applyRecords(
        allRecords,
        allExtracted,
        files.map((f) => f.name).join(", "),
      );
      if (matched > 0) toast.success(`${matched} candidate(s) auto-verified from the stored report(s).`);
      onChanged();
    } finally {
      setProcessing(false);
    }
  };


  const handleView = async (f: SupplierReportFile) => {
    const { data, error } = await supabase.storage
      .from("manual-risk-supplier-reports")
      .createSignedUrl(f.path, 300);
    if (error) { toast.error(error.message); return; }
    void logRecordAccess({ submissionId, action: "view_supplier_report", detail: f.name });
    window.open(data.signedUrl, "_blank");
  };


  const handleDelete = async (f: SupplierReportFile) => {
    if (!confirm(`Delete supplier report "${f.name}"? This removes it from storage and OneDrive.`)) return;
    try {
      await supabase.storage.from("manual-risk-supplier-reports").remove([f.path]);
      await deleteFromOneDrive(f.onedrive_item_id);
      const next = files.filter((x) => x.path !== f.path);
      const { error } = await sb
        .from("manual_risk_submissions")
        .update({ supplier_report_files: next })
        .eq("id", submissionId);
      if (error) throw error;
      toast.success("Supplier report deleted");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="border rounded-md p-3 mb-3 bg-muted/30">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Supplier Risk Reports ({files.length})
          </div>
          <p className="text-xs text-muted-foreground">
            Upload the Risk Assessment received from your service provider. Candidate ID numbers are
            extracted automatically and matching candidates are marked ID Verified.
          </p>
        </div>
        <div className="flex items-center gap-2">
        {files.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={processing}
            onClick={handleRematch}
            title="Re-read the uploaded report(s) and re-apply ID verification / risk outcomes"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${processing ? "animate-spin" : ""}`} /> Re-run extraction
          </Button>
        )}
        <label className="cursor-pointer">

          <input
            type="file"
            className="hidden"
            accept="application/pdf,.pdf"
            multiple
            disabled={processing}
            onChange={(e) => { handleAdd(e.target.files); e.currentTarget.value = ""; }}
          />
          <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            <Upload className="h-4 w-4" /> {processing ? "Processing..." : "Upload Supplier Report"}
          </span>
        </label>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No supplier reports uploaded yet.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.path} className="flex items-center justify-between border rounded bg-background px-2 py-1 text-sm gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="truncate font-medium">{f.name}</span>
                  {f.onedrive_web_url && (
                    <a
                      href={f.onedrive_web_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-xs text-red-600 hover:underline"
                    >
                      OneDrive ↗
                    </a>
                  )}
                </div>
                {f.extracted_id_numbers && f.extracted_id_numbers.length > 0 && (
                  <div className="text-xs text-muted-foreground truncate">
                    Extracted IDs: {f.extracted_id_numbers.join(", ")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" title="View" onClick={() => handleView(f)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(f)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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

/** Which date a time-window filter applies to. */
type DateBasis = "submitted" | "sent";

type AccountRow = {
  submissionId: string;
  candidateId: string;
  orderNumber: string;
  sentAt: string;
  /** When the submission itself was created (may differ from the release date). */
  submittedAt: string;
  invoicedAt: string | null;
  invoiceNumber: string | null;
  invoiceFilePath: string | null;
  idNumber: string;
  surname: string;
  firstName: string;
  isTldvInternal: boolean;
  isPtvsDiscount: boolean;
  overrideClientId: string | null;
  originalClientId: string | null;
  /** Candidate's original position within its submission (for stable sorting). */
  sortOrder: number;
  /** ID verification outcome (raw value, e.g. "valid"/"invalid"/"pending"). */
  idResult: string | null;
  /** Adverse findings across the other requested checks. */
  riskFlags: { key: string; label: string; result: string }[];
  /** Checks that were requested but still have no captured outcome. */
  pendingChecks: number;
  /** Mirrored PTVS-discount check shown for invoicing only — not counted here. */
  isMirror?: boolean;
  mirrorFrom?: string;
};

/** Result values that count as an adverse / risk finding per check. */
const ADVERSE_RESULTS: Record<string, string[]> = {
  credit: ["medium", "high", "very_high"],
  criminal: ["record_found"],
  risk_assessment: ["risk_identified", "invalid"],
  drivers_license: ["invalid", "expired"],
  pdp: ["invalid", "expired"],
  qualification: ["not_verified"],
  id_verification: ["invalid", "deceased"],
};

function resultLabel(checkKey: string, value: string): string {
  return CHECK_META[checkKey]?.options.find((o) => o.v === value)?.l ?? value;
}

/** Derives ID validity + risk findings for a candidate row. */
function summariseCandidateChecks(candidate: any, requestedChecks: string[] | null) {
  const active = (requestedChecks?.length ? requestedChecks : ["id_verification", "credit", "criminal"])
    .filter((k) => CHECK_COLUMNS[k]);
  const idResult: string | null = candidate[CHECK_COLUMNS.id_verification.result] ?? null;
  const riskFlags: { key: string; label: string; result: string }[] = [];
  let pendingChecks = 0;
  for (const k of active) {
    const val = candidate[CHECK_COLUMNS[k].result] as string | null;
    if (!val || val === "pending") { pendingChecks++; continue; }
    if ((ADVERSE_RESULTS[k] ?? []).includes(val)) {
      riskFlags.push({ key: k, label: CHECK_META[k]?.short ?? k, result: resultLabel(k, val) });
    }
  }
  return { idResult, riskFlags, pendingChecks };
}

function renderIdStatus(r: AccountRow) {
  if (!r.idResult || r.idResult === "pending") {
    return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
  }
  if (r.idResult === "valid") {
    return <Badge className="bg-emerald-600 text-[10px]">Valid</Badge>;
  }
  return (
    <Badge className="bg-red-600 text-[10px]">{resultLabel("id_verification", r.idResult)}</Badge>
  );
}

function renderRiskStatus(r: AccountRow) {
  if (r.riskFlags.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {r.riskFlags.map((f) => (
          <Badge key={f.key} className="bg-red-600 text-[10px]" title={`${CHECK_META[f.key]?.label ?? f.key}: ${f.result}`}>
            {f.label}: {f.result}
          </Badge>
        ))}
      </div>
    );
  }
  if (r.pendingChecks > 0) {
    return <Badge variant="outline" className="text-[10px]">{r.pendingChecks} pending</Badge>;
  }
  return <Badge className="bg-emerald-600 text-[10px]">No risk identified</Badge>;
}

/** Rebuilds the report PDF that was sent to the client for a given submission. */
async function buildSentReportBlob(
  submissionId: string,
  clients: Client[],
  userName: string,
  opts: { encrypted?: boolean } = {},
): Promise<{ blob: Blob; orderNumber: string }> {
  const [{ data: sub, error: subErr }, { data: cands, error: candErr }, { data: settings }] = await Promise.all([
    sb.from("manual_risk_submissions").select("*").eq("id", submissionId).maybeSingle(),
    sb.from("manual_risk_candidates").select("*").eq("submission_id", submissionId)
      .order("sort_order", { ascending: true }),
    sb.from("manual_risk_settings").select("terms_and_conditions").limit(1).maybeSingle(),
  ]);
  if (subErr) throw subErr;
  if (candErr) throw candErr;
  if (!sub) throw new Error("Submission not found");

  // Historical archive submissions have the original report stored as a file:
  // show that exact document instead of regenerating one.
  if ((sub as any).is_archive && (sub as any).archive_report_path) {
    const { data: file, error: dlErr } = await sb.storage
      .from("archive-reports")
      .download((sub as any).archive_report_path);
    if (dlErr || !file) throw dlErr ?? new Error("Archived report unavailable");
    return { blob: file, orderNumber: sub.order_number };
  }


  const client = sub.client_id ? clients.find((c) => c.id === sub.client_id) : undefined;
  const activeChecks = (sub.requested_checks?.length
    ? sub.requested_checks
    : ["id_verification", "credit", "criminal"]
  ).filter((k: string) => CHECK_COLUMNS[k]);

  const pdfCandidates: ManualRiskCandidatePdf[] = (cands ?? [])
    .filter((c: any) => !isPlaceholderCandidate(c))
    .map((c: any) => {
      const results: Record<string, string | null> = {};
      const notes: Record<string, string | null> = {};
      for (const k of activeChecks) {
        results[k] = c[CHECK_COLUMNS[k].result] ?? null;
        notes[k] = c[CHECK_COLUMNS[k].notes] ?? null;
      }
      return {
        id_number: c.id_number,
        surname: c.surname,
        first_name: c.first_name,
        results,
        notes,
        id_verification_data: c.id_verification_data ?? null,
      };
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
    skipEncryption: !opts.encrypted,
  });
  return { blob, orderNumber: sub.order_number };
}


/** The Polygraph & Truth Verification Services account (PTVS discount mirror target). */
function findPtvsClient(clients: Client[]): Client | null {
  return (
    clients.find((c) => /polygraph.*truth.*verification/i.test(c.client_name)) ??
    clients.find((c) => /\bptvs\b/i.test(c.client_name)) ??
    null
  );
}

function AccountsTab({
  submissions, clients, onChanged, userName, clientFacing = false,
}: {
  submissions: Submission[];
  clients: Client[];
  onChanged: () => void;
  userName: string;
  clientFacing?: boolean;
}) {
  const [openClientId, setOpenClientId] = useState<string | "unassigned" | null>(null);
  const [openMode, setOpenMode] = useState<"live" | "archive">("live");
  const [highlightCandidateId, setHighlightCandidateId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();
  const searchActive = trimmedQuery.length >= 2;
  const [filterRegular, setFilterRegular] = useState(false);
  const [sortByRegular, setSortByRegular] = useState(false);

  // Time window: which checks (by submitted or sent date) to include everywhere
  // in this tab.
  const [dateBasis, setDateBasis] = useState<DateBasis>("submitted");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const windowActive = !!(fromDate || toDate);
  const applyPreset = (preset: "week" | "month" | "last-month" | "year") => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === "week") {
      const day = (now.getDay() + 6) % 7; // Monday-based
      const start = new Date(now); start.setDate(now.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
      setFromDate(fmt(start)); setToDate(fmt(end));
    } else if (preset === "month") {
      setFromDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (preset === "last-month") {
      setFromDate(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setToDate(fmt(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else {
      setFromDate(fmt(new Date(now.getFullYear(), 0, 1)));
      setToDate(fmt(new Date(now.getFullYear(), 11, 31)));
    }
  };
  const inWindow = (sub: Submission) => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const basis = dateBasis === "submitted" ? sub.created_at : sub.sent_at;
    if (!basis) return false;
    const ts = new Date(basis).getTime();
    if (from !== null && ts < from) return false;
    if (to !== null && ts > to) return false;
    return true;
  };

  // Current-system submissions (since the new portal went live) versus imported
  // historical archive records. Counts and invoicing only ever use the current
  // ones; archives are shown separately and stay searchable.
  const liveSubs = useMemo(() => submissions.filter((s) => !(s as any).is_archive), [submissions]);
  const archiveSubs = useMemo(() => submissions.filter((s) => !!(s as any).is_archive), [submissions]);
  const liveSubIds = useMemo(() => liveSubs.map((s) => s.id), [liveSubs]);

  // Load all NOT-YET-INVOICED candidates of current submissions so we can count
  // checks (per-candidate) and honor override_client_id when grouping them.
  // Invoiced checks live in the Invoiced tab and must not appear here.
  const { data: allCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["mra-accounts-all-cands", liveSubIds.join(",")],
    enabled: liveSubIds.length > 0,
    queryFn: async () => {
      const all: Candidate[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from("manual_risk_candidates")
          .select("*").in("submission_id", liveSubIds).is("invoice_batch_id", null)
          .range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as Candidate[]));
        if (!data || data.length < 1000) break;
      }
      return all.filter((c) => !isPlaceholderCandidate(c));
    },
  });

  // How many historical (archive) candidates sit under each account.
  const { data: archiveCountByClient = new Map<string, number>() } = useQuery<Map<string, number>>({
    queryKey: ["mra-accounts-archive-counts", archiveSubs.length],
    enabled: archiveSubs.length > 0,
    queryFn: async () => {
      const archiveSubMap = new Map(archiveSubs.map((s) => [s.id, s]));
      const counts = new Map<string, number>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from("manual_risk_candidates")
          .select("submission_id,override_client_id,id_number,surname,first_name")
          .range(from, from + 999);
        if (error) throw error;
        for (const c of (data ?? []) as any[]) {
          const s = archiveSubMap.get(c.submission_id);
          if (!s) continue;
          if (isPlaceholderCandidate(c)) continue;
          const key: string = c.override_client_id ?? s.client_id ?? "__unassigned__";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        if (!data || data.length < 1000) break;
      }
      return counts;
    },
  });

  // Search spans BOTH current submissions and the historical archive.
  const { data: searchCandidates = [], isFetching: searching } = useQuery<(Candidate & { submission_id: string })[]>({
    queryKey: ["mra-accounts-search", trimmedQuery],
    enabled: searchActive,
    queryFn: async () => {
      const q = trimmedQuery.replace(/[%,]/g, " ");
      const { data, error } = await sb.from("manual_risk_candidates")
        .select("*")
        .or(`first_name.ilike.%${q}%,surname.ilike.%${q}%,id_number.ilike.%${q}%`)
        .limit(300);
      if (error) throw error;
      return (data as Candidate[]).filter((c) => !isPlaceholderCandidate(c)) as any;
    },
  });

  const searchResults = useMemo(() => {
    return searchCandidates.map((c) => {
      const sub = submissions.find((s) => s.id === c.submission_id) || null;
      const effClientId = (c as any).override_client_id ?? sub?.client_id ?? null;
      const client = effClientId ? clients.find((cl) => cl.id === effClientId) ?? null : null;
      return { c, sub, client, isArchive: !!(sub as any)?.is_archive };
    }).filter((r) => r.sub);
  }, [searchCandidates, submissions, clients]);

  // Group by EFFECTIVE client (override_client_id on the candidate wins over
  // the submission's client_id) and count per-candidate.
  const groups = useMemo(() => {
    const subMap = new Map(submissions.map((s) => [s.id, s]));
    const m = new Map<string, { client: Client | null; candCount: number; discounted: number; subIds: Set<string> }>();
    const ensure = (key: string) => {
      if (!m.has(key)) {
        const client = key === "__unassigned__" ? null : clients.find((cl) => cl.id === key) ?? null;
        m.set(key, { client, candCount: 0, discounted: 0, subIds: new Set() });
      }
      return m.get(key)!;
    };
    // Accounts stay visible even when every check has been moved away or invoiced.
    for (const s of submissions) {
      if (s.client_id) ensure(s.client_id);
    }
    for (const c of allCandidates) {
      const sub = subMap.get(c.submission_id);
      if (!sub) continue;
      if (windowActive && !inWindow(sub)) continue;
      const effId: string = (c as any).override_client_id ?? sub.client_id ?? "__unassigned__";
      const g = ensure(effId);
      g.candCount += 1;
      if ((c as any).is_tldv_internal || (c as any).is_ptvs_discount) g.discounted += 1;
      g.subIds.add(sub.id);
    }
    // PTVS-discount checks are mirrored into the PTVS account for invoicing only.
    const ptvs = findPtvsClient(clients);
    let ptvsMirrored = 0;
    if (ptvs) {
      for (const c of allCandidates) {
        const sub = subMap.get(c.submission_id);
        if (!sub) continue;
        if (windowActive && !inWindow(sub)) continue;
        if (!(c as any).is_ptvs_discount) continue;
        const effId: string = (c as any).override_client_id ?? sub.client_id ?? "__unassigned__";
        if (effId !== ptvs.id) ptvsMirrored += 1;
      }
      if (ptvsMirrored > 0) ensure(ptvs.id);
    }
    return Array.from(m.entries()).map(([key, v]) => {
      return {
        key,
        client: v.client,
        name: v.client?.client_name ?? "Unassigned",
        isRegular: !!v.client?.is_regular,
        checkCount: v.candCount,
        archiveCount: archiveCountByClient.get(key) ?? 0,
        discounted: v.discounted,
        mirrored: ptvs && key === ptvs.id ? ptvsMirrored : 0,
      };
    }).sort((a, b) => {
      if (sortByRegular && a.isRegular !== b.isRegular) return a.isRegular ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [allCandidates, submissions, clients, sortByRegular, windowActive, fromDate, toDate, dateBasis, archiveCountByClient]);

  const visibleGroups = useMemo(
    () => (filterRegular ? groups.filter((g) => g.isRegular) : groups),
    [groups, filterRegular],
  );

  // Flat list of every check inside the selected time window, across all accounts.
  const windowRows = useMemo(() => {
    if (!windowActive) return [];
    const subMap = new Map(submissions.map((s) => [s.id, s]));
    return allCandidates
      .map((c) => {
        const sub = subMap.get(c.submission_id);
        if (!sub || !inWindow(sub)) return null;
        const effId: string = (c as any).override_client_id ?? sub.client_id ?? "__unassigned__";
        const clientName = effId === "__unassigned__"
          ? "Unassigned"
          : clients.find((cl) => cl.id === effId)?.client_name ?? "Unassigned";
        return {
          candidateId: c.id,
          clientKey: effId,
          clientName,
          orderNumber: sub.order_number,
          submittedAt: sub.created_at,
          sentAt: sub.sent_at,
          firstName: c.first_name,
          surname: c.surname,
          idNumber: c.id_number,
          isTldvInternal: !!(c as any).is_tldv_internal,
          isPtvsDiscount: !!(c as any).is_ptvs_discount,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) =>
        a.clientName.localeCompare(b.clientName) ||
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [allCandidates, submissions, clients, windowActive, fromDate, toDate, dateBasis]);

  const exportWindow = () => {
    if (!windowRows.length) { toast.error("No checks in this window"); return; }
    const wsData = [
      ["Client", "Order #", "Submitted", "Sent", "First Name", "Surname", "ID Number", "Discount", "PTVS"],
      ...windowRows.map((r) => [
        r.clientName, r.orderNumber,
        new Date(r.submittedAt).toLocaleDateString(),
        r.sentAt ? new Date(r.sentAt).toLocaleDateString() : "",
        r.firstName, r.surname, r.idNumber,
        r.isTldvInternal ? "100% (TLDV internal)" : "",
        r.isPtvsDiscount ? "PTVS discount" : "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checks in window");
    XLSX.writeFile(wb, `Checks_${dateBasis}_${fromDate || "start"}_to_${toDate || "today"}.xlsx`);
    toast.success(`Exported ${windowRows.length} check(s)`);
  };

  const totalChecks = windowActive ? windowRows.length : allCandidates.length;


  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {clientFacing
            ? `${totalChecks} check(s) across ${groups.length} account(s). Search by name, surname or ID number to find a candidate.`
            : `${totalChecks} un-invoiced check(s) across ${groups.length} client account(s). Each candidate counts as one check — invoiced checks move to the Invoiced tab.`}
        </p>
        <div className="flex-1" />
        {!clientFacing && (
          <>
            <div className="flex items-center gap-2">
              <Checkbox
                id="mra-filter-regular"
                checked={filterRegular}
                onCheckedChange={(v) => setFilterRegular(!!v)}
              />
              <label htmlFor="mra-filter-regular" className="text-xs cursor-pointer flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-500" /> Regulars only
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="mra-sort-regular"
                checked={sortByRegular}
                onCheckedChange={(v) => setSortByRegular(!!v)}
              />
              <label htmlFor="mra-sort-regular" className="text-xs cursor-pointer">
                Sort regulars first
              </label>
            </div>
          </>
        )}
      </div>

      <div className="mb-4 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Time window on</Label>
            <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as DateBasis)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="submitted">Submitted date</SelectItem>
                <SelectItem value="sent">Sent (released) date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => applyPreset("week")}>This week</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("month")}>This month</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("last-month")}>Last month</Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset("year")}>This year</Button>
          </div>
          {windowActive && (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>
              {!clientFacing && (
                <Button variant="outline" size="sm" onClick={exportWindow}>
                  <FileDown className="h-4 w-4 mr-2" /> Export window
                </Button>
              )}
            </>
          )}
        </div>
        {windowActive && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-2">
              {windowRows.length} check(s) with a {dateBasis === "submitted" ? "submitted" : "sent"} date
              between {fromDate || "the beginning"} and {toDate || "today"}.
            </p>
            <div className="max-h-72 overflow-auto rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>First name</TableHead>
                    <TableHead>Surname</TableHead>
                    <TableHead>ID number</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {windowRows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">No checks in this window.</TableCell></TableRow>
                  ) : windowRows.map((r) => (
                    <TableRow key={r.candidateId}>
                      <TableCell className="text-xs">{r.clientName}</TableCell>
                      <TableCell className="text-xs">{r.orderNumber}</TableCell>
                      <TableCell className="text-xs">{new Date(r.submittedAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-xs">{r.sentAt ? new Date(r.sentAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs">{r.firstName}</TableCell>
                      <TableCell className="text-xs">{r.surname}</TableCell>
                      <TableCell className="text-xs">{r.idNumber}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => {
                          setHighlightCandidateId(r.candidateId);
                          setOpenClientId(r.clientKey === "__unassigned__" ? "unassigned" : r.clientKey);
                        }}>
                          Open account
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4">
        <Label htmlFor="account-search" className="text-sm">Search candidates</Label>
        <Input
          id="account-search"
          placeholder="Type name, surname, or ID number…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mt-1"
        />
        {searchActive && (
          <div className="mt-3 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>First name</TableHead>
                  <TableHead>Surname</TableHead>
                  <TableHead>ID number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searching && searchResults.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">Searching…</TableCell></TableRow>
                ) : searchResults.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4">No matching candidates found.</TableCell></TableRow>
                ) : searchResults.map(({ c, sub, client, isArchive }) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.first_name}</TableCell>
                    <TableCell>{c.surname}</TableCell>
                    <TableCell>{c.id_number}</TableCell>
                    <TableCell>{client?.client_name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      {isArchive
                        ? <Badge variant="outline" className="text-[10px]">Archive</Badge>
                        : <Badge className="bg-emerald-600 text-[10px]">Current</Badge>}
                    </TableCell>
                    <TableCell>{sub!.order_number}</TableCell>
                    <TableCell>{sub!.sent_at ? new Date(sub!.sent_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => {
                        const effId = (c as any).override_client_id ?? sub!.client_id ?? null;
                        setHighlightCandidateId(c.id);
                        setOpenMode(isArchive ? "archive" : "live");
                        setOpenClientId(effId ?? "unassigned");
                      }}>
                        Open account
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          {groups.length === 0
            ? "No sent submissions yet. Once you email a report from the Submissions tab it will appear here under its client."
            : "No regular accounts to show. Toggle 'Regulars only' off to see all accounts."}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-center">Candidates (current)</TableHead>
              <TableHead className="text-center">Historical (archive)</TableHead>
              {!clientFacing && <TableHead className="text-center">Discounted</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleGroups.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {g.name}
                    {!clientFacing && g.isRegular && (
                      <Badge className="bg-amber-500 text-white gap-1"><Star className="h-3 w-3 fill-current" /> Regular</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">{g.checkCount}</TableCell>
                <TableCell className="text-center">
                  {g.archiveCount
                    ? <Badge variant="outline" className="text-[10px]">{g.archiveCount}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                {!clientFacing && (
                  <TableCell className="text-center">
                    {g.discounted ? (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
                        {g.discounted} discounted
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {g.mirrored ? (
                      <Badge
                        variant="outline"
                        className="ml-1 border-amber-500 text-amber-700 text-[10px]"
                        title="PTVS-discount checks mirrored here for invoicing — not counted in this account"
                      >
                        +{g.mirrored} PTVS mirrored
                      </Badge>
                    ) : null}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setOpenMode("live");
                      setOpenClientId(g.key === "__unassigned__" ? "unassigned" : g.key);
                    }}>
                      Open account
                    </Button>
                    {g.archiveCount > 0 && (
                      <Button size="sm" variant="ghost" title="View the historical (archive) checks for this account" onClick={() => {
                        setOpenMode("archive");
                        setOpenClientId(g.key === "__unassigned__" ? "unassigned" : g.key);
                      }}>
                        Archive
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {openClientId && (
        <ClientAccountDialog
          userName={userName}
          groupKey={openClientId === "unassigned" ? "__unassigned__" : openClientId}
          highlightCandidateId={highlightCandidateId}
          onClose={() => { setOpenClientId(null); setHighlightCandidateId(null); }}
          submissions={submissions}
          clients={clients}
          onChanged={onChanged}
          initialFromDate={fromDate}
          initialToDate={toDate}
          initialDateBasis={dateBasis}
          initialMode={openMode}
          clientFacing={clientFacing}
        />
      )}
    </Card>
  );
}

function ClientAccountDialog({
  groupKey, onClose, submissions, clients, onChanged, highlightCandidateId, userName,
  initialFromDate = "", initialToDate = "", initialDateBasis = "submitted", clientFacing = false,
  initialMode = "live",
}: {
  groupKey: string;
  userName: string;
  highlightCandidateId?: string | null;
  onClose: () => void;
  submissions: Submission[];
  clients: Client[];
  onChanged: () => void;
  initialFromDate?: string;
  initialToDate?: string;
  initialDateBasis?: DateBasis;
  clientFacing?: boolean;
  /** Which set of checks to show: current-system or imported historical archive. */
  initialMode?: "live" | "archive";
}) {
  const qc = useQueryClient();
  const client = groupKey === "__unassigned__" ? null : clients.find((c) => c.id === groupKey) ?? null;
  const clientName = client?.client_name ?? "Unassigned";
  // Original submissions of this account (used for delete/back-to-submissions on
  // whole-submission actions). Do not filter for candidates because a candidate
  // may have been moved INTO this account from another submission via override.
  const ownSubs = useMemo(
    () => submissions.filter((s) => (s.client_id ?? "__unassigned__") === groupKey),
    [submissions, groupKey],
  );

  // Date range filter — seeded from the Accounts tab time window.
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [dateBasis, setDateBasis] = useState<DateBasis>(initialDateBasis);
  // Current-system checks versus imported historical (archive) checks.
  const [mode, setMode] = useState<"live" | "archive">(initialMode);
  const archiveSubCount = useMemo(
    () => submissions.filter((s) => (s as any).is_archive && (s.client_id ?? "__unassigned__") === groupKey).length,
    [submissions, groupKey],
  );

  // Load candidates: (a) those from this account's own submissions,
  // and (b) those moved into this account via override_client_id from other subs.
  const ownSubIds = useMemo(() => ownSubs.map((s) => s.id), [ownSubs]);
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["mra-account-cands", groupKey, ownSubIds.join(",")],
    queryFn: async () => {
      // Own submissions' candidates (paged — a historical account can hold well
      // over the 1000-row single-request cap).
      const own: Candidate[] = [];
      if (ownSubIds.length > 0) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from("manual_risk_candidates")
            .select("*").in("submission_id", ownSubIds)
            .is("invoice_batch_id", null)
            .order("sort_order", { ascending: true })
            .range(from, from + 999);
          if (error) throw error;
          own.push(...((data ?? []) as Candidate[]));
          if (!data || data.length < 1000) break;
        }
      }
      // Candidates moved INTO this account from other submissions.
      let moved: Candidate[] = [];
      if (groupKey !== "__unassigned__") {
        const { data, error } = await sb.from("manual_risk_candidates")
          .select("*").eq("override_client_id", groupKey)
          .is("invoice_batch_id", null);
        if (error) throw error;
        moved = data as Candidate[];
      }
      // De-duplicate (a candidate could match both if it belongs here originally)
      const seen = new Set<string>();
      return [...own, ...moved].filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    },
  });

  // All submissions map for lookups (a moved-in candidate references a sub that
  // isn't in ownSubs).
  const subById = useMemo(() => new Map(submissions.map((s) => [s.id, s])), [submissions]);

  // PTVS mirror: every PTVS-discount check from other accounts is shown here so
  // Polygraph & Truth Verification Services can be invoiced for them. These rows
  // are read-only and never counted in this account.
  const ptvsClient = useMemo(() => findPtvsClient(clients), [clients]);
  const isPtvsAccount = !clientFacing && !!ptvsClient && groupKey === ptvsClient.id;
  // Client-facing profiles see a reduced table: no discount or invoice columns,
  // no selection checkbox and no administrative actions.
  const colCount = clientFacing ? 8 : mode === "live" ? 11 : 10;
  const [indemnityFor, setIndemnityFor] = useState<{ orderNumber: string; files: IndemnityFileRef[] } | null>(null);
  const sentSubIdsAll = useMemo(() => submissions.map((s) => s.id), [submissions]);
  const { data: mirrorCandidates = [] } = useQuery<Candidate[]>({
    queryKey: ["mra-ptvs-mirror", groupKey, sentSubIdsAll.join(",")],
    enabled: isPtvsAccount && sentSubIdsAll.length > 0,
    queryFn: async () => {
      const { data, error } = await sb.from("manual_risk_candidates")
        .select("*")
        .in("submission_id", sentSubIdsAll)
        .is("invoice_batch_id", null)
        .eq("is_ptvs_discount", true);
      if (error) throw error;
      return data as Candidate[];
    },
  });

  const rows: AccountRow[] = useMemo(() => {
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    return candidates
      .filter((c) => !isPlaceholderCandidate(c))
      .filter((c) => {
        // Effective client for this candidate must equal groupKey
        const s = subById.get(c.submission_id);
        const effId = (c as any).override_client_id ?? s?.client_id ?? "__unassigned__";
        return effId === groupKey;
      })
      .map((c) => {
        const s = subById.get(c.submission_id);
        if (!s) return null;
        // Keep the two worlds apart: historical archive checks only show in the
        // Archive view, current-system checks only in the current view.
        const isArchive = !!(s as any).is_archive;
        if (mode === "archive" ? !isArchive : isArchive) return null;
        // Clients only ever see checks whose report was actually released.
        if (clientFacing && !s.sent_at) return null;
        const sentAt = s.sent_at ?? s.created_at;
        const basisTs = new Date(dateBasis === "submitted" ? s.created_at : sentAt).getTime();
        if (from !== null && basisTs < from) return null;
        if (to !== null && basisTs > to) return null;
        return {
          submissionId: s.id,
          candidateId: c.id,
          orderNumber: s.order_number,
          sentAt,
          submittedAt: s.created_at,
          invoicedAt: s.invoiced_at,
          invoiceNumber: s.invoice_number,
          invoiceFilePath: s.invoice_file_path,
          idNumber: c.id_number,
          surname: c.surname,
          firstName: c.first_name,
          isTldvInternal: !!(c as any).is_tldv_internal,
          isPtvsDiscount: !!(c as any).is_ptvs_discount,
          overrideClientId: (c as any).override_client_id ?? null,
          originalClientId: s.client_id,
          sortOrder: (c as any).sort_order ?? 0,
          ...summariseCandidateChecks(c, s.requested_checks),
        } as AccountRow;
      })
      .filter((r): r is AccountRow => r !== null)
      // Newest orders first; candidates within an order keep their original
      // capture order. Applies to both current and archive views.
      .sort((a, b) => {
        const ta = new Date(dateBasis === "submitted" ? a.submittedAt : a.sentAt).getTime();
        const tb = new Date(dateBasis === "submitted" ? b.submittedAt : b.sentAt).getTime();
        if (ta !== tb) return tb - ta;
        const byOrder = a.orderNumber.localeCompare(b.orderNumber);
        if (byOrder !== 0) return byOrder;
        return a.sortOrder - b.sortOrder;
      });
  }, [candidates, subById, fromDate, toDate, dateBasis, groupKey, mode]);

  const mirrorRows: AccountRow[] = useMemo(() => {
    if (!isPtvsAccount || mode === "archive") return [];
    const from = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const to = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    return mirrorCandidates
      .filter((c) => !isPlaceholderCandidate(c))
      .map((c) => {
        const s = subById.get(c.submission_id);
        if (!s || !s.sent_at) return null;
        const effId = (c as any).override_client_id ?? s.client_id ?? "__unassigned__";
        if (effId === groupKey) return null; // already a real row here
        const basisTs = new Date(dateBasis === "submitted" ? s.created_at : s.sent_at).getTime();
        if (from !== null && basisTs < from) return null;
        if (to !== null && basisTs > to) return null;
        const originName = clients.find((cl) => cl.id === effId)?.client_name ?? "Unassigned";
        return {
          submissionId: s.id,
          candidateId: c.id,
          orderNumber: s.order_number,
          sentAt: s.sent_at,
          submittedAt: s.created_at,
          invoicedAt: s.invoiced_at,
          invoiceNumber: s.invoice_number,
          invoiceFilePath: s.invoice_file_path,
          idNumber: c.id_number,
          surname: c.surname,
          firstName: c.first_name,
          isTldvInternal: !!(c as any).is_tldv_internal,
          isPtvsDiscount: true,
          overrideClientId: (c as any).override_client_id ?? null,
          originalClientId: s.client_id,
          sortOrder: (c as any).sort_order ?? 0,
          ...summariseCandidateChecks(c, s.requested_checks),
          isMirror: true,
          mirrorFrom: originName,
        } as AccountRow;
      })
      .filter((r): r is AccountRow => r !== null)
      .sort((a, b) => {
        const ta = new Date(dateBasis === "submitted" ? a.submittedAt : a.sentAt).getTime();
        const tb = new Date(dateBasis === "submitted" ? b.submittedAt : b.sentAt).getTime();
        if (ta !== tb) return tb - ta;
        const byOrder = a.orderNumber.localeCompare(b.orderNumber);
        if (byOrder !== 0) return byOrder;
        return a.sortOrder - b.sortOrder;
      });
  }, [isPtvsAccount, mirrorCandidates, subById, fromDate, toDate, dateBasis, groupKey, clients, mode]);

  // Selection is per-candidate now.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [groupKey]);

  // When opened from a candidate search, scroll to and highlight that candidate.
  useEffect(() => {
    if (!highlightCandidateId || rows.length === 0) return;
    const t = setTimeout(() => {
      document
        .getElementById(`cand-row-${highlightCandidateId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [highlightCandidateId, rows]);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.candidateId)));
  };
  const toggleOne = (candId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candId)) next.delete(candId); else next.add(candId);
      return next;
    });
  };

  const selectedCandidateIds = useMemo(
    () => rows.filter((r) => selected.has(r.candidateId)).map((r) => r.candidateId),
    [rows, selected],
  );
  const selectedSubmissionIds = useMemo(
    () => Array.from(new Set(rows.filter((r) => selected.has(r.candidateId)).map((r) => r.submissionId))),
    [rows, selected],
  );

  const exportExcel = () => {
    const source = rows.filter((r) => selected.size === 0 || selected.has(r.candidateId));
    const all = selected.size === 0 ? [...source, ...mirrorRows] : source;
    if (!all.length) { toast.error("No rows to export"); return; }
    const wsData = [
      ["Client", "Order #", "Submitted Date", "Sent Date", "First Name", "Surname", "ID Number", "Invoiced", "Invoice #", "Discount", "PTVS", "Source"],
      ...all.map((r) => [
        r.isMirror ? r.mirrorFrom ?? "" : clientName,
        r.orderNumber,
        new Date(r.submittedAt).toLocaleDateString(),
        new Date(r.sentAt).toLocaleDateString(),
        r.firstName,
        r.surname,
        r.idNumber,
        r.invoicedAt ? new Date(r.invoicedAt).toLocaleDateString() : "",
        r.invoiceNumber ?? "",
        r.isTldvInternal ? "100% (TLDV internal)" : "",
        r.isPtvsDiscount ? "PTVS discount" : "",
        r.isMirror ? "PTVS mirror (not counted)" : "Account check",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checks");
    const safe = clientName.replace(/[^a-z0-9]+/gi, "_");
    const range = fromDate || toDate ? `_${fromDate || "start"}_to_${toDate || "today"}` : "";
    XLSX.writeFile(wb, `${safe}_Checks${range}.xlsx`);
    toast.success(`Exported ${all.length} row(s)`);
  };

  // -- Mark / unmark TLDV internal --
  const setTldvInternal = async (value: boolean) => {
    if (!selectedCandidateIds.length) { toast.error("Select at least one check first"); return; }
    const { error } = await sb.from("manual_risk_candidates")
      .update({ is_tldv_internal: value })
      .in("id", selectedCandidateIds);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedCandidateIds.length} check(s) ${value ? "marked as TLDV internal (100% discount)" : "unmarked"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
    qc.invalidateQueries({ queryKey: ["mra-accounts-all-cands"] });
    onChanged();
  };

  // -- Mark / unmark PTVS discount --
  const setPtvsDiscount = async (value: boolean) => {
    if (!selectedCandidateIds.length) { toast.error("Select at least one check first"); return; }
    const { error } = await sb.from("manual_risk_candidates")
      .update({ is_ptvs_discount: value } as any)
      .in("id", selectedCandidateIds);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedCandidateIds.length} check(s) ${value ? "marked as PTVS discount" : "unmarked"}`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
    qc.invalidateQueries({ queryKey: ["mra-accounts-all-cands"] });
    qc.invalidateQueries({ queryKey: ["mra-ptvs-mirror"] });
    onChanged();
  };

  // -- Move checks to another account --
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const moveChecks = async () => {
    if (!selectedCandidateIds.length) { toast.error("Select at least one check first"); return; }
    if (!moveTarget) { toast.error("Choose a target account"); return; }
    // If target equals current, clear override (send it home).
    let payload: any;
    if (moveTarget === "__clear__") {
      payload = { override_client_id: null };
    } else {
      payload = { override_client_id: moveTarget };
    }
    const { error } = await sb.from("manual_risk_candidates")
      .update(payload)
      .in("id", selectedCandidateIds);
    if (error) { toast.error(error.message); return; }
    toast.success(`${selectedCandidateIds.length} check(s) moved`);
    setMoveOpen(false);
    setMoveTarget("");
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
    qc.invalidateQueries({ queryKey: ["mra-accounts-all-cands"] });
    onChanged();
  };

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const markInvoiced = async () => {
    if (!selectedCandidateIds.length) { toast.error("Select at least one check first"); return; }
    if (!invoiceNumber.trim()) { toast.error("Enter the invoice reference"); return; }
    setUploading(true);
    let batchId: string | null = null;
    try {
      // 1. Create the invoice batch (one invoice reference = one batch of checks).
      const { data: batch, error: bErr } = await sb
        .from("manual_risk_invoice_batches")
        .insert({
          client_id: groupKey === "__unassigned__" ? null : groupKey,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          notes: invoiceNotes.trim() || null,
        })
        .select("id")
        .single();
      if (bErr) throw bErr;
      batchId = batch.id as string;

      // 2. Optional invoice attachment: storage + a single OneDrive copy under
      //    /PreAppliCheck/ManualRiskAssessments/{Client}/Invoices/{Invoice #}.
      let filePatch: Record<string, any> = {};
      if (invoiceFile) {
        const ext = invoiceFile.name.split(".").pop() ?? "pdf";
        const path = `manual-risk/${groupKey}/${batchId}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, invoiceFile, {
          contentType: invoiceFile.type || "application/pdf",
          upsert: false,
        });
        if (upErr) throw upErr;
        const od = await uploadInvoiceToOneDrive(invoiceFile, clientName, invoiceNumber.trim());
        filePatch = {
          invoice_file_path: path,
          invoice_file_name: invoiceFile.name,
          invoice_onedrive_web_url: od.webUrl,
          invoice_onedrive_item_id: od.itemId,
          invoice_onedrive_path: od.path,
        };
        const { error: fErr } = await sb.from("manual_risk_invoice_batches")
          .update(filePatch).eq("id", batchId);
        if (fErr) throw fErr;
      }

      // 3. Move the selected checks onto the batch (out of this account view).
      const { error } = await sb
        .from("manual_risk_candidates")
        .update({ invoice_batch_id: batchId })
        .in("id", selectedCandidateIds);
      if (error) throw error;

      toast.success(`${selectedCandidateIds.length} check(s) invoiced under ${invoiceNumber.trim()}`);
      setInvoiceOpen(false);
      setInvoiceFile(null);
      setInvoiceNumber("");
      setInvoiceNotes("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["mra-submissions"] });
      qc.invalidateQueries({ queryKey: ["mra-account-cands", groupKey] });
      qc.invalidateQueries({ queryKey: ["mra-accounts-all-cands"] });
      qc.invalidateQueries({ queryKey: ["mra-invoice-batches"] });
      qc.invalidateQueries({ queryKey: ["mra-invoiced-cands"] });
      qc.invalidateQueries({ queryKey: ["mra-dashboard-cands"] });
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

  // View the report that was sent to the client for this check's submission.
  const [reportPreview, setReportPreview] = useState<{ blob: Blob; title: string } | null>(null);
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const viewSentReport = async (submissionId: string) => {
    setLoadingReport(submissionId);
    try {
      const { blob, orderNumber } = await buildSentReportBlob(submissionId, clients, userName);
      setReportPreview({ blob, title: `Report sent to client — ${orderNumber}` });
    } catch (e) {
      toast.error("Failed to load report: " + (e as Error).message);
    } finally {
      setLoadingReport(null);
    }
  };


  const deleteSubmission = async (submissionId: string, orderNumber: string) => {
    if (!confirm(`Delete submission ${orderNumber}? This removes the submission and all its candidates permanently.`)) return;
    try {
      const sub = ownSubs.find((s) => s.id === submissionId);
      if (sub?.invoice_file_path) {
        await supabase.storage.from("invoices").remove([sub.invoice_file_path]);
      }
      if (sub) {
        await purgeSubmissionOneDrive(sub as any);
        const indPaths = (((sub as any).indemnity_files ?? []) as IndemnityFile[]).map((f) => f.path);
        if (indPaths.length) await supabase.storage.from("manual-risk-indemnities").remove(indPaths);
        const supPaths = (((sub as any).supplier_report_files ?? []) as SupplierReportFile[]).map((f) => f.path);
        if (supPaths.length) await supabase.storage.from("manual-risk-supplier-reports").remove(supPaths);
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
      const paths = ownSubs
        .filter((s) => selectedSubmissionIds.includes(s.id) && s.invoice_file_path)
        .map((s) => s.invoice_file_path!) as string[];
      if (paths.length) await supabase.storage.from("invoices").remove(paths);
      const targetSubs = ownSubs.filter((s) => selectedSubmissionIds.includes(s.id));
      const indPaths: string[] = [];
      const supPaths: string[] = [];
      for (const sub of targetSubs) {
        await purgeSubmissionOneDrive(sub as any);
        for (const f of ((sub as any).indemnity_files ?? []) as IndemnityFile[]) indPaths.push(f.path);
        for (const f of ((sub as any).supplier_report_files ?? []) as SupplierReportFile[]) supPaths.push(f.path);
      }
      if (indPaths.length) await supabase.storage.from("manual-risk-indemnities").remove(indPaths);
      if (supPaths.length) await supabase.storage.from("manual-risk-supplier-reports").remove(supPaths);
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

  const moveBackToSubmission = async (submissionId: string, orderNumber: string) => {
    if (!confirm(`Move submission ${orderNumber} back to the Submissions tab? Its sent and invoice details will be cleared.`)) return;
    try {
      const sub = ownSubs.find((s) => s.id === submissionId);
      if (sub?.invoice_file_path) {
        await supabase.storage.from("invoices").remove([sub.invoice_file_path]);
      }
      const { error } = await sb
        .from("manual_risk_submissions")
        .update({ sent_at: null, invoiced_at: null, invoice_number: null, invoice_file_path: null })
        .eq("id", submissionId);
      if (error) throw error;
      toast.success(`${orderNumber} moved back to Submissions`);
      setSelected((prev) => { const n = new Set(prev); n.delete(submissionId); return n; });
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
            {rows.length} check(s) shown • {mode === "archive" ? "historical (archive) records" : "current submissions"}
            {mode === "live" && <> • {selectedSubmissionIds.length} submission(s) selected</>}
            {mirrorRows.length > 0 && (
              <> • {mirrorRows.length} PTVS-discount check(s) mirrored from other accounts (invoicing only, not counted)</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex rounded-md border p-1 mb-3 w-fit">
          <Button
            size="sm"
            variant={mode === "live" ? "default" : "ghost"}
            className={mode === "live" ? "bg-red-600 hover:bg-red-700" : ""}
            onClick={() => { setMode("live"); setSelected(new Set()); }}
          >
            Current submissions
          </Button>
          <Button
            size="sm"
            variant={mode === "archive" ? "default" : "ghost"}
            className={mode === "archive" ? "bg-slate-700 hover:bg-slate-800" : ""}
            onClick={() => { setMode("archive"); setSelected(new Set()); }}
          >
            Historical archive{archiveSubCount ? ` (${archiveSubCount} order${archiveSubCount === 1 ? "" : "s"})` : ""}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <Label className="text-xs">Filter on</Label>
            <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as DateBasis)}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="submitted">Submitted date</SelectItem>
                <SelectItem value="sent">Sent (released) date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
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
          {!clientFacing && mode === "live" && (
            <>
              <Button variant="outline" onClick={exportExcel}>
                <FileDown className="h-4 w-4 mr-2" /> Export to Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => setTldvInternal(true)}
                disabled={!selectedCandidateIds.length}
                title="Mark selected check(s) as TLDV internal pre-employment (100% discount, still counted)"
              >
                <Percent className="h-4 w-4 mr-2" /> Mark TLDV Internal
              </Button>
              <Button
                variant="ghost"
                onClick={() => setTldvInternal(false)}
                disabled={!selectedCandidateIds.length}
                title="Remove the TLDV internal / 100% discount flag from selected check(s)"
              >
                Unmark
              </Button>
              <Button
                variant="outline"
                onClick={() => setPtvsDiscount(true)}
                disabled={!selectedCandidateIds.length}
                className="border-amber-600 text-amber-700 hover:bg-amber-50"
                title="Mark selected check(s) as PTVS discount"
              >
                <Percent className="h-4 w-4 mr-2" /> Mark PTVS Discount
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPtvsDiscount(false)}
                disabled={!selectedCandidateIds.length}
                title="Remove the PTVS discount flag from selected check(s)"
              >
                Unmark PTVS
              </Button>
              <Button
                variant="outline"
                onClick={() => setMoveOpen(true)}
                disabled={!selectedCandidateIds.length}
                title="Move selected check(s) to a different client account"
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" /> Move to Account
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={() => setInvoiceOpen(true)}
                disabled={!selectedCandidateIds.length}
                title="Batch the selected checks under one invoice reference and move them to the Invoiced tab"
              >
                <FileText className="h-4 w-4 mr-2" /> Invoice Selected Checks
              </Button>
              <Button
                variant="outline"
                className="border-red-600 text-red-600 hover:bg-red-50"
                onClick={deleteSelected}
                disabled={!selectedSubmissionIds.length}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
              </Button>
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!clientFacing && mode === "live" && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && selected.size === rows.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                )}
                <TableHead>Order #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>ID Valid</TableHead>
                <TableHead>Risk</TableHead>
                {!clientFacing && <TableHead>Discount</TableHead>}
                {!clientFacing && <TableHead>Invoice</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && mirrorRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-muted-foreground py-6">
                    No checks in this range.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.candidateId}
                  id={`cand-row-${r.candidateId}`}
                  className={highlightCandidateId === r.candidateId ? "bg-amber-100 ring-1 ring-amber-400" : undefined}
                >
                  {!clientFacing && mode === "live" && (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.candidateId)}
                        onCheckedChange={() => toggleOne(r.candidateId)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">{r.orderNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(r.submittedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{new Date(r.sentAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{r.surname}, {r.firstName}</span>
                      {r.overrideClientId && (
                        <Badge variant="outline" className="text-[10px]" title="Moved from another account">Moved in</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.idNumber}</TableCell>
                  <TableCell>{renderIdStatus(r)}</TableCell>
                  <TableCell>{renderRiskStatus(r)}</TableCell>
                  {!clientFacing && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.isTldvInternal && (
                          <Badge className="bg-blue-600 gap-1">
                            <Percent className="h-3 w-3" /> Discounted 100%
                          </Badge>
                        )}
                        {r.isPtvsDiscount && (
                          <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
                            <Percent className="h-3 w-3" /> PTVS Discount
                          </Badge>
                        )}
                        {!r.isTldvInternal && !r.isPtvsDiscount && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                  {!clientFacing && (
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
                  )}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View the report that was sent to the client"
                      disabled={loadingReport === r.submissionId}
                      onClick={() => viewSentReport(r.submissionId)}
                    >
                      <FileText className={loadingReport === r.submissionId ? "h-4 w-4 animate-pulse" : "h-4 w-4 text-blue-600"} />
                    </Button>
                    {clientFacing || mode === "archive" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="View uploaded indemnities"
                        onClick={() => setIndemnityFor({
                          orderNumber: r.orderNumber,
                          files: ((subById.get(r.submissionId)?.indemnity_files ?? []) as IndemnityFile[])
                            .map((f) => ({ path: f.path, name: f.name })),
                        })}
                      >
                        <FolderOpen className="h-4 w-4 text-amber-600" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete submission"
                          onClick={() => deleteSubmission(r.submissionId, r.orderNumber)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Move back to Submissions"
                          onClick={() => moveBackToSubmission(r.submissionId, r.orderNumber)}
                        >
                          <Undo2 className="h-4 w-4 text-amber-600" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {mirrorRows.length > 0 && (
                <TableRow className="bg-amber-50/60">
                  <TableCell colSpan={11} className="text-xs font-medium text-amber-800">
                    PTVS discount mirror — {mirrorRows.length} check(s) from other accounts, shown for invoicing only.
                    They stay counted under their own account and are not included in this account's totals.
                  </TableCell>
                </TableRow>
              )}
              {mirrorRows.map((r) => (
                <TableRow
                  key={`mirror-${r.candidateId}`}
                  id={`cand-row-${r.candidateId}`}
                  className={highlightCandidateId === r.candidateId ? "bg-amber-100 ring-1 ring-amber-400" : "bg-amber-50/30"}
                >
                  <TableCell />
                  <TableCell className="font-mono text-xs">{r.orderNumber}</TableCell>
                  <TableCell className="text-xs">{new Date(r.submittedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{new Date(r.sentAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{r.surname}, {r.firstName}</span>
                      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700" title={`Counted under ${r.mirrorFrom}`}>
                        Mirrored from {r.mirrorFrom}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.idNumber}</TableCell>
                  <TableCell>{renderIdStatus(r)}</TableCell>
                  <TableCell>{renderRiskStatus(r)}</TableCell>
                  <TableCell>
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
                      <Percent className="h-3 w-3" /> PTVS Discount
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline">Mirror</Badge></TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View the report that was sent to the client"
                      disabled={loadingReport === r.submissionId}
                      onClick={() => viewSentReport(r.submissionId)}
                    >
                      <FileText className={loadingReport === r.submissionId ? "h-4 w-4 animate-pulse" : "h-4 w-4 text-blue-600"} />
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

        <Dialog open={!!reportPreview} onOpenChange={(open) => !open && setReportPreview(null)}>
          <DialogContent className="max-w-6xl h-[92vh] p-0 overflow-hidden flex flex-col">
            <DialogHeader className="px-4 pt-4 pb-2 border-b">
              <DialogTitle>{reportPreview?.title ?? "Report"}</DialogTitle>
            </DialogHeader>
            {reportPreview && (
              <div
                className={clientFacing ? "flex-1 min-h-0 flex flex-col select-none no-print" : "flex-1 min-h-0 flex flex-col"}
                onContextMenu={clientFacing ? (e) => e.preventDefault() : undefined}
              >
                <PdfPreview blob={reportPreview.blob} title={reportPreview.title} />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {indemnityFor && (
          <IndemnityViewerDialog
            orderNumber={indemnityFor.orderNumber}
            files={indemnityFor.files}
            onClose={() => setIndemnityFor(null)}
          />
        )}

        <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move check(s) to another account</DialogTitle>
              <DialogDescription>
                Reassign {selectedCandidateIds.length} selected check(s) to a different client account.
                The submission itself is not changed — only the account these checks are counted under.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Target account</Label>
              <Select value={moveTarget} onValueChange={setMoveTarget}>
                <SelectTrigger><SelectValue placeholder="Choose an account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">↩ Reset to original submission's client</SelectItem>
                  {clients
                    .filter((c) => c.id !== groupKey)
                    .sort((a, b) => a.client_name.localeCompare(b.client_name))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.client_name}{c.is_regular ? " ★" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={moveChecks}>Move</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invoice selected checks</DialogTitle>
              <DialogDescription>
                {selectedCandidateIds.length} check(s) for {clientName} will move to the Invoiced tab as one batch
                under this invoice reference. The attachment is filed in OneDrive under
                {" "}<span className="font-mono text-[11px]">/PreAppliCheck/ManualRiskAssessments/{clientName}/Invoices/{invoiceNumber || "{Invoice #}"}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Invoice reference</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-0142" />
              </div>
              <div>
                <Label>Invoice date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div>
                <Label>Invoice file (PDF, optional — can be attached later)</Label>
                <Input type="file" accept="application/pdf,.pdf,image/*" onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder="Reference / PO number…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={markInvoiced} disabled={uploading}>
                {uploading ? "Saving..." : "Invoice checks"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
/**
 * One-click backfill: copies every existing submission's background report
 * (sent ones only) and indemnities into the client-shared OneDrive folder
 * tree. Supplier reports are never copied. Already-synced files are skipped.
 */
// The copy job runs outside React so that switching tabs (which unmounts the
// card) cannot interrupt it. State lives in this module and the card subscribes.
type SharedSyncState = {
  running: boolean;
  progress: { done: number; total: number; current: string } | null;
  log: string[];
};
const sharedSync: SharedSyncState & { listeners: Set<() => void> } = {
  running: false, progress: null, log: [], listeners: new Set(),
};
const notifySharedSync = () => sharedSync.listeners.forEach((l) => l());
const useSharedSyncState = (): SharedSyncState => {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    sharedSync.listeners.add(l);
    return () => { sharedSync.listeners.delete(l); };
  }, []);
  return sharedSync;
};

function ClientFolderSyncCard({
  submissions, clients, userName,
}: { submissions: Submission[]; clients: Client[]; userName: string }) {
  const qc = useQueryClient();
  const { running, progress, log } = useSharedSyncState();
  const setRunning = (v: boolean) => { sharedSync.running = v; notifySharedSync(); };
  const setProgress = (v: SharedSyncState["progress"]) => { sharedSync.progress = v; notifySharedSync(); };
  const setLog = (fn: string[] | ((l: string[]) => string[])) => {
    sharedSync.log = typeof fn === "function" ? fn(sharedSync.log) : fn;
    notifySharedSync();
  };

  const pending = useMemo(() => {
    let reports = 0, indemnities = 0;
    for (const s of submissions) {
      if (s.sent_at && !s.report_shared_onedrive_item_id) reports++;
      for (const f of (s.indemnity_files ?? [])) if (!f.shared_onedrive_item_id) indemnities++;
    }
    return { reports, indemnities };
  }, [submissions]);

  const run = async () => {
    if (sharedSync.running) { toast.info("A copy is already running"); return; }
    const targets = submissions.filter((s) =>
      (s.sent_at && !s.report_shared_onedrive_item_id) ||
      (s.indemnity_files ?? []).some((f) => !f.shared_onedrive_item_id),
    );
    if (!targets.length) { toast.info("Client folders are already up to date"); return; }
    if (!confirm(`Copy ${pending.reports} report(s) and ${pending.indemnities} indemnity file(s) into the client-shared OneDrive folders?`)) return;

    setRunning(true); setLog([]);
    let ok = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {

      const s = targets[i];
      const client = s.client_id ? clients.find((c) => c.id === s.client_id) : undefined;
      setProgress({ done: i, total: targets.length, current: s.order_number });
      const update: Record<string, any> = {};

      // Indemnities
      const files = (s.indemnity_files ?? []) as IndemnityFile[];
      let filesChanged = false;
      const nextFiles: IndemnityFile[] = [];
      for (const f of files) {
        if (f.shared_onedrive_item_id) { nextFiles.push(f); continue; }
        try {
          const { data, error } = await supabase.storage.from("manual-risk-indemnities").download(f.path);
          if (error || !data) throw error ?? new Error("Download failed");
          const od = await uploadToOneDrive({
            fileName: f.name, base64: await blobToBase64(data),
            contentType: f.content_type || "application/pdf",
            clientName: client?.client_name, orderNumber: s.order_number,
            kind: "indemnity", shared: true,
          });
          nextFiles.push({ ...f, shared_onedrive_web_url: od.webUrl, shared_onedrive_item_id: od.itemId });
          filesChanged = true; ok++;
        } catch (e) {
          failed++; nextFiles.push(f);
          setLog((l) => [...l, `${s.order_number} — indemnity "${f.name}": ${(e as Error).message}`]);
        }
      }
      if (filesChanged) update.indemnity_files = nextFiles;

      // Background report (only for submissions that were sent to the client)
      if (s.sent_at && !s.report_shared_onedrive_item_id) {
        try {
          const { blob } = await buildSentReportBlob(s.id, clients, userName, { encrypted: true });
          const od = await uploadToOneDrive({
            fileName: `PreAppliCheck-Report-${s.order_number}.pdf`,
            base64: await blobToBase64(blob), contentType: "application/pdf",
            clientName: client?.client_name, orderNumber: s.order_number,
            kind: "report", shared: true,
          });
          update.report_shared_onedrive_web_url = od.webUrl;
          update.report_shared_onedrive_item_id = od.itemId;
          update.report_shared_onedrive_path = od.fullPath;
          ok++;
        } catch (e) {
          failed++;
          setLog((l) => [...l, `${s.order_number} — report: ${(e as Error).message}`]);
        }
      }

      if (Object.keys(update).length) {
        const { error } = await sb.from("manual_risk_submissions").update(update).eq("id", s.id);
        if (error) { failed++; setLog((l) => [...l, `${s.order_number} — save: ${error.message}`]); }
      }
    }
    setProgress({ done: targets.length, total: targets.length, current: "" });
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["mra-submissions"] });
    if (failed) toast.warning(`Client folder sync finished: ${ok} copied, ${failed} failed`);
    else toast.success(`Client folder sync finished: ${ok} file(s) copied`);
  };

  const outstanding = pending.reports + pending.indemnities;
  return (
    <Card className="p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Client-shared OneDrive folders</p>
          <p className="text-xs text-muted-foreground">
            PreAppliCheck / ClientShared / [Client] / [Order] — background report + indemnities only (no supplier reports).
            {outstanding > 0
              ? ` ${pending.reports} report(s) and ${pending.indemnities} indemnity file(s) still to copy.`
              : " All submissions are synced."}
          </p>
          {progress && (
            <p className="text-xs mt-1">
              {running ? `Copying ${progress.current}… (${progress.done}/${progress.total})` : `Done (${progress.total} submission(s) processed)`}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={running || outstanding === 0}>
          {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Copy existing submissions to client folders
        </Button>
      </div>
      {log.length > 0 && (
        <ul className="mt-3 text-xs text-red-600 list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </Card>
  );
}
