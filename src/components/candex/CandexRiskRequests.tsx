import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { Eye, CheckCircle, ShieldCheck, AlertTriangle, FileText, Upload, Clock, Users, XCircle, Layers } from "lucide-react";
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

  // Single-candidate processing
  const [processCandidate, setProcessCandidate] = useState<RiskCandidate | null>(null);
  const [workingResults, setWorkingResults] = useState<Record<string, RiskCheckResult>>({});
  const [sharedDocPath, setSharedDocPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Batch processing
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, RiskCheckResult>>({});
  const [batchDocPath, setBatchDocPath] = useState<string | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);

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
      return ((data || []) as unknown) as RiskCandidate[];
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

  // AI cost per candidate (estimated, displayed in ZAR)
  const applicationIds = requestCandidates.map((c) => c.application_id);
  const { data: aiCostMap } = useApplicationAiCosts(applicationIds);
  const { data: usdZarRate = 18.5 } = useUsdZarRate();

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
      : ["id_verification", "pre_crim"];

  const requestedForSelected = requestedChecksFor(selectedRequest);

  // -------- Shared upload helper --------
  const uploadDoc = async (file: File, prefix: string): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `risk-assessments/${prefix}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("employee-documents").upload(path, file);
    if (error) throw error;
    return path;
  };

  // -------- Single candidate save --------
  const saveResults = useMutation({
    mutationFn: async () => {
      if (!processCandidate) return;
      const requested = requestedForSelected;
      const allDone = requested.every((k) => {
        const s = workingResults[k]?.status;
        return s === "clear" || s === "flagged";
      });
      if (!allDone) throw new Error("Every requested check must be Cleared or Flagged before saving.");
      if (!sharedDocPath) throw new Error("A supporting document must be attached before saving.");

      const anyFlagged = requested.some((k) => workingResults[k]?.status === "flagged");
      // Apply shared doc to every check entry so each row links back to it
      const merged: Record<string, RiskCheckResult> = {};
      requested.forEach((k) => {
        merged[k] = { ...(workingResults[k] || { status: "pending" }), url: sharedDocPath };
      });

      const { error } = await supabase
        .from("candex_risk_request_candidates")
        .update({
          check_results: merged as any,
          risk_assessment_url: sharedDocPath,
          id_verified: merged.id_verification?.status === "clear",
          risk_assessment_result: anyFlagged ? "flagged" : "clear",
        })
        .eq("id", processCandidate.id);
      if (error) throw error;

      await supabase
        .from("candex_applications")
        .update({ status: "candexed", risk_level: anyFlagged ? "HIGH" : "LOW" })
        .eq("id", processCandidate.application_id);
    },
    onSuccess: () => {
      toast.success("Assessment saved");
      setProcessCandidate(null);
      setWorkingResults({});
      setSharedDocPath(null);
      queryClient.invalidateQueries({ queryKey: ["candex-risk-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candex-risk-apps"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // -------- Batch save --------
  const saveBatch = useMutation({
    mutationFn: async () => {
      const requested = requestedForSelected;
      const allDone = requested.every((k) => {
        const s = batchResults[k]?.status;
        return s === "clear" || s === "flagged";
      });
      if (!allDone) throw new Error("Every requested check must be Cleared or Flagged before saving.");
      if (!batchDocPath) throw new Error("A supporting document must be attached before saving.");
      if (selectedCandidateIds.size === 0) throw new Error("No candidates selected.");

      const anyFlagged = requested.some((k) => batchResults[k]?.status === "flagged");
      const merged: Record<string, RiskCheckResult> = {};
      requested.forEach((k) => {
        merged[k] = { ...(batchResults[k] || { status: "pending" }), url: batchDocPath };
      });

      const targets = requestCandidates.filter(
        (c) => selectedCandidateIds.has(c.id) && !c.deleted_at
      );

      for (const cand of targets) {
        const { error } = await supabase
          .from("candex_risk_request_candidates")
          .update({
            check_results: merged as any,
            risk_assessment_url: batchDocPath,
            id_verified: merged.id_verification?.status === "clear",
            risk_assessment_result: anyFlagged ? "flagged" : "clear",
          })
          .eq("id", cand.id);
        if (error) throw error;

        await supabase
          .from("candex_applications")
          .update({ status: "candexed", risk_level: anyFlagged ? "HIGH" : "LOW" })
          .eq("id", cand.application_id);
      }
    },
    onSuccess: () => {
      toast.success(`Assessment saved for ${selectedCandidateIds.size} candidate(s)`);
      setBatchOpen(false);
      setBatchResults({});
      setBatchDocPath(null);
      setSelectedCandidateIds(new Set());
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
  const allCandidatesProcessed =
    activeCandidates.length > 0 &&
    activeCandidates.every((c) => {
      const cr = c.check_results || {};
      return requestedForSelected.every((k) => {
        const s = cr[k]?.status;
        return s === "clear" || s === "flagged";
      });
    });

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = activeCandidates.map((c) => c.id);
    const allSelected = selectableIds.every((id) => selectedCandidateIds.has(id));
    setSelectedCandidateIds(allSelected ? new Set() : new Set(selectableIds));
  };

  // Reusable per-check status row (shared by single and batch dialogs)
  const renderCheckRows = (
    state: Record<string, RiskCheckResult>,
    setState: (next: Record<string, RiskCheckResult>) => void,
  ) =>
    requestedForSelected.map((k) => {
      const c = RISK_CHECKS.find((x) => x.key === k)!;
      const current = state[k] || { status: "pending" as RiskCheckStatus };
      const setStatus = (status: RiskCheckStatus) =>
        setState({ ...state, [k]: { ...(state[k] || {}), status } });
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
          <Textarea
            placeholder="Notes (optional)…"
            className="text-xs min-h-[50px]"
            value={current.notes || ""}
            onChange={(e) =>
              setState({ ...state, [k]: { ...(state[k] || { status: "pending" }), notes: e.target.value } })
            }
          />
        </div>
      );
    });

  // Reusable bottom-left attachment control
  const renderAttachment = (
    docPath: string | null,
    setDocPath: (p: string | null) => void,
    isUploading: boolean,
    setIsUploading: (b: boolean) => void,
    prefix: string,
  ) => (
    <div className="flex-1 min-w-0">
      {docPath ? (
        <div className="flex items-center gap-2 p-2 bg-primary/5 rounded text-xs border">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate flex-1">Document attached</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            onClick={() => setDocPath(null)}
            aria-label="Remove document"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="file"
            accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
            className="h-8 text-xs"
            disabled={isUploading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setIsUploading(true);
              try {
                const path = await uploadDoc(f, prefix);
                setDocPath(path);
                toast.success("Document uploaded");
              } catch (err: any) {
                toast.error("Upload failed: " + err.message);
              } finally {
                setIsUploading(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );

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
                            setSelectedCandidateIds(new Set());
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
      <Dialog
        open={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setSelectedCandidateIds(new Set());
          }
        }}
      >
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

              {/* Batch toolbar */}
              {activeCandidates.length > 1 && (
                <div className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded border">
                  <div className="text-xs text-muted-foreground">
                    {selectedCandidateIds.size > 0
                      ? `${selectedCandidateIds.size} candidate(s) selected`
                      : "Select candidates to process them together with the same document"}
                  </div>
                  <Button
                    size="sm"
                    disabled={selectedCandidateIds.size < 2}
                    onClick={() => {
                      const seed: Record<string, RiskCheckResult> = {};
                      requestedForSelected.forEach((k) => (seed[k] = { status: "pending" }));
                      setBatchResults(seed);
                      setBatchDocPath(null);
                      setBatchOpen(true);
                    }}
                  >
                    <Layers className="h-3.5 w-3.5 mr-1" /> Batch Process Selected
                  </Button>
                </div>
              )}

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        {activeCandidates.length > 0 && (
                          <Checkbox
                            checked={
                              activeCandidates.length > 0 &&
                              activeCandidates.every((c) => selectedCandidateIds.has(c.id))
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all candidates"
                          />
                        )}
                      </TableHead>
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
                          <TableCell className="w-8">
                            {!isDeleted && (
                              <Checkbox
                                checked={selectedCandidateIds.has(cand.id)}
                                onCheckedChange={() => toggleCandidateSelection(cand.id)}
                                aria-label={`Select ${app?.candidate_name || "candidate"}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-1">
                              <span>{app?.candidate_name || "—"}</span>
                              {(() => {
                                const usd = aiCostMap?.get(cand.application_id) ?? 0;
                                if (usd <= 0) return null;
                                return (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] w-fit font-normal text-muted-foreground border-muted-foreground/30"
                                        >
                                          AI ~ {formatZar(usd, usdZarRate)}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="text-xs">
                                        <div>Estimated AI cost for this check</div>
                                        <div className="text-muted-foreground mt-1">
                                          {formatUsd(usd)} @ R{usdZarRate.toFixed(2)}/USD
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
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
                                  const seed: Record<string, RiskCheckResult> = { ...(cand.check_results || {}) };
                                  requestedForSelected.forEach((k) => {
                                    if (!seed[k]) seed[k] = { status: "pending" };
                                  });
                                  setWorkingResults(seed);
                                  // Pre-load any existing shared doc
                                  const existingUrl =
                                    cand.risk_assessment_url ||
                                    requestedForSelected.map((k) => seed[k]?.url).find(Boolean) ||
                                    null;
                                  setSharedDocPath(existingUrl);
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

      {/* Single Candidate Process Dialog */}
      <Dialog
        open={!!processCandidate}
        onOpenChange={(open) => {
          if (!open) {
            setProcessCandidate(null);
            setWorkingResults({});
            setSharedDocPath(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Process Candidate Checks</DialogTitle>
            <DialogDescription>
              Set the outcome of every requested check. A single supporting document is required.
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
                  {renderCheckRows(workingResults, setWorkingResults)}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="!justify-between gap-3 items-center flex-wrap">
            {renderAttachment(sharedDocPath, setSharedDocPath, uploading, setUploading, processCandidate?.id || "doc")}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setProcessCandidate(null);
                  setWorkingResults({});
                  setSharedDocPath(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => saveResults.mutate()} disabled={saveResults.isPending || uploading}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Save Assessment
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Process Dialog */}
      <Dialog
        open={batchOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchOpen(false);
            setBatchResults({});
            setBatchDocPath(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> Batch Process Candidates
            </DialogTitle>
            <DialogDescription>
              Apply the same outcomes and supporting document to {selectedCandidateIds.size} selected candidate(s).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg text-xs space-y-1 max-h-32 overflow-y-auto">
              <div className="text-muted-foreground font-medium mb-1">Applies to:</div>
              {requestCandidates
                .filter((c) => selectedCandidateIds.has(c.id))
                .map((c) => {
                  const app = getAppDetails(c.application_id);
                  return (
                    <div key={c.id}>
                      • {app?.candidate_name || "—"} <span className="text-muted-foreground">({app?.candidate_id_number || "no ID"})</span>
                    </div>
                  );
                })}
            </div>

            <div className="space-y-3">
              {renderCheckRows(batchResults, setBatchResults)}
            </div>
          </div>

          <DialogFooter className="!justify-between gap-3 items-center flex-wrap">
            {renderAttachment(batchDocPath, setBatchDocPath, batchUploading, setBatchUploading, `batch_${selectedRequest?.id || "x"}`)}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBatchOpen(false)}>Cancel</Button>
              <Button onClick={() => saveBatch.mutate()} disabled={saveBatch.isPending || batchUploading}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Save for {selectedCandidateIds.size} Candidate(s)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandexRiskRequests;
