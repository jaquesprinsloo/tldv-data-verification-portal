import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { Eye, CheckCircle, XCircle, ShieldCheck, AlertTriangle, FileText, Upload, Clock, Users } from "lucide-react";

interface RiskRequest {
  id: string;
  client_id: string;
  account_id: string | null;
  requested_by: string;
  requested_date: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface RiskCandidate {
  id: string;
  request_id: string;
  application_id: string;
  id_verified: boolean | null;
  risk_assessment_result: string | null;
  risk_assessment_url: string | null;
}

const CandexRiskRequests = () => {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<RiskRequest | null>(null);
  const [processCandidate, setProcessCandidate] = useState<any>(null);
  const [assessmentResult, setAssessmentResult] = useState<string>("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [idVerified, setIdVerified] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [assessmentFile, setAssessmentFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  // Fetch all risk requests with client info
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["candex-risk-requests-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candex_risk_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as RiskRequest[];
    },
  });

  // Fetch clients for name lookup
  const { data: clients = [] } = useQuery({
    queryKey: ["candex-clients-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("candex_clients").select("id, name, company_name");
      return data || [];
    },
  });

  // Fetch accounts for name lookup
  const { data: accounts = [] } = useQuery({
    queryKey: ["candex-accounts-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name, code");
      return data || [];
    },
  });

  // Fetch candidates for selected request
  const { data: requestCandidates = [] } = useQuery({
    queryKey: ["candex-risk-candidates", selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest?.id) return [];
      const { data, error } = await supabase
        .from("candex_risk_request_candidates")
        .select("*")
        .eq("request_id", selectedRequest.id);
      if (error) throw error;
      return (data || []) as RiskCandidate[];
    },
    enabled: !!selectedRequest?.id,
  });

  // Fetch application details for candidates
  const { data: candidateApplications = [] } = useQuery({
    queryKey: ["candex-risk-apps", requestCandidates.map((c) => c.application_id).join(",")],
    queryFn: async () => {
      if (requestCandidates.length === 0) return [];
      const ids = requestCandidates.map((c) => c.application_id);
      const { data } = await supabase
        .from("candex_applications")
        .select("id, candidate_name, candidate_id_number, candidate_email, candidate_phone, risk_level, risk_score")
        .in("id", ids);
      return data || [];
    },
    enabled: requestCandidates.length > 0,
  });

  const getClientName = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    return client ? (client.company_name || client.name) : "Unknown Client";
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "—";
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.name} (${account.code})` : "—";
  };

  const getAppDetails = (appId: string) => {
    return candidateApplications.find((a) => a.id === appId);
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const inProgressRequests = requests.filter((r) => r.status === "in_progress");
  const completedRequests = requests.filter((r) => r.status === "completed");

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `risk-assessments/${processCandidate.id}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("employee-documents")
        .getPublicUrl(filePath);
      setUploadedFileUrl(urlData.publicUrl);
      toast.success("File uploaded successfully");
    } catch (e: any) {
      toast.error("Upload failed: " + e.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Process a candidate's risk assessment
  const processCandidateMutation = useMutation({
    mutationFn: async () => {
      if (!processCandidate) return;
      const { error } = await supabase
        .from("candex_risk_request_candidates")
        .update({
          id_verified: idVerified,
          risk_assessment_result: assessmentResult,
          risk_assessment_url: uploadedFileUrl,
        })
        .eq("id", processCandidate.id);
      if (error) throw error;

      // Also update the application status to "candexed" if result is provided
      if (assessmentResult) {
        const app = getAppDetails(processCandidate.application_id);
        if (app) {
          await supabase
            .from("candex_applications")
            .update({
              status: "candexed",
              risk_level: assessmentResult === "clear" ? "LOW" : "HIGH",
            })
            .eq("id", processCandidate.application_id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Candidate assessment updated");
      setProcessCandidate(null);
      setAssessmentResult("");
      setAssessmentNotes("");
      setIdVerified(false);
      setAssessmentFile(null);
      setUploadedFileUrl(null);
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candex-risk-apps"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Update request status
  const updateRequestStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("candex_risk_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Request marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ["candex-risk-requests-master"] });
      if (status === "completed") setSelectedRequest(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 gap-1"><ShieldCheck className="h-3 w-3" /> In Progress</Badge>;
      case "completed":
        return <Badge className="bg-primary/15 text-primary gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const allCandidatesProcessed = requestCandidates.length > 0 &&
    requestCandidates.every((c) => c.risk_assessment_result);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">Loading risk requests...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
            <Clock className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{inProgressRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedRequests.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" /> Risk Assessment Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No risk assessment requests received yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Requested Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{getClientName(req.client_id)}</TableCell>
                    <TableCell className="text-sm">{getAccountName(req.account_id)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(req.requested_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            if (req.status === "pending") {
                              updateRequestStatus.mutate({ id: req.id, status: "in_progress" });
                            }
                          }}
                        >
                          <Eye className="h-4 w-4" />
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

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Risk Assessment Request
            </DialogTitle>
            <DialogDescription>
              From: {selectedRequest ? getClientName(selectedRequest.client_id) : ""} — {selectedRequest ? getAccountName(selectedRequest.account_id) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Requested:</span>
                <span className="font-medium">{format(new Date(selectedRequest.requested_date), "dd MMM yyyy")}</span>
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(selectedRequest.status)}
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>ID Number</TableHead>
                      <TableHead>ID Verified</TableHead>
                      <TableHead>Risk Result</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestCandidates.map((cand) => {
                      const app = getAppDetails(cand.application_id);
                      return (
                        <TableRow key={cand.id}>
                          <TableCell className="font-medium">{app?.candidate_name || "—"}</TableCell>
                          <TableCell className="text-sm">{app?.candidate_id_number || "—"}</TableCell>
                          <TableCell>
                            {cand.id_verified ? (
                              <Badge className="bg-primary/15 text-primary text-xs gap-1">
                                <CheckCircle className="h-3 w-3" /> Verified
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Pending</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {cand.risk_assessment_result === "clear" ? (
                              <Badge className="bg-primary/15 text-primary text-xs gap-1">
                                <CheckCircle className="h-3 w-3" /> Clear
                              </Badge>
                            ) : cand.risk_assessment_result === "flagged" ? (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" /> Flagged
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Awaiting</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!cand.risk_assessment_result ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setProcessCandidate(cand);
                                  setIdVerified(cand.id_verified || false);
                                  setAssessmentResult(cand.risk_assessment_result || "");
                                  setUploadedFileUrl(cand.risk_assessment_url || null);
                                  setAssessmentFile(null);
                                }}
                              >
                                <FileText className="h-4 w-4 mr-1" /> Process
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setProcessCandidate(cand);
                                  setIdVerified(cand.id_verified || false);
                                  setAssessmentResult(cand.risk_assessment_result || "");
                                  setUploadedFileUrl(cand.risk_assessment_url || null);
                                  setAssessmentFile(null);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {selectedRequest.status !== "completed" && allCandidatesProcessed && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateRequestStatus.mutate({ id: selectedRequest.id, status: "completed" })}
                    disabled={updateRequestStatus.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Mark Request Complete
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Process Candidate Dialog */}
      <Dialog open={!!processCandidate} onOpenChange={(open) => { if (!open) setProcessCandidate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Candidate Assessment</DialogTitle>
            <DialogDescription>
              Verify the candidate's ID and assign a risk assessment result.
            </DialogDescription>
          </DialogHeader>
          {processCandidate && (
            <div className="space-y-4">
              {(() => {
                const app = getAppDetails(processCandidate.application_id);
                return (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                    <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{app?.candidate_name}</span></div>
                    <div><span className="text-muted-foreground">ID Number:</span> <span className="font-medium">{app?.candidate_id_number}</span></div>
                    <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{app?.candidate_email || "—"}</span></div>
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{app?.candidate_phone || "—"}</span></div>
                    {app?.risk_level && (
                      <div><span className="text-muted-foreground">Pre-Risk:</span> <Badge variant={app.risk_level === "LOW" ? "default" : "destructive"} className="text-xs ml-1">{app.risk_level}</Badge></div>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center gap-3">
                <Label className="flex-1">ID Verification</Label>
                <div className="flex gap-2">
                  <Button
                    variant={idVerified ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIdVerified(true)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Verified
                  </Button>
                  <Button
                    variant={!idVerified ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => setIdVerified(false)}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Not Verified
                  </Button>
                </div>
              </div>

              <div>
                <Label>Risk Assessment Result</Label>
                <Select value={assessmentResult} onValueChange={setAssessmentResult}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clear">Clear</SelectItem>
                    <SelectItem value="flagged">Flagged</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={assessmentNotes}
                  onChange={(e) => setAssessmentNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Upload Risk Assessment Document</Label>
                <div className="mt-1 space-y-2">
                  {uploadedFileUrl ? (
                    <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg text-sm">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">{assessmentFile?.name || "Document uploaded"}</span>
                      <Button variant="ghost" size="sm" onClick={() => { setUploadedFileUrl(null); setAssessmentFile(null); }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">Upload PDF, DOCX, or image</p>
                      <Input
                        type="file"
                        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                        className="max-w-xs mx-auto"
                        disabled={uploadingFile}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setAssessmentFile(file);
                            handleFileUpload(file);
                          }
                        }}
                      />
                      {uploadingFile && <p className="text-xs text-muted-foreground mt-2">Uploading...</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProcessCandidate(null)}>Cancel</Button>
            <Button
              onClick={() => processCandidateMutation.mutate()}
              disabled={!assessmentResult || processCandidateMutation.isPending}
            >
              <ShieldCheck className="h-4 w-4 mr-1" /> Save Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandexRiskRequests;
