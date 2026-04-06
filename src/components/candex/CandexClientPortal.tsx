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
import { Send, Eye, CheckCircle, ShieldCheck, Mail, Phone, CalendarIcon, AlertTriangle, Check, X, UserCheck, Trash2, RefreshCw, Users, FileUp, Plus, BarChart3, Building2, Store, ClipboardList } from "lucide-react";
import ApplicationReviewDialog from "./ApplicationReviewDialog";
import PolygraphAppointmentDialog from "./PolygraphAppointmentDialog";
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

const CandexClientPortal = ({ userId }: CandexClientPortalProps) => {
  const queryClient = useQueryClient();
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
  const [viewRiskUrl, setViewRiskUrl] = useState<string | null>(null);
  const [appointmentOpen, setAppointmentOpen] = useState(false);

  // Bulk invite state
  const [bulkCandidates, setBulkCandidates] = useState<BulkCandidate[]>([]);
  const [bulkEntry, setBulkEntry] = useState<BulkCandidate>({ name: "", surname: "", email: "", phone: "", id_number: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkSending, setBulkSending] = useState(false);

  // Get client for this user - auto-create if not found
  const { data: client } = useQuery({
    queryKey: ["candex-my-client", userId],
    queryFn: async () => {
      const { data: existing } = await supabase
        .from("candex_clients")
        .select("*")
        .eq("created_by", userId)
        .maybeSingle();
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

  // Get applications
  const { data: applications } = useQuery({
    queryKey: ["candex-my-applications", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("candex_applications")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id,
  });

  // Get accounts user has access to
  const { data: accounts } = useQuery({
    queryKey: ["candex-accessible-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name, code");
      return data || [];
    },
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

  // Get risk request candidate statuses for approved apps
  const { data: riskCandidateData } = useQuery({
    queryKey: ["candex-risk-candidates-for-approved", client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data } = await supabase
        .from("candex_risk_request_candidates")
        .select("application_id, id_verified, risk_assessment_result, risk_assessment_url, request_id, candex_risk_requests(status)")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id,
  });

  const pendingReview = applications?.filter((a) => a.status === "submitted") || [];
  const approved = applications?.filter((a) => a.status === "approved" || a.status === "candexed") || [];
  const rejected = applications?.filter((a) => a.status === "rejected") || [];
  const preAppliChecked = applications?.filter((a) => a.status === "candexed") || [];
  const inProgress = applications?.filter((a) => a.status === "in_progress") || [];
  const totalApplications = applications?.length || 0;

  // ── Dashboard Stats ──
  const dashboardStats = {
    totalInvitations: invitations?.length || 0,
    totalApplications,
    submitted: pendingReview.length,
    approved: approved.length,
    rejected: rejected.length,
    preAppliChecked: preAppliChecked.length,
    inProgress: inProgress.length,
  };

  // ── Send single invitation ──
  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!client?.id) throw new Error("No client found");
      const templateId = clientTemplateId;
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
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Send bulk invitations ──
  const sendBulkInvites = async () => {
    if (!client?.id || bulkCandidates.length === 0) return;
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
    queryClient.invalidateQueries({ queryKey: ["candex-my-invitations"] });
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

  // Delete invitation
  const deleteInvite = useMutation({
    mutationFn: async (invId: string) => {
      const { error } = await supabase.from("candex_invitations").delete().eq("id", invId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitation deleted");
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations"] });
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
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations"] });
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
      queryClient.invalidateQueries({ queryKey: ["candex-my-applications"] });
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
      const { data: req, error: reqErr } = await supabase
        .from("candex_risk_requests" as any)
        .insert({
          client_id: client.id,
          account_id: requestAccountId,
          requested_by: userId,
          requested_date: requestDate ? format(requestDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
          status: "pending",
        } as any)
        .select("id")
        .single();
      if (reqErr) throw reqErr;
      const candidates = selectedCandidates.map((appId) => ({
        request_id: (req as any).id,
        application_id: appId,
      }));
      const { error: candErr } = await supabase.from("candex_risk_request_candidates" as any).insert(candidates as any);
      if (candErr) throw candErr;
    },
    onSuccess: () => {
      toast.success("Risk assessment request submitted");
      setRequestOpen(false);
      setSelectedCandidates([]);
      setRequestAccountId("");
      setRequestStoreId("");
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates-for-approved"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  return (
    <Tabs defaultValue="dashboard" className="space-y-6">
      <TabsList className="flex w-full max-w-3xl mx-auto gap-1">
        <TabsTrigger value="dashboard" className="flex-1 text-xs px-2">
          <BarChart3 className="h-3.5 w-3.5 mr-1" /> Dashboard
        </TabsTrigger>
        <TabsTrigger value="invite" className="flex-1 text-xs px-2">Invitations</TabsTrigger>
        <TabsTrigger value="review" className="relative flex-1 text-xs px-2">
          Review
          {pendingReview.length > 0 && (
            <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {pendingReview.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="approved" className="relative flex-1 text-xs px-2">
          PreAppliChecked
          {preAppliChecked.length > 0 && approved.length === 0 && (
            <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] animate-pulse">
              {preAppliChecked.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="preAppliChecked" className="flex-1 text-xs px-2 whitespace-nowrap">Risk Assessment Completed</TabsTrigger>
      </TabsList>

      {/* ── DASHBOARD TAB ── */}
      <TabsContent value="dashboard">
        <div className="space-y-6">
          {/* Account info */}
          {clientAccountId && (
            <Card className="border-primary/20">
              <CardContent className="py-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  Account: {accounts?.find(a => a.id === clientAccountId)?.name || "Assigned Account"}
                </span>
                {stores.length > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">{stores.length} Sub-Accounts</Badge>
                )}
              </CardContent>
            </Card>
          )}

          {/* Overall Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Total Invitations", value: dashboardStats.totalInvitations, color: "text-blue-600" },
              { label: "In Progress", value: dashboardStats.inProgress, color: "text-amber-600" },
              { label: "Submitted", value: dashboardStats.submitted, color: "text-orange-600" },
              { label: "Approved", value: dashboardStats.approved, color: "text-green-600" },
              { label: "Rejected", value: dashboardStats.rejected, color: "text-red-600" },
              { label: "PreAppliChecked", value: dashboardStats.preAppliChecked, color: "text-primary" },
              { label: "Total Applications", value: dashboardStats.totalApplications, color: "text-foreground" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="py-4 text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per Sub-Account Breakdown */}
          {stores.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Store className="h-4 w-4" /> Sub-Account Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sub-Account</TableHead>
                      <TableHead className="text-center">Code</TableHead>
                      <TableHead className="text-center">Invitations</TableHead>
                      <TableHead className="text-center">Applications</TableHead>
                      <TableHead className="text-center">Approved</TableHead>
                      <TableHead className="text-center">Checked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stores.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">{store.store_name}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{store.store_code}</TableCell>
                        <TableCell className="text-center">—</TableCell>
                        <TableCell className="text-center">—</TableCell>
                        <TableCell className="text-center">—</TableCell>
                        <TableCell className="text-center">—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Sub-account level tracking will be available once invitations are linked to specific sub-accounts.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
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

      {/* ── APPROVED TAB ── */}
      <TabsContent value="approved">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Approved Candidates</CardTitle>
            {approved.length > 0 && (
              <Button size="sm" onClick={() => setRequestOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Request Risk Assessment
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!approved.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No approved candidates yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Date Approved</TableHead>
                    <TableHead>ID Verified</TableHead>
                    <TableHead>Risk Assessment</TableHead>
                    <TableHead>Pre Risk</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approved.map((app) => {
                    const riskCandidate = riskCandidateData?.find((rc: any) => rc.application_id === app.id);
                    const requestStatus = (riskCandidate as any)?.candex_risk_requests?.status;
                    const isRequested = !!riskCandidate;
                    const isCompleted = requestStatus === "completed";
                    const isPending = isRequested && !isCompleted;
                    const idVerified = riskCandidate?.id_verified;
                    const riskResult = riskCandidate?.risk_assessment_result;
                    const riskUrl = riskCandidate?.risk_assessment_url;

                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.candidate_name}</TableCell>
                        <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {app.updated_at ? format(new Date(app.updated_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          {!isRequested ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Not Requested</Badge>
                          ) : isPending ? (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
                          ) : idVerified ? (
                            <Badge className="text-xs bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Unverified</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!isRequested ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Not Requested</Badge>
                          ) : isPending ? (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 border-blue-200">Requested</Badge>
                          ) : isCompleted && riskResult === "clear" ? (
                            <Badge className="text-xs bg-green-600 text-white"><CheckCircle className="h-3 w-3 mr-1" />No Risk Identified</Badge>
                          ) : isCompleted && riskResult === "flagged" ? (
                            <Badge className="text-xs bg-destructive text-destructive-foreground"><AlertTriangle className="h-3 w-3 mr-1" />Risk Identified</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Completed</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {app.risk_level ? (
                            <Badge className={`text-xs ${app.risk_level === "LOW" ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground"}`}>{app.risk_level}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" title="View PreAppliCheck" onClick={() => setViewPreAppliCheckApp(app)}>
                            <Eye className="h-4 w-4" />
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
                <Label>Select Candidates</Label>
                <div className="border rounded-md mt-1 max-h-48 overflow-y-auto">
                  {approved.map((app) => (
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
              <Button onClick={() => submitRiskRequest.mutate()} disabled={submitRiskRequest.isPending || !selectedCandidates.length || !requestAccountId}>
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
            {preAppliChecked.length > 0 && (
              <Button size="sm" onClick={() => setAppointmentOpen(true)}>
                <ClipboardList className="h-4 w-4 mr-1" /> Request Polygraph
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!preAppliChecked.length ? (
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
                  {preAppliChecked.map((app) => {
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
                          {riskUrl && (
                            <Button variant="ghost" size="sm" title="View Risk Assessment" onClick={async () => {
                              // If it's already a full URL (legacy), try it directly
                              if (riskUrl.startsWith("http")) {
                                setViewRiskUrl(riskUrl);
                                return;
                              }
                              // Generate a signed URL for private bucket
                              const { data, error } = await supabase.storage
                                .from("employee-documents")
                                .createSignedUrl(riskUrl, 3600);
                              if (error || !data?.signedUrl) {
                                toast.error("Could not load document");
                                return;
                              }
                              setViewRiskUrl(data.signedUrl);
                            }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
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
        <Dialog open={!!viewRiskUrl} onOpenChange={() => setViewRiskUrl(null)}>
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
          candidates={preAppliChecked.map((a) => ({
            id: a.id,
            candidate_name: a.candidate_name,
            candidate_id_number: a.candidate_id_number || null,
          }))}
          clientId={client?.id || ""}
          userId={userId}
          accountId={clientAccountId}
        />
      </TabsContent>
    </Tabs>
  );
};

export default CandexClientPortal;
