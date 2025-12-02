import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  FileText, 
  ClipboardCheck, 
  ShieldCheck,
  ExternalLink,
  Loader2,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Store {
  id: string;
  store_name: string;
}

interface PendingUpload {
  id: string;
  document_type: string;
  file_url: string;
  file_name: string;
  extracted_store_name: string | null;
  matched_store_id: string | null;
  confidence_score: number | null;
  extracted_data: unknown;
  status: string;
  created_at: string;
}

interface PendingUploadsReviewTabProps {
  accountId: string;
  canEdit: boolean;
  refreshTrigger: number;
}

export const PendingUploadsReviewTab = ({ accountId, canEdit, refreshTrigger }: PendingUploadsReviewTabProps) => {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<PendingUpload | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [accountId, refreshTrigger]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uploadsResult, storesResult] = await Promise.all([
        supabase
          .from("pending_document_uploads")
          .select("*")
          .eq("account_id", accountId)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("stores")
          .select("id, store_name")
          .eq("account_id", accountId)
          .order("store_name"),
      ]);

      if (uploadsResult.error) throw uploadsResult.error;
      if (storesResult.error) throw storesResult.error;

      setPendingUploads(uploadsResult.data || []);
      setStores(storesResult.data || []);
    } catch (error) {
      console.error("Error fetching pending uploads:", error);
      toast.error("Failed to load pending uploads");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (upload: PendingUpload, overrideStoreId?: string) => {
    const storeId = overrideStoreId || upload.matched_store_id;
    
    if (!storeId) {
      setSelectedUpload(upload);
      setSelectedStoreId("");
      return;
    }

    setProcessing(upload.id);
    try {
      const response = await supabase.functions.invoke("approve-pending-upload", {
        body: {
          uploadId: upload.id,
          storeId,
          action: "approve",
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to approve upload");
      }

      toast.success("Document approved and assigned to sub-account");
      fetchData();
    } catch (error) {
      console.error("Approval error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to approve upload");
    } finally {
      setProcessing(null);
      setSelectedUpload(null);
    }
  };

  const handleReject = async () => {
    if (!selectedUpload) return;

    setProcessing(selectedUpload.id);
    try {
      const response = await supabase.functions.invoke("approve-pending-upload", {
        body: {
          uploadId: selectedUpload.id,
          action: "reject",
          rejectionReason,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to reject upload");
      }

      toast.success("Document rejected");
      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedUpload(null);
      fetchData();
    } catch (error) {
      console.error("Rejection error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to reject upload");
    } finally {
      setProcessing(null);
    }
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case "invoice":
        return <FileText className="h-4 w-4" />;
      case "polygraph_report":
        return <ClipboardCheck className="h-4 w-4" />;
      case "risk_assessment":
        return <ShieldCheck className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getConfidenceBadge = (score: number | null) => {
    if (score === null) return <Badge variant="outline">Unknown</Badge>;
    if (score >= 0.8) return <Badge className="bg-green-500">High ({(score * 100).toFixed(0)}%)</Badge>;
    if (score >= 0.5) return <Badge className="bg-yellow-500">Medium ({(score * 100).toFixed(0)}%)</Badge>;
    return <Badge variant="destructive">Low ({(score * 100).toFixed(0)}%)</Badge>;
  };

  const getMatchedStoreName = (upload: PendingUpload) => {
    if (!upload.matched_store_id) return "No match";
    const store = stores.find(s => s.id === upload.matched_store_id);
    return store?.store_name || "Unknown store";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            Pending Document Review
          </CardTitle>
          <CardDescription>
            Review uploaded documents and confirm sub-account assignments before approval.
            {!canEdit && " (View Only - Master Admin required for approval)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingUploads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No pending documents to review</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Detected Store</TableHead>
                  <TableHead>Matched Sub-Account</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUploads.map((upload) => (
                  <TableRow key={upload.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getDocumentTypeIcon(upload.document_type)}
                        <span className="capitalize">{upload.document_type.replace("_", " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={upload.file_name}>
                      {upload.file_name}
                    </TableCell>
                    <TableCell>{upload.extracted_store_name || "Not detected"}</TableCell>
                    <TableCell>{getMatchedStoreName(upload)}</TableCell>
                    <TableCell>{getConfidenceBadge(upload.confidence_score)}</TableCell>
                    <TableCell>{format(new Date(upload.created_at), "PP")}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUpload(upload);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(upload.file_url, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              disabled={processing === upload.id}
                              onClick={() => handleApprove(upload)}
                            >
                              {processing === upload.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={processing === upload.id}
                              onClick={() => {
                                setSelectedUpload(upload);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Store Selection Dialog */}
      <Dialog open={!!selectedUpload && !rejectDialogOpen && !detailsDialogOpen} onOpenChange={(open) => !open && setSelectedUpload(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Sub-Account</DialogTitle>
            <DialogDescription>
              {selectedUpload?.matched_store_id 
                ? "Confirm or change the matched sub-account for this document."
                : "No sub-account was automatically matched. Please select one manually."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Detected Store Name</Label>
              <p className="text-sm text-muted-foreground">
                {selectedUpload?.extracted_store_name || "Not detected"}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assign to Sub-Account</Label>
              <Select 
                value={selectedStoreId || selectedUpload?.matched_store_id || ""} 
                onValueChange={setSelectedStoreId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a sub-account" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUpload(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedUpload && handleApprove(selectedUpload, selectedStoreId)}
              disabled={!selectedStoreId && !selectedUpload?.matched_store_id}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
          </DialogHeader>
          {selectedUpload && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Document Type</p>
                  <p className="font-medium capitalize">{selectedUpload.document_type.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">File Name</p>
                  <p className="font-medium">{selectedUpload.file_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Detected Store</p>
                  <p className="font-medium">{selectedUpload.extracted_store_name || "Not detected"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Matched Sub-Account</p>
                  <p className="font-medium">{getMatchedStoreName(selectedUpload)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Confidence</p>
                  {getConfidenceBadge(selectedUpload.confidence_score)}
                </div>
                <div>
                  <p className="text-muted-foreground">Uploaded</p>
                  <p className="font-medium">{format(new Date(selectedUpload.created_at), "PPp")}</p>
                </div>
              </div>
              {selectedUpload.extracted_data && Object.keys(selectedUpload.extracted_data).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2">Extracted Data</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedUpload.extracted_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => selectedUpload && window.open(selectedUpload.file_url, "_blank")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
