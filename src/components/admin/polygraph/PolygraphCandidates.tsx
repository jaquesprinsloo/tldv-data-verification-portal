import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye, Check, X, Send, Users, Clock, UserCheck, UserX, Trash2, FileText, Mail, MessageSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import RiskProfileDialog from "@/components/shared/RiskProfileDialog";

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  id_number: string;
  email: string | null;
  contact_number: string | null;
  position: string | null;
  status: string;
  created_at: string;
  report_id: string;
  store_id: string | null;
  employee_id: string | null;
  stores?: { store_name: string } | null;
  polygraph_reports?: {
    overall_result: string | null;
    examination_date: string;
  } | null;
}

const PolygraphCandidates = () => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [candidateToDelete, setCandidateToDelete] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [riskProfileOpen, setRiskProfileOpen] = useState(false);
  const [riskProfileCandidate, setRiskProfileCandidate] = useState<Candidate | null>(null);
  const [invitationMethod, setInvitationMethod] = useState<"email" | "whatsapp">("email");

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const { data, error } = await supabase
        .from("polygraph_candidates")
        .select(`
          *,
          stores(store_name),
          polygraph_reports(overall_result, examination_date)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCandidates(data || []);
    } catch (error: any) {
      console.error("Error fetching candidates:", error);
      toast({
        title: "Error",
        description: "Failed to load candidates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCandidate) return;
    
    // Validate that we have the required contact method
    if (invitationMethod === "email" && !selectedCandidate.email) {
      toast({
        title: "Email Required",
        description: "This candidate does not have an email address. Please select WhatsApp instead.",
        variant: "destructive",
      });
      return;
    }
    
    if (invitationMethod === "whatsapp" && !selectedCandidate.contact_number) {
      toast({
        title: "Phone Number Required",
        description: "This candidate does not have a phone number. Please select Email instead.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessing(true);

    try {
      // Use secure database function to approve candidate
      const { data, error } = await supabase
        .rpc("approve_polygraph_candidate", {
          _candidate_id: selectedCandidate.id,
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result) throw new Error("No result returned from approval");

      // Send invitation based on selected method
      if (invitationMethod === "email" && result.email) {
        await supabase.functions.invoke("send-invitation-email", {
          body: {
            email: result.email,
            employeeNumber: result.employee_number,
            token: result.token,
            otp: result.otp,
          },
        });
      } else if (invitationMethod === "whatsapp" && result.contact_number) {
        const { error: whatsappError } = await supabase.functions.invoke("send-whatsapp-invitation", {
          body: {
            phoneNumber: result.contact_number,
            employeeNumber: result.employee_number,
            firstName: result.first_name,
            lastName: result.last_name,
            token: result.token,
            otp: result.otp,
          },
        });
        
        if (whatsappError) throw whatsappError;
      }

      toast({
        title: "Candidate Approved",
        description: `${result.first_name} ${result.last_name} has been approved and an invitation has been sent via ${invitationMethod === "email" ? "email" : "WhatsApp"}.`,
      });

      setActionDialogOpen(false);
      setSelectedCandidate(null);
      setInvitationMethod("email");
      fetchCandidates();
    } catch (error: any) {
      console.error("Error approving candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve candidate",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCandidate || !rejectionReason) return;
    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("polygraph_candidates")
        .update({
          status: "rejected",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedCandidate.id);

      if (error) throw error;

      toast({
        title: "Candidate Rejected",
        description: `${selectedCandidate.first_name} ${selectedCandidate.last_name} has been rejected.`,
      });

      setActionDialogOpen(false);
      setSelectedCandidate(null);
      setRejectionReason("");
      fetchCandidates();
    } catch (error: any) {
      console.error("Error rejecting candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject candidate",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openActionDialog = (candidate: Candidate, type: "approve" | "reject") => {
    setSelectedCandidate(candidate);
    setActionType(type);
    setActionDialogOpen(true);
    setRejectionReason("");
    // Set default invitation method based on available contact info
    if (type === "approve") {
      if (candidate.email) {
        setInvitationMethod("email");
      } else if (candidate.contact_number) {
        setInvitationMethod("whatsapp");
      } else {
        setInvitationMethod("email");
      }
    }
  };

  const handleDelete = async () => {
    if (!candidateToDelete) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from("polygraph_candidates")
        .delete()
        .eq("id", candidateToDelete.id);

      if (error) throw error;

      toast({
        title: "Candidate Deleted",
        description: `${candidateToDelete.first_name} ${candidateToDelete.last_name} has been deleted.`,
      });

      setDeleteDialogOpen(false);
      setCandidateToDelete(null);
      fetchCandidates();
    } catch (error: any) {
      console.error("Error deleting candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete candidate",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (candidate: Candidate) => {
    setCandidateToDelete(candidate);
    setDeleteDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
      pending_review: { variant: "outline", icon: <Clock className="h-3 w-3 mr-1" /> },
      approved: { variant: "default", icon: <UserCheck className="h-3 w-3 mr-1" /> },
      rejected: { variant: "destructive", icon: <UserX className="h-3 w-3 mr-1" /> },
    };
    const config = variants[status] || variants.pending_review;
    return (
      <Badge variant={config.variant} className="flex items-center w-fit">
        {config.icon}
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return null;
    if (result === "passed") {
      return <Badge className="bg-green-600 hover:bg-green-700 text-white">{result}</Badge>;
    }
    if (result === "failed") {
      return <Badge className="bg-red-600 hover:bg-red-700 text-white">{result}</Badge>;
    }
    // inconclusive or other
    return <Badge variant="secondary">{result}</Badge>;
  };

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id_number.includes(searchQuery);
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = candidates.filter((c) => c.status === "pending_review").length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Polygraph Candidates
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCount} Pending
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Review and approve candidates from completed polygraph examinations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "pending_review" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("pending_review")}
              >
                Pending
              </Button>
              <Button
                variant={statusFilter === "approved" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("approved")}
              >
                Approved
              </Button>
              <Button
                variant={statusFilter === "rejected" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("rejected")}
              >
                Rejected
              </Button>
            </div>
          </div>

          {filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No candidates found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>ID Number</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Exam Date</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {candidate.first_name} {candidate.last_name}
                          </p>
                          {candidate.position && (
                            <p className="text-sm text-muted-foreground">{candidate.position}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{candidate.id_number}</TableCell>
                      <TableCell>{candidate.stores?.store_name || "N/A"}</TableCell>
                      <TableCell>
                        {candidate.polygraph_reports?.examination_date
                          ? format(new Date(candidate.polygraph_reports.examination_date), "dd MMM yyyy")
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {getResultBadge(candidate.polygraph_reports?.overall_result || null)}
                      </TableCell>
                      <TableCell>{getStatusBadge(candidate.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRiskProfileCandidate(candidate);
                              setRiskProfileOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Risk Profile
                          </Button>
                          {candidate.status === "pending_review" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => openActionDialog(candidate, "approve")}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => openActionDialog(candidate, "reject")}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          {candidate.status === "approved" && (
                            <Badge variant="outline" className="text-muted-foreground">Processed</Badge>
                          )}
                          {candidate.status === "rejected" && (
                            <Badge variant="outline" className="text-muted-foreground">Processed</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openDeleteDialog(candidate)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Candidate" : "Reject Candidate"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? `Approve ${selectedCandidate?.first_name} ${selectedCandidate?.last_name} and send an invitation to complete their profile.`
                : `Please provide a reason for rejecting ${selectedCandidate?.first_name} ${selectedCandidate?.last_name}.`}
            </DialogDescription>
          </DialogHeader>

          {actionType === "approve" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Invitation Method *</Label>
                <RadioGroup
                  value={invitationMethod}
                  onValueChange={(value) => setInvitationMethod(value as "email" | "whatsapp")}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="relative">
                    <RadioGroupItem
                      value="email"
                      id="method-email"
                      className="peer sr-only"
                      disabled={!selectedCandidate?.email}
                    />
                    <Label
                      htmlFor="method-email"
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all
                        ${!selectedCandidate?.email ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'}
                        ${invitationMethod === 'email' && selectedCandidate?.email ? 'border-primary bg-primary/5' : 'border-muted'}
                      `}
                    >
                      <Mail className={`h-6 w-6 mb-2 ${invitationMethod === 'email' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium">Email</span>
                      <span className="text-xs text-muted-foreground mt-1 text-center truncate max-w-full">
                        {selectedCandidate?.email || "Not available"}
                      </span>
                    </Label>
                  </div>
                  <div className="relative">
                    <RadioGroupItem
                      value="whatsapp"
                      id="method-whatsapp"
                      className="peer sr-only"
                      disabled={!selectedCandidate?.contact_number}
                    />
                    <Label
                      htmlFor="method-whatsapp"
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all
                        ${!selectedCandidate?.contact_number ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'}
                        ${invitationMethod === 'whatsapp' && selectedCandidate?.contact_number ? 'border-primary bg-primary/5' : 'border-muted'}
                      `}
                    >
                      <MessageSquare className={`h-6 w-6 mb-2 ${invitationMethod === 'whatsapp' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium">WhatsApp</span>
                      <span className="text-xs text-muted-foreground mt-1 text-center truncate max-w-full">
                        {selectedCandidate?.contact_number || "Not available"}
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              {!selectedCandidate?.email && !selectedCandidate?.contact_number && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  This candidate has no email or phone number. Please add contact information before approving.
                </div>
              )}
            </div>
          )}

          {actionType === "reject" && (
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejection..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            {actionType === "approve" ? (
              <Button 
                onClick={handleApprove} 
                disabled={processing || (!selectedCandidate?.email && !selectedCandidate?.contact_number)}
                className="gap-2"
              >
                {invitationMethod === "email" ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                {processing ? "Processing..." : `Approve & Send via ${invitationMethod === "email" ? "Email" : "WhatsApp"}`}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing || !rejectionReason}
              >
                {processing ? "Processing..." : "Reject Candidate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Candidate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {candidateToDelete?.first_name} {candidateToDelete?.last_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Risk Profile Dialog */}
      <RiskProfileDialog
        open={riskProfileOpen}
        onOpenChange={setRiskProfileOpen}
        employeeId={riskProfileCandidate?.employee_id || undefined}
        reportId={riskProfileCandidate?.report_id}
        candidateName={riskProfileCandidate ? `${riskProfileCandidate.first_name} ${riskProfileCandidate.last_name}` : undefined}
      />
    </>
  );
};

export default PolygraphCandidates;
