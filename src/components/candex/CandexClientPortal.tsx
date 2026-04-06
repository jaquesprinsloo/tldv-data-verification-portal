import { useState } from "react";

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
import { toast } from "sonner";
import { Send, Eye, CheckCircle, ShieldCheck, Mail, Phone, CalendarIcon, AlertTriangle, Check, X, UserCheck, Trash2, RefreshCw } from "lucide-react";
import ApplicationReviewDialog from "./ApplicationReviewDialog";
import { format } from "date-fns";

interface CandexClientPortalProps {
  userId: string;
}

const CandexClientPortal = ({ userId }: CandexClientPortalProps) => {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<"email" | "whatsapp">("email");
  const [inviteForm, setInviteForm] = useState({ name: "", surname: "", phone: "", email: "", id_number: "" });
  const [reviewApp, setReviewApp] = useState<any>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDate, setRequestDate] = useState<Date | undefined>(new Date());
  const [requestAccountId, setRequestAccountId] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [viewRiskUrl, setViewRiskUrl] = useState<string | null>(null);

  // Get client for this user - auto-create if not found
  const { data: client } = useQuery({
    queryKey: ["candex-my-client", userId],
    queryFn: async () => {
      // First try to find existing client
      const { data: existing } = await supabase
        .from("candex_clients")
        .select("*")
        .eq("created_by", userId)
        .maybeSingle();
      if (existing) return existing;

      // Auto-create a client record for this admin
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

  // Template is assigned by master admin via client record
  const clientTemplateId = (client as any)?.template_id || null;

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
  const approved = applications?.filter((a) => a.status === "approved") || [];
  const rejected = applications?.filter((a) => a.status === "rejected") || [];
  const preAppliChecked = applications?.filter((a) => a.status === "preAppliChecked") || [];

  // Send invitation
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
            .update({
              ...invitationPayload,
              status: existingInvite.status === "opened" ? "opened" : "sent",
            })
            .eq("id", existingInvite.id)
            .select()
            .single()
        : await supabase
            .from("candex_invitations")
            .insert({
              ...invitationPayload,
              status: "sent",
            })
            .select()
            .single();
      if (error) throw error;

      // Send the actual email/WhatsApp
      if (inviteMethod === "email" && candidateEmail) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
        const { error: emailError } = await supabase.functions.invoke("send-candex-invitation", {
          body: {
            email: candidateEmail,
            candidateName,
            invitationLink: portalUrl,
          },
        });
        if (emailError) {
          console.error("Email send error:", emailError);
          throw new Error("Invitation saved but email failed to send");
        }
      } else if (inviteMethod === "whatsapp" && candidatePhone) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${invData.token}`;
        const { error: waError } = await supabase.functions.invoke("send-whatsapp-invitation", {
          body: {
            phone: candidatePhone,
            message: `Hi ${inviteForm.name}, you've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}`,
          },
        });
        if (waError) {
          console.error("WhatsApp send error:", waError);
          throw new Error("Invitation saved but WhatsApp message failed to send");
        }
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
          body: {
            email: inv.candidate_email,
            candidateName: inv.candidate_name,
            invitationLink: portalUrl,
          },
        });
        if (emailError) throw new Error("Failed to resend email");
      } else if (inv.candidate_phone) {
        const portalUrl = `${PUBLISHED_URL}/candex-apply?token=${inv.token}`;
        const { error: waError } = await supabase.functions.invoke("send-whatsapp-invitation", {
          body: {
            phone: inv.candidate_phone,
            message: `Reminder: You've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}`,
          },
        });
        if (waError) throw new Error("Failed to resend WhatsApp message");
      }
      // Update sent_at timestamp
      const nextStatus = inv.status === "opened" ? "opened" : "sent";
      await supabase
        .from("candex_invitations")
        .update({ sent_at: new Date().toISOString(), status: nextStatus })
        .eq("id", inv.id);
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
      // Create request
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
      // Add candidates
      const candidates = selectedCandidates.map((appId) => ({
        request_id: (req as any).id,
        application_id: appId,
      }));
      const { error: candErr } = await supabase
        .from("candex_risk_request_candidates" as any)
        .insert(candidates as any);
      if (candErr) throw candErr;
    },
    onSuccess: () => {
      toast.success("Risk assessment request submitted");
      setRequestOpen(false);
      setSelectedCandidates([]);
      setRequestAccountId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleCandidate = (id: string) => {
    setSelectedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <Tabs defaultValue="invite" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4 max-w-lg mx-auto">
        <TabsTrigger value="invite">Invite</TabsTrigger>
        <TabsTrigger value="review" className="relative">
          Review
          {pendingReview.length > 0 && (
            <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {pendingReview.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="approved">Approved</TabsTrigger>
        <TabsTrigger value="preAppliChecked">PreAppliChecked</TabsTrigger>
      </TabsList>

      {/* ── INVITE TAB ── */}
      <TabsContent value="invite">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Candidate Invitations</CardTitle>
            <Button onClick={() => setInviteOpen(true)} size="sm">
              <Send className="h-4 w-4 mr-1" /> Invite Candidate
            </Button>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Resend invitation"
                              onClick={() => resendInvite.mutate(inv)}
                              disabled={resendInvite.isPending}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Delete invitation"
                            onClick={() => {
                              if (confirm("Delete this invitation?")) deleteInvite.mutate(inv.id);
                            }}
                            disabled={deleteInvite.isPending}
                          >
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

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Candidate</DialogTitle>
              <DialogDescription>Fill in the candidate's details to send a PreAppliCheck invitation.</DialogDescription>
            </DialogHeader>
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
                  <Button variant={inviteMethod === "email" ? "default" : "outline"} size="sm" onClick={() => setInviteMethod("email")}>
                    <Mail className="h-4 w-4 mr-1" /> Email
                  </Button>
                  <Button variant={inviteMethod === "whatsapp" ? "default" : "outline"} size="sm" onClick={() => setInviteMethod("whatsapp")}>
                    <Phone className="h-4 w-4 mr-1" /> WhatsApp
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => sendInvite.mutate()} disabled={!inviteForm.name || !inviteForm.surname || sendInvite.isPending}>
                <Send className="h-4 w-4 mr-1" /> Send Invitation
              </Button>
            </DialogFooter>
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
                          <Badge variant={app.risk_level === "LOW" ? "default" : "destructive"} className="text-xs">
                            {app.risk_level}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {app.submitted_at ? format(new Date(app.submitted_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setReviewApp(app)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-primary" onClick={() => updateAppStatus.mutate({ id: app.id, status: "approved" })}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateAppStatus.mutate({ id: app.id, status: "rejected" })}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Review Detail Dialog */}
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
                    <TableHead>ID Verified</TableHead>
                    <TableHead>Risk Assessment</TableHead>
                    <TableHead>Pre Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approved.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.candidate_name}</TableCell>
                      <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">Pending</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">Pending</span>
                      </TableCell>
                      <TableCell>
                        {app.risk_level ? (
                          <Badge variant={app.risk_level === "LOW" ? "default" : "destructive"} className="text-xs">
                            {app.risk_level}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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
                <Select value={requestAccountId} onValueChange={setRequestAccountId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

      {/* ── CANDEXED TAB ── */}
      <TabsContent value="preAppliChecked">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> PreAppliChecked Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!preAppliChecked.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No fully screened candidates yet.</p>
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
                  {preAppliChecked.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.candidate_name}</TableCell>
                      <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                      <TableCell>
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${app.risk_level === "LOW" || !app.risk_level ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
                          {app.risk_level === "LOW" || !app.risk_level ? "Clear" : "Flagged"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm">
                          Schedule Polygraph
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

export default CandexClientPortal;
