import { useState, useRef } from "react";

const PUBLISHED_URL = "https://portal.tldv.co.za";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Eye, CheckCircle, ShieldCheck, Mail, Phone, CalendarIcon, AlertTriangle, Check, X, UserCheck, Trash2, RefreshCw, Users, FileUp, Plus, BarChart3, Building2, Store, ClipboardList, Download, Sparkles, LayoutDashboard, Inbox, FileSearch, ClipboardCheck, ShieldAlert, CalendarCheck2, Award, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ApplicationReviewDialog from "./ApplicationReviewDialog";
import PolygraphAppointmentDialog from "./PolygraphAppointmentDialog";
import BookingConfirmationView, { type BookingData } from "@/components/shared/BookingConfirmationView";
import { usePreAppliCheckedNotifications } from "@/hooks/usePreAppliCheckedNotifications";
import CandexPortalDashboard from "./CandexPortalDashboard";
import preapplicheckLogoMark from "@/assets/preapplicheck-logo-mark.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  RISK_CHECKS,
  DEFAULT_REQUESTED_CHECKS,
  RiskCheckCell,
  type RiskCheckKey,
  type RiskCheckResult,
} from "./riskCheckTypes";
import { format } from "date-fns";

interface CandexClientPortalProps {
  userId: string;
}

interface BulkCandidate {
  name: string;
  surname: string;
  email: string;
  phone: string;
  id_number: string;
}

// Sidebar wrapper that opens on hover and collapses on leave.
const HoverSidebar = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { setOpen, isMobile } = useSidebar();
  return (
    <div
      onMouseEnter={() => { if (!isMobile) setOpen(true); }}
      onMouseLeave={() => { if (!isMobile) setOpen(false); }}
    >
      <Sidebar collapsible="icon" className={className}>
        {children}
      </Sidebar>
    </div>
  );
};

// Logo block under the Account card — only renders when the sidebar is expanded.
const SidebarLogoMark = () => {
  const { state, isMobile } = useSidebar();
  if (!isMobile && state === "collapsed") return null;
  return (
    <div className="px-4 pt-4 pb-2 flex items-center justify-center">
      <img
        src={preapplicheckLogoMark}
        alt="PreAppliCheck"
        className="w-full max-w-[180px] h-auto object-contain opacity-95 drop-shadow-[0_4px_16px_rgba(239,68,68,0.18)]"
      />
    </div>
  );
};

