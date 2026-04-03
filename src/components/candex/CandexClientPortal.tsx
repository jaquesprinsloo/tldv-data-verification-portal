import { useState } from "react";
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
import { Send, Eye, CheckCircle, ShieldCheck, Mail, Phone, CalendarIcon, AlertTriangle, Check, X, UserCheck } from "lucide-react";
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

  // Get client for this user
  const { data: client } = useQuery({
    queryKey: ["candex-my-client", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("candex_clients")
        .select("*")
        .eq("created_by", userId)
        .maybeSingle();
      return data;
    },
  });

  // Get templates
  const { data: templates } = useQuery({
    queryKey: ["candex-active-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("candex_questionnaire_templates")
        .select("id, name")
        .eq("is_active", true);
      return data || [];
    },
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

  const pendingReview = applications?.filter((a) => a.status === "submitted") || [];
  const approved = applications?.filter((a) => a.status === "approved") || [];
  const rejected = applications?.filter((a) => a.status === "rejected") || [];
  const candexed = applications?.filter((a) => a.status === "candexed") || [];

  // Send invitation
  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!client?.id) throw new Error("No client found");
      const templateId = templates?.[0]?.id || null;
      const { error } = await supabase.from("candex_invitations").insert({
        client_id: client.id,
        candidate_name: `${inviteForm.name} ${inviteForm.surname}`,
        candidate_email: inviteForm.email || null,
        candidate_phone: inviteForm.phone || null,
        candidate_id_number: inviteForm.id_number || null,
        template_id: templateId,
        created_by: userId,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Invitation sent via ${inviteMethod === "email" ? "Email" : "WhatsApp"}`);
      setInviteOpen(false);
      setInviteForm({ name: "", surname: "", phone: "", email: "", id_number: "" });
      queryClient.invalidateQueries({ queryKey: ["candex-my-invitations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Approve / Reject application
  const updateAppStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("candex_applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Application ${status}`);
      setReviewApp(null);
      queryClient.invalidateQueries({ queryKey: ["candex-my-applications"] });
    },
    onError: (e: any) => toast.error(e.message),
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
        <TabsTrigger value="candexed">Candexed</TabsTrigger>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.candidate_name}</TableCell>
                      <TableCell className="text-xs">{inv.candidate_email || inv.candidate_phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={inv.status === "completed" ? "default" : "secondary"} className="text-xs">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {inv.sent_at ? format(new Date(inv.sent_at), "dd MMM yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
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
              <DialogDescription>Fill in the candidate's details to send a CanDex pre-screening invitation.</DialogDescription>
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
                      <TableCell className="font-medium">{app.candidate_name}</TableCell>
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
        <Dialog open={!!reviewApp} onOpenChange={() => setReviewApp(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review: {reviewApp?.candidate_name}</DialogTitle>
              <DialogDescription>Review the candidate's pre-screening submission and risk assessment.</DialogDescription>
            </DialogHeader>
            {reviewApp && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">ID Number:</span> <span className="font-medium">{reviewApp.candidate_id_number || "—"}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{reviewApp.candidate_email || "—"}</span></div>
                  <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{reviewApp.candidate_phone || "—"}</span></div>
                  <div><span className="text-muted-foreground">Risk Score:</span> <span className="font-medium">{reviewApp.risk_score ?? "—"}</span></div>
                </div>
                {reviewApp.risk_level && (
                  <Card className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> Pre Risk Alert
                      </h4>
                      <p className="text-sm mt-1">Risk Level: <Badge variant={reviewApp.risk_level === "LOW" ? "default" : "destructive"}>{reviewApp.risk_level}</Badge></p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="destructive" onClick={() => { updateAppStatus.mutate({ id: reviewApp.id, status: "rejected" }); }}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button onClick={() => { updateAppStatus.mutate({ id: reviewApp.id, status: "approved" }); }}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
      <TabsContent value="candexed">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Candexed Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!candexed.length ? (
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
                  {candexed.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.candidate_name}</TableCell>
                      <TableCell className="text-xs">{app.candidate_id_number || "—"}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-600 text-white text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${app.risk_level === "LOW" || !app.risk_level ? "bg-green-600 text-white" : "bg-destructive text-destructive-foreground"}`}>
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
