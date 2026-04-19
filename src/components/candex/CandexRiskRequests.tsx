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
import { Eye, CheckCircle, ShieldCheck, AlertTriangle, FileText, Upload, Clock, Users, XCircle } from "lucide-react";
import {
  RISK_CHECKS,
  RiskCheckCell,
  RiskCheckStatusBadge,
  type RiskCheckKey,
  type RiskCheckResult,
  type RiskCheckStatus,
} from "./riskCheckTypes";

interface RiskRequest {
  id: string;
  client_id: string;
  account_id: string | null;
  requested_by: string;
  requested_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  requested_checks?: RiskCheckKey[];
}

interface RiskCandidate {
  id: string;
  request_id: string;
  application_id: string;
  id_verified: boolean | null;
  risk_assessment_result: string | null;
  risk_assessment_url: string | null;
  check_results?: Record<string, RiskCheckResult>;
  deleted_at?: string | null;
  deleted_by_name?: string | null;
}

const CandexRiskRequests = () => {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<RiskRequest | null>(null);
  const [processCandidate, setProcessCandidate] = useState<RiskCandidate | null>(null);
  const [workingResults, setWorkingResults] = useState<Record<string, RiskCheckResult>>({});
  const [uploadingKey, setUploadingKey] = useState<RiskCheckKey | null>(null);

  // Fetch all risk requests
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

  const { data: clients = [] } = useQuery({
    queryKey: ["candex-clients-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("candex_clients").select("id, name, company_name");
      return data || [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["candex-accounts-lookup"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, name, code");
      return data || [];
    },
  });

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
    const c = clients.find((x) => x.id === clientId);
    return c ? (c.company_name || c.name) : "Unknown Client";
  };
  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "—";
    const a = accounts.find((x) => x.id === accountId);
    return a ? `${a.name} (${a.code})` : "—";
  };
  const getAppDetails = (appId: string) => candidateApplications.find((a) => a.id === appId);

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const inProgressRequests = requests.filter((r) => r.status === "in_progress");
  const completedRequests = requests.filter((r) => r.status === "completed");

  const requestedChecksFor = (req?: RiskRequest | null): RiskCheckKey[] =>
    (req?.requested_checks && req.requested_checks.length > 0)
      ? req.requested_checks
      : ["id_verification", "pre_crim"]; // legacy fallback for pre-existing requests

  // Save per-check progress
  const saveResults = useMutation({
    mutationFn: async () => {
      if (!processCandidate) return;
      const requested = requestedChecksFor(selectedRequest);
      const allDone = requested.every((k) => {
        const s = workingResults[k]?.status;
        return s === "clear" || s === "flagged";
      });
      const anyFlagged = requested.some((k) => workingResults[k]?.status === "flagged");

      const { error } = await supabase
        .from("candex_risk_request_candidates")
        .update({
          check_results: workingResults,
          // Mirror legacy single-result fields so older UI bits keep working
          id_verified: workingResults.id_verification?.status === "clear",
          risk_assessment_result: allDone ? (anyFlagged ? "flagged" : "clear") : null,
        })
        .eq("id", processCandidate.id);
      if (error) throw error;

      // When every check on this candidate is processed, mirror onto the application
      if (allDone) {
        await supabase
          .from("candex_applications")
          .update({
            status: "candexed",
            risk_level: anyFlagged ? "HIGH" : "LOW",
          })
          .eq("id", processCandidate.application_id);
      }
    },
    onSuccess: () => {
      toast.success("Assessment progress saved");
      setProcessCandidate(null);
      setWorkingResults({});
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candex-risk-apps"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRequestStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("candex_risk_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(`Request marked as ${status}`);
      queryClient.invalidateQueries({ queryKey: ["candex-risk-requests-master"] });
      queryClient.invalidateQueries({ queryKey: ["candex-pending-risk-count"] });
      if (status === "completed") setSelectedRequest(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFileUploadForCheck = async (file: File, checkKey: RiskCheckKey) => {
    if (!processCandidate) return;
    setUploadingKey(checkKey);
    try {
      const ext = file.name.split(".").pop();
      const path = `risk-assessments/${processCandidate.id}_${checkKey}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("employee-documents").upload(path, file);
      if (upErr) throw upErr;
      setWorkingResults((prev) => ({
        ...prev,
        [checkKey]: { ...(prev[checkKey] || { status: "pending" }), url: path },
      }));
      toast.success(`${RISK_CHECKS.find((c) => c.key === checkKey)?.short} document uploaded`);
    } catch (e: any) {
      toast.error("Upload failed: " + e.message);
    } finally {
      setUploadingKey(null);
    }
  };

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

  const activeCandidates = requestCandidates.filter((c) => !c.deleted_at);
  const requestedForSelected = requestedChecksFor(selectedRequest);
  const allCandidatesProcessed =
    activeCandidates.length > 0 &&
    activeCandidates.every((c) => {
      const cr = c.check_results || {};
      return requestedForSelected.every((k) => {
        const s = cr[k]?.status;
        return s === "clear" || s === "flagged";
      });
    });

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
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
            <Clock className="h-5 w-5 text-amber-500" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{pendingRequests.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{inProgressRequests.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{completedRequests.length}</div></CardContent>
        </Card>
      </div>

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
                  <TableHead>Checks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const reqChecks = requestedChecksFor(req);
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{getClientName(req.client_id)}</TableCell>
                      <TableCell className="text-sm">{getAccountName(req.account_id)}</TableCell>
                      <TableCell className="text-sm">{format(new Date(req.requested_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {reqChecks.map((k) => {
                            const c = RISK_CHECKS.find((x) => x.key === k);
                            return c ? (
                              <Badge key={k} variant="outline" className="text-[10px]">{c.short}</Badge>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                      <TableCell className="text-right">
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Request Detail */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) setSelectedRequest(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Risk Assessment Request
            </DialogTitle>
            <DialogDescription>
              From: {selectedRequest ? getClientName(selectedRequest.client_id) : ""} — {selectedRequest ? getAccountName(selectedRequest.account_id) : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="text-muted-foreground">Requested:</span>
                <span className="font-medium">{format(new Date(selectedRequest.requested_date), "dd MMM yyyy")}</span>
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(selectedRequest.status)}
                <span className="text-muted-foreground ml-2">Checks requested:</span>
                <div className="flex flex-wrap gap-1">
                  {requestedForSelected.map((k) => {
                    const c = RISK_CHECKS.find((x) => x.key === k);
                    return c ? (
                      <Badge key={k} variant="outline" className="text-[10px]">{c.label}</Badge>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>ID Number</TableHead>
                      {requestedForSelected.map((k) => {
                        const c = RISK_CHECKS.find((x) => x.key === k);
                        return (
                          <TableHead key={k} className="text-center text-[10px] uppercase tracking-wide px-1" title={c?.label}>
                            {c?.short}
                          </TableHead>
                        );
                      })}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestCandidates.map((cand) => {
                      const app = getAppDetails(cand.application_id);
                      const isDeleted = !!cand.deleted_at;
                      const cr: Record<string, RiskCheckResult> = cand.check_results || {};
                      const allDone = requestedForSelected.every((k) => {
                        const s = cr[k]?.status;
                        return s === "clear" || s === "flagged";
                      });
                      return (
                        <TableRow key={cand.id} className={isDeleted ? "bg-destructive/5" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <span>{app?.candidate_name || "—"}</span>
                              {isDeleted && (
                                <Badge variant="destructive" className="text-[10px] w-fit">
                                  Deleted by {cand.deleted_by_name || "user"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{app?.candidate_id_number || "—"}</TableCell>
                          {requestedForSelected.map((k) => {
                            const c = RISK_CHECKS.find((x) => x.key === k);
                            return (
                              <TableCell key={k} className="text-center px-1">
                                <RiskCheckCell requested={true} result={cr[k]} label={c?.label || k} />
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right">
                            {isDeleted ? (
                              <span className="text-xs text-muted-foreground italic">Locked</span>
                            ) : (
                              <Button
                                variant={allDone ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => {
                                  setProcessCandidate(cand);
                                  // Seed working results from saved + ensure every requested check has an entry
                                  const seed: Record<string, RiskCheckResult> = { ...(cand.check_results || {}) };
                                  requestedForSelected.forEach((k) => {
                                    if (!seed[k]) seed[k] = { status: "pending" };
                                  });
                                  setWorkingResults(seed);
                                }}
                              >
                                {allDone ? <Eye className="h-4 w-4 mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                                {allDone ? "Review" : "Process"}
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

      {/* Per-Check Process Dialog */}
      <Dialog open={!!processCandidate} onOpenChange={(open) => { if (!open) { setProcessCandidate(null); setWorkingResults({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Process Candidate Checks</DialogTitle>
            <DialogDescription>
              Set the outcome of each requested check and optionally upload supporting documents.
            </DialogDescription>
          </DialogHeader>
          {processCandidate && (() => {
            const app = getAppDetails(processCandidate.application_id);
            return (
              <div className="space-y-4">
                <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{app?.candidate_name}</span></div>
                  <div><span className="text-muted-foreground">ID Number:</span> <span className="font-medium">{app?.candidate_id_number}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{app?.candidate_email || "—"}</span></div>
                  {app?.risk_level && (
                    <div>
                      <span className="text-muted-foreground">Pre-Risk:</span>{" "}
                      <Badge variant={app.risk_level === "LOW" ? "default" : "destructive"} className="text-xs ml-1">{app.risk_level}</Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {requestedForSelected.map((k) => {
                    const c = RISK_CHECKS.find((x) => x.key === k)!;
                    const current = workingResults[k] || { status: "pending" as RiskCheckStatus };
                    const setStatus = (status: RiskCheckStatus) =>
                      setWorkingResults((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), status } }));
                    return (
                      <div key={k} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{c.label}</span>
                            <RiskCheckStatusBadge status={current.status} />
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={current.status === "clear" ? "default" : "outline"}
                              className={current.status === "clear" ? "bg-green-600 hover:bg-green-700" : ""}
                              onClick={() => setStatus("clear")}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Clear
                            </Button>
                            <Button
                              size="sm"
                              variant={current.status === "flagged" ? "destructive" : "outline"}
                              onClick={() => setStatus("flagged")}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Flagged
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {current.url ? (
                            <div className="flex items-center gap-2 flex-1 p-1.5 bg-primary/5 rounded text-xs">
                              <FileText className="h-3.5 w-3.5 text-primary" />
                              <span className="truncate flex-1">Document attached</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() =>
                                  setWorkingResults((prev) => ({
                                    ...prev,
                                    [k]: { ...(prev[k] || { status: "pending" }), url: null },
                                  }))
                                }
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-1">
                              <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                type="file"
                                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                                className="h-7 text-xs"
                                disabled={uploadingKey === k}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleFileUploadForCheck(f, k);
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <Textarea
                          placeholder="Notes (optional)…"
                          className="text-xs min-h-[50px]"
                          value={current.notes || ""}
                          onChange={(e) =>
                            setWorkingResults((prev) => ({
                              ...prev,
                              [k]: { ...(prev[k] || { status: "pending" }), notes: e.target.value },
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setProcessCandidate(null); setWorkingResults({}); }}>Cancel</Button>
            <Button onClick={() => saveResults.mutate()} disabled={saveResults.isPending}>
              <ShieldCheck className="h-4 w-4 mr-1" /> Save Progress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandexRiskRequests;