const CandexClientPortal = ({ userId }: CandexClientPortalProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMode, setInviteMode] = useState<"single" | "bulk">("single");
  const [inviteMethod, setInviteMethod] = useState<"email" | "whatsapp">("email");
  const [inviteForm, setInviteForm] = useState({ name: "", surname: "", phone: "", email: "", id_number: "" });
  const [reviewApp, setReviewApp] = useState<any>(null);
  const [viewPreAppliCheckApp, setViewPreAppliCheckApp] = useState<any>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDate, setRequestDate] = useState<Date | undefined>(new Date());
  const [requestAccountId, setRequestAccountId] = useState("");
  const [requestStoreId, setRequestStoreId] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<RiskCheckKey[]>(DEFAULT_REQUESTED_CHECKS);
  const [viewRiskUrl, setViewRiskUrl] = useState<string | null>(null);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  const [viewBookingConfirmation, setViewBookingConfirmation] = useState<BookingData | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  // Per-session "seen" tabs — dismisses sidebar count badge after the user clicks the tab once.
  const [seenTabs, setSeenTabs] = useState<Record<string, boolean>>({});

  // Per-admin unread count for newly-approved PreAppliCheck applications.
  // Toast is off here (dashboard hook already surfaces it) — this just drives the tab badge.
  const { unreadCount: preAppliCheckedUnread, markSeen: markPreAppliCheckedSeen } =
    usePreAppliCheckedNotifications(userId, { showToast: false });

  // Bulk invite state
  const [bulkCandidates, setBulkCandidates] = useState<BulkCandidate[]>([]);
  const [bulkEntry, setBulkEntry] = useState<BulkCandidate>({ name: "", surname: "", email: "", phone: "", id_number: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkSending, setBulkSending] = useState(false);

  // Get client for this user - auto-create if not found
  const { data: client } = useQuery({
    queryKey: ["candex-my-client", userId],
    queryFn: async () => {
      const { data: existingList } = await supabase
        .from("candex_clients")
        .select("*")
        .eq("created_by", userId)
        .order("created_at", { ascending: true })
        .limit(1);
      const existing = existingList?.[0];
      if (existing) return existing;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();

      const { data: created, error } = await supabase
        .from("candex_clients")
        .insert({
          name: profile?.full_name || profile?.email || "Client",
          contact_email: profile?.email || null,
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to auto-create client:", error);
        return null;
      }
      return created;
    },
  });

  const clientTemplateId = (client as any)?.template_id || null;
  const clientAccountId = (client as any)?.account_id || null;

  // Get stores (sub-accounts) for assigned account
  const { data: stores = [] } = useQuery({
    queryKey: ["client-stores", clientAccountId],
    queryFn: async () => {
      if (!clientAccountId) return [];
      const { data } = await supabase
        .from("stores")
        .select("id, store_name, store_code")
        .eq("account_id", clientAccountId)
        .order("store_name");
      return data || [];
    },
    enabled: !!clientAccountId,
  });

  // Get invitations
  const { data: invitations } = useQuery({
    queryKey: ["candex-my-invitations", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("candex_invitations")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id,
  });

  // Get applications (exclude soft-deleted)
  const { data: applications } = useQuery({
    queryKey: ["candex-my-applications", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("candex_applications")
        .select("*")
        .eq("client_id", client.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id,
  });

  // Current user's display name (for deleted_by_name attribution)
  const { data: currentProfile } = useQuery({
    queryKey: ["candex-current-profile", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
  });
  const deleterName = currentProfile?.full_name || currentProfile?.email || "Unknown user";

  // Get accounts user has access to
  const { data: accounts } = useQuery({
    queryKey: ["candex-accessible-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name, code");
      return data || [];
    },
  });

  // Get user's polygraph appointments (exclude soft-deleted)
  const { data: userAppointments = [] } = useQuery({
    queryKey: ["user-polygraph-appointments", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("polygraph_appointments" as any)
        .select("*, polygraph_appointment_candidates(*)")
        .eq("client_id", client.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!client?.id,
  });

  // Get stores (sub-accounts) for the selected request account
  const { data: requestStores = [] } = useQuery({
    queryKey: ["request-stores", requestAccountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, store_name, store_code")
        .eq("account_id", requestAccountId)
        .order("store_name");
      return data || [];
    },
    enabled: !!requestAccountId,
  });

  // Get risk request candidate statuses for approved apps (exclude soft-deleted)
  const { data: riskCandidateData } = useQuery({
    queryKey: ["candex-risk-candidates-for-approved", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("candex_risk_request_candidates")
        .select("application_id, id_verified, risk_assessment_result, risk_assessment_url, request_id, check_results, candex_risk_requests(status, requested_checks)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id,
  });

  // Review tab shows all submitted + rejected (rejected stays in Review with badge).
  const pendingReview = applications?.filter((a) => a.status === "submitted" || a.status === "rejected") || [];
  const submittedOnly = applications?.filter((a) => a.status === "submitted") || [];
  // Reviewed tab = approved (and also candexed candidates still appear here as they progressed from approved).
  const reviewed = applications?.filter((a) => a.status === "approved" || a.status === "candexed") || [];
  // Risk Assessment Completed tab = candexed (have completed risk assessment).
  const riskCompleted = applications?.filter((a) => a.status === "candexed") || [];
  const rejected = applications?.filter((a) => a.status === "rejected") || [];
  const inProgress = applications?.filter((a) => a.status === "in_progress") || [];
  // PreAppliChecked tab (final) = candidates with a final risk report stored in answers.finalRiskReport
  const preAppliCheckedFinal = applications?.filter((a: any) => a?.answers?.finalRiskReport) || [];

  // Map of application_id -> appointment status (used to drive the Poly badge column).
  const polyByAppId: Record<string, string> = {};
  for (const apt of userAppointments as any[]) {
    const status = apt?.status || "requested";
    for (const pac of (apt?.polygraph_appointment_candidates || []) as any[]) {
      if (pac?.application_id) polyByAppId[pac.application_id] = status;
    }
  }
  const totalApplications = applications?.length || 0;

  // ── Dashboard Stats ──
  const dashboardStats = {
    totalInvitations: invitations?.length || 0,
    totalApplications,
    submitted: submittedOnly.length,
    approved: reviewed.length,
    rejected: rejected.length,
    preAppliChecked: preAppliCheckedFinal.length,
    inProgress: inProgress.length,
  };

  // ── Send single invitation ──
  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!client?.id) throw new Error("No client found");
      const templateId = clientTemplateId;
      if (!templateId) {
        throw new Error("No questionnaire template assigned to your account. Please assign a template before sending invitations.");
      }
      const candidateName = `${inviteForm.name} ${inviteForm.surname}`.trim();
      const candidateEmail = inviteForm.email.trim().toLowerCase() || null;
      const candidatePhone = inviteForm.phone.trim() || null;
      const candidateIdNumber = inviteForm.id_number.trim() || null;
      const sentAt = new Date().toISOString();

      let existingInviteQuery = supabase
        .from("candex_invitations")
        .select("id, token, status")
        .eq("client_id", client.id)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);

      if (candidateEmail) {
        existingInviteQuery = existingInviteQuery.eq("candidate_email", candidateEmail);
      } else if (candidatePhone) {
        existingInviteQuery = existingInviteQuery.eq("candidate_phone", candidatePhone);
      } else if (candidateIdNumber) {
        existingInviteQuery = existingInviteQuery.eq("candidate_id_number", candidateIdNumber);
      }

      const { data: existingInvite, error: existingInviteError } = await existingInviteQuery.maybeSingle();
      if (existingInviteError) throw existingInviteError;

      const invitationPayload = {
        client_id: client.id,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        candidate_phone: candidatePhone,
        candidate_id_number: candidateIdNumber,
        template_id: templateId,
        created_by: userId,
        sent_at: sentAt,
      };

      const { data: invData, error } = existingInvite
        ? await supabase
            .from("candex_invitations")
            .update({ ...invitationPayload, status: existingInvite.status === "opened" ? "opened" : "sent" })
            .eq("id", existingInvite.id)
            .select()
            .single()
        : await supabase
            .from("candex_invitations")
            .insert({ ...invitationPayload, status: "sent" })
            .select()
            .single();
      if (error) throw error;

      if (inviteMethod === "email" && candidateEmail) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
        const { error: emailError } = await supabase.functions.invoke("send-candex-invitation", {
          body: { email: candidateEmail, candidateName, invitationLink: portalUrl },
        });
        if (emailError) throw new Error("Invitation saved but email failed to send");
      } else if (inviteMethod === "whatsapp" && candidatePhone) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
        const { error: waError } = await supabase.functions.invoke("send-whatsapp-invitation", {
          body: { phone: candidatePhone, message: `Hi ${inviteForm.name}, you've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}` },
        });
        if (waError) throw new Error("Invitation saved but WhatsApp message failed to send");
      }
    },
    onSuccess: () => {
      toast.success(`Invitation sent via ${inviteMethod === "email" ? "Email" : "WhatsApp"}`);
      setInviteOpen(false);
      setInviteForm({ name: "", surname: "", phone: "", email: "", id_number: "" });
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations", client?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Send bulk invitations ──
  const sendBulkInvites = async () => {
    if (!client?.id || bulkCandidates.length === 0) return;
    if (!clientTemplateId) {
      toast.error("No questionnaire template assigned to your account. Please assign a template before sending invitations.");
      return;
    }
    setBulkSending(true);
    let successCount = 0;
    let failCount = 0;

    for (const candidate of bulkCandidates) {
      try {
        const candidateName = `${candidate.name} ${candidate.surname}`.trim();
        const candidateEmail = candidate.email.trim().toLowerCase() || null;
        const candidatePhone = candidate.phone.trim() || null;
        const candidateIdNumber = candidate.id_number.trim() || null;

        const { data: invData, error } = await supabase
          .from("candex_invitations")
          .insert({
            client_id: client.id,
            candidate_name: candidateName,
            candidate_email: candidateEmail,
            candidate_phone: candidatePhone,
            candidate_id_number: candidateIdNumber,
            template_id: clientTemplateId,
            created_by: userId,
            sent_at: new Date().toISOString(),
            status: "sent",
          })
          .select()
          .single();
        if (error) throw error;

        // Send notification
        if (candidateEmail) {
          const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
          await supabase.functions.invoke("send-candex-invitation", {
            body: { email: candidateEmail, candidateName, invitationLink: portalUrl },
          });
        } else if (candidatePhone) {
          const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
          await supabase.functions.invoke("send-whatsapp-invitation", {
            body: { phone: candidatePhone, message: `Hi ${candidate.name}, you've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}` },
          });
        }
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkSending(false);
    setBulkCandidates([]);
    setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations", client?.id] });
    toast.success(`${successCount} invitations sent${failCount > 0 ? `, ${failCount} failed` : ""}`);
  };

  // ── CSV parsing ──
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV must have a header row and at least one data row");
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h.includes("name") && !h.includes("surname") && !h.includes("last"));
      const surnameIdx = headers.findIndex((h) => h.includes("surname") || h.includes("last"));
      const emailIdx = headers.findIndex((h) => h.includes("email"));
      const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("contact") || h.includes("cell"));
      const idIdx = headers.findIndex((h) => h.includes("id") && !h.includes("email"));

      const parsed: BulkCandidate[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        if (!cols[nameIdx]) continue;
        parsed.push({
          name: cols[nameIdx] || "",
          surname: surnameIdx >= 0 ? cols[surnameIdx] || "" : "",
          email: emailIdx >= 0 ? cols[emailIdx] || "" : "",
          phone: phoneIdx >= 0 ? cols[phoneIdx] || "" : "",
          id_number: idIdx >= 0 ? cols[idIdx] || "" : "",
        });
      }
      setBulkCandidates((prev) => [...prev, ...parsed]);
      toast.success(`${parsed.length} candidates loaded from CSV`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addBulkEntry = () => {
    if (!bulkEntry.name.trim()) return;
    setBulkCandidates((prev) => [...prev, { ...bulkEntry }]);
    setBulkEntry({ name: "", surname: "", email: "", phone: "", id_number: "" });
  };

  const removeBulkCandidate = (idx: number) => {
    setBulkCandidates((prev) => prev.filter((_, i) => i !== idx));
  };

  // Delete invitation: soft-delete linked applications + their downstream
  // references (risk request candidates, polygraph appointment candidates)
  // so the invitation row can be hard-deleted without FK violations.
  const deleteInvite = useMutation({
    mutationFn: async (invId: string) => {
      const stamp = {
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deleted_by_name: deleterName,
      };

      // Find any applications tied to this invitation
      const { data: linkedApps } = await supabase
        .from("candex_applications")
        .select("id")
        .eq("invitation_id", invId);

      const appIds = (linkedApps ?? []).map((a: any) => a.id);

      if (appIds.length > 0) {
        // Hard-delete polygraph appointment candidate links (no soft-delete cols on this table)
        const { error: pacErr } = await supabase
          .from("polygraph_appointment_candidates")
          .delete()
          .in("application_id", appIds);
        if (pacErr) throw pacErr;

        // Soft-delete risk request candidates linked to those applications
        await supabase
          .from("candex_risk_request_candidates")
          .update(stamp)
          .in("application_id", appIds);

        // Soft-delete the applications themselves (master keeps record)
        const { error: appErr } = await supabase
          .from("candex_applications")
          .update(stamp)
          .in("id", appIds);
        if (appErr) throw appErr;
      }

      // Now safe to delete the invitation
      const { error } = await supabase.from("candex_invitations").delete().eq("id", invId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation deleted");
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations", client?.id] });
      queryClient.invalidateQueries({ queryKey: ["candex-my-applications", client?.id] });
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates-for-approved", client?.id] });
      queryClient.invalidateQueries({ queryKey: ["user-polygraph-appointments", client?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Soft-delete application: hide from this user, keep on Master Admin
  // and lock further processing. Also soft-deletes linked risk candidates.
  const deleteApplication = useMutation({
    mutationFn: async (appId: string) => {
      const stamp = {
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deleted_by_name: deleterName,
      };
      await supabase.from("candex_risk_request_candidates").update(stamp).eq("application_id", appId);
      const { error } = await supabase.from("candex_applications").update(stamp).eq("id", appId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application removed (master record retained)");
      queryClient.invalidateQueries({ queryKey: ["candex-my-applications", client?.id] });
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates-for-approved", client?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Soft-delete polygraph appointment: hide from this user, keep on Master.
  const deleteAppointment = useMutation({
    mutationFn: async (aptId: string) => {
      const stamp = {
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        deleted_by_name: deleterName,
      };
      const { data, error } = await supabase.from("polygraph_appointments" as any).update(stamp).eq("id", aptId).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Not permitted to delete this appointment");
    },
    onSuccess: () => {
      toast.success("Appointment removed (master record retained)");
      queryClient.invalidateQueries({ queryKey: ["user-polygraph-appointments", client?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Resend invitation
  const resendInvite = useMutation({
    mutationFn: async (inv: any) => {
      if (inv.candidate_email) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${inv.token}`;
        const { error: emailError } = await supabase.functions.invoke("send-candex-invitation", {
          body: { email: inv.candidate_email, candidateName: inv.candidate_name, invitationLink: portalUrl },
        });
        if (emailError) throw new Error("Failed to resend email");
      } else if (inv.candidate_phone) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${inv.token}`;
        const { error: waError } = await supabase.functions.invoke("send-whatsapp-invitation", {
          body: { phone: inv.candidate_phone, message: `Reminder: You've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}` },
        });
        if (waError) throw new Error("Failed to resend WhatsApp message");
      }
      const nextStatus = inv.status === "opened" ? "opened" : "sent";
      await supabase.from("candex_invitations").update({ sent_at: new Date().toISOString(), status: nextStatus }).eq("id", inv.id);
    },
    onSuccess: () => {
      toast.success("Invitation resent");
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations", client?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Approve / Reject application
  const updateAppStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("candex_applications")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Update failed — you may not have permission to modify this application");
      return status;
    },
    onSuccess: (status) => {
      toast.success(`Application ${status}`);
      setReviewApp(null);
      queryClient.invalidateQueries({ queryKey: ["candex-my-applications", client?.id] });
      queryClient.invalidateQueries({ queryKey: ["candex-pending-submissions-count"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update application status"),
  });

  // Submit risk assessment request
  const submitRiskRequest = useMutation({
    mutationFn: async () => {
      if (!client?.id || !requestAccountId || selectedCandidates.length === 0) {
        throw new Error("Please fill all fields and select candidates");
      }
      if (selectedChecks.length === 0) {
        throw new Error("Select at least one check to request");
      }
      const { data: req, error: reqErr } = await supabase
        .from("candex_risk_requests" as any)
        .insert({
          client_id: client.id,
          account_id: requestAccountId,
          requested_by: userId,
          requested_date: requestDate ? format(requestDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
          status: "pending",
          requested_checks: selectedChecks,
        } as any)
        .select("id")
        .single();
      if (reqErr) throw reqErr;
      // Seed each requested check as "pending" so the master profile has a clear list to process
      const seeded: Record<string, RiskCheckResult> = {};
      selectedChecks.forEach((k) => { seeded[k] = { status: "pending" }; });
      const candidates = selectedCandidates.map((appId) => ({
        request_id: (req as any).id,
        application_id: appId,
        check_results: seeded,
      }));
      const { error: candErr } = await supabase.from("candex_risk_request_candidates" as any).insert(candidates as any);
      if (candErr) throw candErr;
    },
    onSuccess: () => {
      toast.success("Risk assessment request submitted");
      setRequestOpen(false);
      setSelectedCandidates([]);
      setSelectedChecks(DEFAULT_REQUESTED_CHECKS);
      setRequestAccountId("");
      setRequestStoreId("");
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates-for-approved"] });
      queryClient.invalidateQueries({ queryKey: ["candex-pending-risk-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  // Sidebar workflow nav items
  const navItems: Array<{
    value: string;
    label: string;
    icon: any;
    badge?: number;
    pulse?: boolean;
  }> = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { value: "invite", label: "Invitations", icon: Inbox, badge: invitations?.length || 0 },
    { value: "review", label: "Review", icon: FileSearch, badge: submittedOnly.length },
    { value: "reviewed", label: "Reviewed", icon: ClipboardCheck, badge: reviewed.length },
    { value: "preAppliChecked", label: "Risk Assessment Completed", icon: ShieldAlert, badge: riskCompleted.length },
    { value: "appointments", label: "Appointments", icon: CalendarCheck2, badge: userAppointments?.length || 0 },
    { value: "preAppliCheckedFinal", label: "PreAppliChecked", icon: Award, badge: preAppliCheckedUnread, pulse: true },
  ];

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex w-full min-h-[calc(100vh-180px)] gap-4">
        <HoverSidebar className="border-r bg-gradient-to-b from-zinc-50 via-white to-zinc-50">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Workflow
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.value;
                    return (
                      <SidebarMenuItem key={item.value}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={isActive ? "bg-gradient-to-r from-zinc-900/10 via-zinc-700/5 to-red-600/15 text-foreground font-semibold border-l-2 border-red-600" : ""}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab(item.value);
                              setSeenTabs((s) => ({ ...s, [item.value]: true }));
                              if (item.value === "preAppliCheckedFinal") markPreAppliCheckedSeen();
                            }}
                            className="flex items-center gap-2 w-full text-left"
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1 truncate text-sm">{item.label}</span>
                            {item.badge && item.badge > 0 && !seenTabs[item.value] ? (
                              <Badge
                                variant="destructive"
                                className={`h-5 min-w-5 px-1.5 text-[10px] bg-red-600 hover:bg-red-600 ${item.pulse ? "animate-pulse" : ""}`}
                              >
                                {item.badge}
                              </Badge>
                            ) : null}
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {clientAccountId && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Account
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <div className="px-3 py-2 rounded-md bg-muted/40 mx-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <p className="text-xs font-medium truncate">
                        {accounts?.find(a => a.id === clientAccountId)?.name || "Assigned Account"}
                      </p>
                    </div>
                    {stores.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {stores.length} sub-account{stores.length === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
            <SidebarLogoMark />
          </SidebarContent>
          <SidebarFooter className="border-t border-border/60 p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Main Portal"
                  className="bg-gradient-to-r from-black via-zinc-900 to-red-700 text-white hover:from-zinc-900 hover:to-red-600 hover:text-white border border-red-600/40 shadow-md hover:shadow-[0_0_30px_rgba(239,68,68,0.45)] transition-all duration-300"
                >
                  <button
                    type="button"
                    onClick={() => navigate("/admin/portal")}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    <Home className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-sm font-medium">Main Portal</span>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </HoverSidebar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <SidebarTrigger className="md:hidden" />
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {navItems.find((n) => n.value === activeTab)?.label || "Workflow"}
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v);
              if (v === "preAppliCheckedFinal") markPreAppliCheckedSeen();
            }}
            className="space-y-6"
          >
            {/* Hidden TabsList — required for Tabs primitive but visually hidden (sidebar drives nav) */}
            <TabsList className="sr-only">
              {navItems.map((n) => (
                <TabsTrigger key={n.value} value={n.value}>{n.label}</TabsTrigger>
              ))}
            </TabsList>

            {/* ── DASHBOARD TAB ── */}
            <TabsContent value="dashboard">
              <CandexPortalDashboard
                clientName={(client as any)?.name}
                invitations={invitations}
                applications={applications}
                appointments={userAppointments as any[]}
              />
            </TabsContent>

      {/* ── INVITE TAB ── */}
      <TabsContent value="invite">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Candidate Invitations</CardTitle>
            <div className="flex gap-2">
              <Button onClick={() => { setInviteMode("single"); setInviteOpen(true); }} size="sm">
                <Send className="h-4 w-4 mr-1" /> Single Invite
              </Button>
              <Button onClick={() => { setInviteMode("bulk"); setInviteOpen(true); }} size="sm" variant="outline">
                <Users className="h-4 w-4 mr-1" /> Bulk Invite
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!invitations?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No invitations sent yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => {
                    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
                      sent: { variant: "secondary", className: "bg-blue-100 text-blue-700 border-blue-200" },
                      opened: { variant: "outline", className: "bg-amber-100 text-amber-700 border-amber-200" },
                      completed: { variant: "default", className: "bg-green-100 text-green-700 border-green-200" },
                    };
                    const sc = statusConfig[inv.status] || { variant: "secondary" as const, className: "" };
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.candidate_name}</TableCell>
                        <TableCell className="text-xs">{inv.candidate_email || inv.candidate_phone || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className={`text-xs capitalize ${sc.className}`}>
                            {inv.status === "sent" && <Send className="h-3 w-3 mr-1" />}
                            {inv.status === "opened" && <Eye className="h-3 w-3 mr-1" />}
                            {inv.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.sent_at ? format(new Date(inv.sent_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          {inv.status !== "completed" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Resend invitation" onClick={() => resendInvite.mutate(inv)} disabled={resendInvite.isPending}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete invitation" onClick={() => { if (confirm("Delete this invitation?")) deleteInvite.mutate(inv.id); }} disabled={deleteInvite.isPending}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Invite Dialog - Single or Bulk */}
        <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setBulkCandidates([]); } }}>
          <DialogContent className={inviteMode === "bulk" ? "max-w-2xl" : "max-w-md"}>
            <DialogHeader>
              <DialogTitle>{inviteMode === "single" ? "Invite Single Candidate" : "Bulk Invite Candidates"}</DialogTitle>
              <DialogDescription>
                {inviteMode === "single"
                  ? "Fill in the candidate's details to send a PreAppliCheck invitation."
                  : "Add multiple candidates manually or upload a CSV file."}
              </DialogDescription>
            </DialogHeader>

            {inviteMode === "single" ? (
              <>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Name</Label><Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} /></div>
                    <div><Label>Surname</Label><Input value={inviteForm.surname} onChange={(e) => setInviteForm({ ...inviteForm, surname: e.target.value })} /></div>
                  </div>
                  <div><Label>ID Number</Label><Input value={inviteForm.id_number} onChange={(e) => setInviteForm({ ...inviteForm, id_number: e.target.value })} /></div>
                  <div><Label>Contact Number</Label><Input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} /></div>
                  <div><Label>Email Address</Label><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
                  <div>
                    <Label>Send Via</Label>
                    <div className="flex gap-2 mt-1">
                      <Button variant={inviteMethod === "email" ? "default" : "outline"} size="sm" onClick={() => setInviteMethod("email")}><Mail className="h-4 w-4 mr-1" /> Email</Button>
                      <Button variant={inviteMethod === "whatsapp" ? "default" : "outline"} size="sm" onClick={() => setInviteMethod("whatsapp")}><Phone className="h-4 w-4 mr-1" /> WhatsApp</Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => sendInvite.mutate()} disabled={!inviteForm.name || !inviteForm.surname || sendInvite.isPending}>
                    <Send className="h-4 w-4 mr-1" /> Send Invitation
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  {/* CSV Upload */}
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <FileUp className="h-4 w-4 mr-2" /> Upload CSV
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      CSV should have columns: Name, Surname, Email, Phone, ID Number
                    </p>
                  </div>

                  {/* Manual entry */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">Add Manually</p>
                    <div className="grid grid-cols-5 gap-2">
                      <Input placeholder="Name" value={bulkEntry.name} onChange={(e) => setBulkEntry({ ...bulkEntry, name: e.target.value })} className="text-xs" />
                      <Input placeholder="Surname" value={bulkEntry.surname} onChange={(e) => setBulkEntry({ ...bulkEntry, surname: e.target.value })} className="text-xs" />
                      <Input placeholder="Email" value={bulkEntry.email} onChange={(e) => setBulkEntry({ ...bulkEntry, email: e.target.value })} className="text-xs" />
                      <Input placeholder="Phone" value={bulkEntry.phone} onChange={(e) => setBulkEntry({ ...bulkEntry, phone: e.target.value })} className="text-xs" />
                      <div className="flex gap-1">
                        <Input placeholder="ID Number" value={bulkEntry.id_number} onChange={(e) => setBulkEntry({ ...bulkEntry, id_number: e.target.value })} className="text-xs" />
                        <Button size="icon" className="h-10 w-10 shrink-0" onClick={addBulkEntry} disabled={!bulkEntry.name.trim()}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Candidates list */}
                  {bulkCandidates.length > 0 && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Email</TableHead>
                            <TableHead className="text-xs">Phone</TableHead>
                            <TableHead className="text-xs">ID</TableHead>
                            <TableHead className="w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkCandidates.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs py-1">{c.name} {c.surname}</TableCell>
                              <TableCell className="text-xs py-1">{c.email || "—"}</TableCell>
                              <TableCell className="text-xs py-1">{c.phone || "—"}</TableCell>
                              <TableCell className="text-xs py-1">{c.id_number || "—"}</TableCell>
                              <TableCell className="py-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeBulkCandidate(i)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <p className="text-sm text-muted-foreground mr-auto">{bulkCandidates.length} candidate(s) queued</p>
                  <Button onClick={sendBulkInvites} disabled={bulkCandidates.length === 0 || bulkSending}>
                    <Send className="h-4 w-4 mr-1" /> {bulkSending ? "Sending..." : `Send ${bulkCandidates.length} Invitation(s)`}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* ── REVIEW TAB ── */}
      <TabsContent value="review">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submissions for Review</CardTitle>
          </CardHeader>
          <CardContent>
            {!pendingReview.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No submissions pending review.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReview.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                          </span>
                          {app.candidate_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                      <TableCell>
                        {app.risk_level ? (
                          <Badge variant={app.risk_level === "LOW" ? "default" : "destructive"} className="text-xs">{app.risk_level}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {app.submitted_at ? format(new Date(app.submitted_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setReviewApp(app)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-primary" onClick={() => updateAppStatus.mutate({ id: app.id, status: "approved" })}><Check className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateAppStatus.mutate({ id: app.id, status: "rejected" })}><X className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive" title="Delete application" onClick={() => { if (confirm("Delete this application? This cannot be undone.")) deleteApplication.mutate(app.id); }} disabled={deleteApplication.isPending}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ApplicationReviewDialog
          application={reviewApp}
          open={!!reviewApp}
          onClose={() => setReviewApp(null)}
          onApprove={(id) => updateAppStatus.mutate({ id, status: "approved" })}
          onReject={(id) => updateAppStatus.mutate({ id, status: "rejected" })}
        />
      </TabsContent>

      {/* ── REVIEWED TAB (was Approved) ── */}
      <TabsContent value="reviewed">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Reviewed Candidates</CardTitle>
            {reviewed.length > 0 && (
              <Button size="sm" onClick={() => setRequestOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Request Risk Assessment
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!reviewed.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No reviewed candidates yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Date Reviewed</TableHead>
                    <TableHead>Pre Risk</TableHead>
                    {RISK_CHECKS.map((c) => (
                      <TableHead key={c.key} className="text-center text-[10px] uppercase tracking-wide px-1" title={c.label}>
                        {c.short}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewed.map((app) => {
                    const riskCandidate = riskCandidateData?.find((rc: any) => rc.application_id === app.id);
                    const requestedChecks: RiskCheckKey[] =
                      ((riskCandidate as any)?.candex_risk_requests?.requested_checks as RiskCheckKey[]) || [];
                    const checkResults: Record<string, RiskCheckResult> =
                      ((riskCandidate as any)?.check_results as Record<string, RiskCheckResult>) || {};
                    // Legacy fallback: pre-existing rows used the old single id_verified / risk_assessment_result fields.
                    const legacyIdVerified = riskCandidate?.id_verified;
                    const legacyRisk = riskCandidate?.risk_assessment_result;

                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.candidate_name}</TableCell>
                        <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {app.updated_at ? format(new Date(app.updated_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          {app.risk_level ? (
                            <Badge className={`text-xs ${app.risk_level === "LOW" ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground"}`}>{app.risk_level}</Badge>
                          ) : "—"}
                        </TableCell>
                        {RISK_CHECKS.map((c) => {
                          const polyStatus = polyByAppId[app.id];
                          const requested =
                            requestedChecks.includes(c.key) ||
                            (c.key === "id_verification" && !!riskCandidate && requestedChecks.length === 0) ||
                            (c.key === "pre_crim" && !!riskCandidate && requestedChecks.length === 0) ||
                            (c.key === "poly" && !!polyStatus);
                          let result = checkResults[c.key];
                          if (c.key === "poly" && polyStatus) {
                            const isCompleted = polyStatus === "completed";
                            result = { status: isCompleted ? "clear" : "pending", notes: `Appointment ${polyStatus}` };
                          }
                          // Legacy bridge so old requests still show outcomes
                          if (!result && requested) {
                            if (c.key === "id_verification" && legacyIdVerified !== undefined && legacyIdVerified !== null) {
                              result = { status: legacyIdVerified ? "clear" : "flagged" };
                            } else if (c.key === "pre_crim" && legacyRisk) {
                              result = { status: legacyRisk === "clear" ? "clear" : "flagged" };
                            }
                          }
                          return (
                            <TableCell key={c.key} className="text-center px-1">
                              <RiskCheckCell requested={requested} result={result} label={c.label} />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" title="View PreAppliCheck" onClick={() => setViewPreAppliCheckApp(app)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" title="Delete application" onClick={() => { if (confirm("Delete this approved candidate? This cannot be undone.")) deleteApplication.mutate(app.id); }} disabled={deleteApplication.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View PreAppliCheck Application (read-only) */}
        <ApplicationReviewDialog
          application={viewPreAppliCheckApp}
          open={!!viewPreAppliCheckApp}
          onClose={() => setViewPreAppliCheckApp(null)}
          onApprove={undefined as any}
          onReject={undefined as any}
          readOnly
        />


        {/* Risk Assessment Request Dialog */}
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Request Risk Assessment</DialogTitle>
              <DialogDescription>Select a date, account, and candidates for the risk assessment request.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {requestDate ? format(requestDate, "dd MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={requestDate} onSelect={setRequestDate} /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Assign to Account</Label>
                <Select value={requestAccountId} onValueChange={(v) => { setRequestAccountId(v); setRequestStoreId(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {requestAccountId && requestStores.length > 0 && (
                <div>
                  <Label>Sub-Account (Store)</Label>
                  <Select value={requestStoreId} onValueChange={setRequestStoreId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select sub-account" /></SelectTrigger>
                    <SelectContent>
                      {requestStores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>{store.store_name} ({store.store_code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Checks to Request</Label>
                <div className="border rounded-md mt-1 p-2 grid grid-cols-2 gap-1">
                  {RISK_CHECKS.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={selectedChecks.includes(c.key)}
                        onCheckedChange={() => setSelectedChecks((prev) =>
                          prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                        )}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Each ticked check is created as a pending item on the candidate's master profile for individual processing.
                </p>
              </div>
              <div>
                <Label>Select Candidates</Label>
                <div className="border rounded-md mt-1 max-h-48 overflow-y-auto">
                  {reviewed.map((app) => (
                    <label key={app.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox checked={selectedCandidates.includes(app.id)} onCheckedChange={() => toggleCandidate(app.id)} />
                      <span>{app.candidate_name}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{app.candidate_id_number}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => submitRiskRequest.mutate()} disabled={submitRiskRequest.isPending || !selectedCandidates.length || !requestAccountId || selectedChecks.length === 0}>
                <Send className="h-4 w-4 mr-1" /> Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      {/* ── PREAPPLICHECKED TAB ── */}
      <TabsContent value="preAppliChecked">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Risk Assessment Completed
            </CardTitle>
            {(riskCompleted.length > 0 || reviewed.length > 0) && (
              <Button size="sm" onClick={() => setAppointmentOpen(true)}>
                <ClipboardList className="h-4 w-4 mr-1" /> Request Polygraph
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!riskCompleted.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No completed risk assessments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>ID Verified</TableHead>
                    <TableHead>Risk Assessment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskCompleted.map((app) => {
                    const riskCandidate = riskCandidateData?.find((rc: any) => rc.application_id === app.id);
                    const riskResult = riskCandidate?.risk_assessment_result;
                    const riskUrl = riskCandidate?.risk_assessment_url;
                    const idVerified = riskCandidate?.id_verified;

                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.candidate_name}</TableCell>
                        <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                        <TableCell>
                          {idVerified ? (
                            <Badge className="bg-green-600 text-white text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" /> Verified
                            </Badge>
                          ) : (
                            <Badge className="bg-destructive text-destructive-foreground text-xs">Unverified</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {riskResult === "clear" ? (
                            <Badge className="bg-green-600 text-white text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" /> No Risk Identified
                            </Badge>
                          ) : riskResult === "flagged" ? (
                            <Badge className="bg-destructive text-destructive-foreground text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Risk Identified
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Completed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {riskUrl && (
                              <Button variant="ghost" size="sm" title="View Risk Assessment" onClick={async () => {
                                try {
                                  // Route through edge function (different URL path) to bypass some ad-blocker rules
                                  const session = (await supabase.auth.getSession()).data.session;
                                  const token = session?.access_token;
                                  const projectUrl = (supabase as any).supabaseUrl as string;
                                  const apiKey = (supabase as any).supabaseKey as string;

                                  let blob: Blob;
                                  if (riskUrl.startsWith("http")) {
                                    const res = await fetch(riskUrl);
                                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                    blob = await res.blob();
                                  } else {
                                    const fnUrl = `${projectUrl}/functions/v1/proxy-storage-file?bucket=employee-documents&path=${encodeURIComponent(riskUrl)}`;
                                    const res = await fetch(fnUrl, {
                                      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
                                    });
                                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                    blob = await res.blob();
                                  }
                                  const typed = new Blob([blob], { type: blob.type || "application/pdf" });
                                  setViewRiskUrl(URL.createObjectURL(typed));
                                } catch (err: any) {
                                  console.error("View document error:", err);
                                  const msg = err?.message?.includes("Failed to fetch") || err?.name === "TypeError"
                                    ? "Request blocked by a browser extension (ad/tracker blocker). Please disable it for this site, or open the app in Incognito mode."
                                    : "Could not load document.";
                                  toast.error(msg);
                                }
                              }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-destructive" title="Delete" onClick={() => { if (confirm("Delete this candidate's risk assessment record? This cannot be undone.")) deleteApplication.mutate(app.id); }} disabled={deleteApplication.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Risk Assessment Dialog (for completed tab) */}
        <Dialog open={!!viewRiskUrl} onOpenChange={(open) => {
          if (!open) {
            if (viewRiskUrl?.startsWith("blob:")) URL.revokeObjectURL(viewRiskUrl);
            setViewRiskUrl(null);
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Risk Assessment Report</DialogTitle>
              <DialogDescription>View the completed risk assessment document.</DialogDescription>
            </DialogHeader>
            {viewRiskUrl && <iframe src={viewRiskUrl} className="w-full h-[65vh] border rounded" title="Risk Assessment" />}
          </DialogContent>
        </Dialog>
        {/* Polygraph Appointment Request Dialog */}
        <PolygraphAppointmentDialog
          open={appointmentOpen}
          onClose={() => setAppointmentOpen(false)}
          candidates={reviewed.map((a) => ({
            id: a.id,
            candidate_name: a.candidate_name,
            candidate_id_number: a.candidate_id_number || null,
          }))}
          clientId={client?.id || ""}
          userId={userId}
          accounts={accounts || []}
          defaultAccountId={clientAccountId}
        />
      </TabsContent>

      {/* ── APPOINTMENTS TAB ── */}
      <TabsContent value="appointments">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-5 w-5 text-primary" /> Polygraph Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No appointments requested yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>Requested</TableHead>
                     <TableHead>Venue</TableHead>
                     <TableHead>Area</TableHead>
                     <TableHead>Candidates</TableHead>
                     <TableHead>Scheduled Date</TableHead>
                     <TableHead>Time</TableHead>
                     <TableHead>Booking Ref</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userAppointments.map((apt: any) => {
                    const candidatesList = apt.polygraph_appointment_candidates || [];
                    const statusColor = apt.status === "confirmed" ? "bg-green-100 text-green-800 border-green-200"
                      : apt.status === "scheduled" ? "bg-blue-100 text-blue-800 border-blue-200"
                      : apt.status === "requested" ? "bg-amber-100 text-amber-800 border-amber-200"
                      : "bg-muted text-muted-foreground";
                    return (
                      <TableRow key={apt.id}>
                        <TableCell className="text-sm">
                          {format(new Date(apt.created_at), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {apt.venue_type === "tldv_venue" ? "TLDV Venue" : apt.venue_type === "own_location" ? "Own Location" : "Rented Venue"}
                          {apt.venue_address && (
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{apt.venue_address}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{apt.preferred_area || "—"}</TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            {candidatesList.slice(0, 3).map((c: any) => (
                              <p key={c.id} className="text-xs">{c.candidate_name}</p>
                            ))}
                            {candidatesList.length > 3 && (
                              <p className="text-xs text-muted-foreground">+{candidatesList.length - 3} more</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {apt.scheduled_date ? format(new Date(apt.scheduled_date), "dd MMM yyyy") : <span className="text-muted-foreground text-xs">Pending</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {apt.scheduled_time || <span className="text-muted-foreground text-xs">Pending</span>}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {apt.booking_reference || <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusColor}>
                            {apt.status === "confirmed" ? "Confirmed" : apt.status === "scheduled" ? "Scheduled" : apt.status === "requested" ? "Requested" : apt.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {apt.booking_reference && (
                              <Button variant="ghost" size="sm" title="View Confirmation" onClick={() => {
                                setViewBookingConfirmation({
                                  bookingReference: apt.booking_reference,
                                  status: apt.status,
                                  scheduledDate: apt.scheduled_date ? format(new Date(apt.scheduled_date), "dd MMMM yyyy") : undefined,
                                  scheduledTime: apt.scheduled_time || undefined,
                                  venueType: apt.venue_type,
                                  venueAddress: apt.venue_address || undefined,
                                  preferredArea: apt.preferred_area || undefined,
                                  candidates: candidatesList.map((c: any) => ({ name: c.candidate_name, idNumber: c.candidate_id_number })),
                                  notes: apt.notes || undefined,
                                });
                              }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-destructive" title="Delete appointment" onClick={() => { if (confirm("Delete this appointment? This cannot be undone.")) deleteAppointment.mutate(apt.id); }} disabled={deleteAppointment.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── PREAPPLICHECKED FINAL TAB ── */}
      <TabsContent value="preAppliCheckedFinal">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> PreAppliChecked — Final Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!preAppliCheckedFinal.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Final risk reports appear here once a polygraph report has been uploaded and the combined report has been generated.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Final Risk Level</TableHead>
                    <TableHead>Requested Checks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preAppliCheckedFinal.map((app: any) => {
                    const riskCandidate = riskCandidateData?.find((rc: any) => rc.application_id === app.id);
                    const requestedChecks: RiskCheckKey[] =
                      ((riskCandidate as any)?.candex_risk_requests?.requested_checks as RiskCheckKey[]) || [];
                    const finalLevel = app?.answers?.finalRiskReport?.riskLevel;
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.candidate_name}</TableCell>
                        <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                        <TableCell>
                          {finalLevel ? (
                            <Badge className={`text-xs ${finalLevel === "LOW" ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground"}`}>
                              {finalLevel}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {requestedChecks.length === 0 ? (
                              <span className="text-xs text-muted-foreground">None</span>
                            ) : requestedChecks.map((k) => {
                              const meta = RISK_CHECKS.find((c) => c.key === k);
                              return <Badge key={k} variant="outline" className="text-[10px]">{meta?.short || k}</Badge>;
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" title="View PreAppliCheck" onClick={() => setViewPreAppliCheckApp(app)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-primary" title="View Final Risk Report" onClick={() => setViewPreAppliCheckApp(app)}>
                              <Sparkles className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

          {/* Booking Confirmation View */}
          <BookingConfirmationView
            open={!!viewBookingConfirmation}
            onClose={() => setViewBookingConfirmation(null)}
            data={viewBookingConfirmation}
          />
          </Tabs>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CandexClientPortal;
