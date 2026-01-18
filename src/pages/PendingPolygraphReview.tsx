import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Check, X, Eye, FileText, Loader2, Clock, AlertTriangle, Download, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminHeader from "@/components/admin/AdminHeader";
import RiskAnalysisDisplay from "@/components/reports/RiskAnalysisDisplay";
import { format } from "date-fns";

interface PendingUpload {
  id: string;
  original_file_name: string;
  original_file_url: string;
  converted_pdf_url: string | null;
  extracted_data: any;
  first_name: string | null;
  last_name: string | null;
  id_number: string | null;
  email: string | null;
  contact_number: string | null;
  physical_address: string | null;
  position_applying_for: string | null;
  risk_score: number | null;
  risk_level: string | null;
  risk_analysis: any;
  examination_date: string | null;
  overall_result: string | null;
  status: string;
  created_at: string;
  uploaded_by: string;
  account_id: string | null;
  store_id: string | null;
  examiner_id: string | null;
  accounts?: { name: string } | null;
  stores?: { store_name: string; store_code: string } | null;
  examiners?: { name: string } | null;
  profiles?: { full_name: string; email: string } | null;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
  account_id: string | null;
}

interface Examiner {
  id: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
}

const PendingPolygraphReview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<PendingUpload | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [converting, setConverting] = useState(false);
  
  // Editable fields
  const [editedData, setEditedData] = useState<any>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");

  useEffect(() => {
    checkAuth();
    fetchPendingUploads();
    fetchDropdownData();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      fetchStoresByAccount(selectedAccountId);
    } else {
      setStores([]);
    }
  }, [selectedAccountId]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/admin/login");
        return;
      }
      
      const { data: isMasterAdmin } = await supabase.rpc("is_master_admin", { _user_id: user.id });
      if (!isMasterAdmin) {
        toast({
          title: "Access Denied",
          description: "Only master admins can access the pending review page.",
          variant: "destructive",
        });
        navigate("/admin/portal");
        return;
      }
      
      setUser(user);
    } catch (error) {
      console.error("Auth error:", error);
      navigate("/admin/login");
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingUploads = async () => {
    try {
      const { data, error } = await supabase
        .from("pending_polygraph_uploads")
        .select(`
          *,
          accounts:account_id(name),
          stores:store_id(store_name, store_code),
          examiners:examiner_id(name)
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch uploader profiles separately
      const uploaderIds = [...new Set((data || []).map(d => d.uploaded_by).filter(Boolean))];
      let profilesMap: Record<string, { full_name: string; email: string }> = {};
      
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uploaderIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.id] = { full_name: p.full_name || "", email: p.email };
            return acc;
          }, {} as Record<string, { full_name: string; email: string }>);
        }
      }
      
      const enrichedData = (data || []).map(upload => ({
        ...upload,
        profiles: profilesMap[upload.uploaded_by] || null,
      }));
      
      setPendingUploads(enrichedData as PendingUpload[]);
    } catch (error: any) {
      console.error("Error fetching pending uploads:", error);
      toast({
        title: "Error",
        description: "Failed to load pending uploads",
        variant: "destructive",
      });
    }
  };

  const fetchDropdownData = async () => {
    const [accountsRes, examinersRes] = await Promise.all([
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("examiners").select("id, name").eq("is_active", true).order("name"),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data);
    if (examinersRes.data) setExaminers(examinersRes.data);
  };

  const fetchStoresByAccount = async (accountId: string) => {
    const { data } = await supabase
      .from("stores")
      .select("id, store_name, store_code, account_id")
      .eq("account_id", accountId)
      .order("store_name");
    setStores(data || []);
  };

  const openReviewDialog = (upload: PendingUpload) => {
    setSelectedUpload(upload);
    setEditedData({
      first_name: upload.first_name || "",
      last_name: upload.last_name || "",
      id_number: upload.id_number || "",
      email: upload.email || "",
      contact_number: upload.contact_number || "",
      physical_address: upload.physical_address || "",
      position_applying_for: upload.position_applying_for || "",
      examination_date: upload.examination_date || new Date().toISOString().split("T")[0],
      overall_result: upload.overall_result || "",
      risk_score: upload.risk_score,
      risk_level: upload.risk_level || "",
      risk_analysis: upload.risk_analysis || {},
      extracted_data: upload.extracted_data || {},
    });
    setSelectedAccountId(upload.account_id || "");
    setSelectedStoreId(upload.store_id || "");
    setSelectedExaminerId(upload.examiner_id || "");
    setReviewDialogOpen(true);
  };

  const handleConvertToPdf = async () => {
    if (!selectedUpload) return;

    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("convert-docx-to-pdf", {
        body: {
          uploadId: selectedUpload.id,
          fileUrl: selectedUpload.original_file_url,
          fileName: selectedUpload.original_file_name,
        },
      });

      if (error) throw error;

      if (data?.pdfUrl) {
        setSelectedUpload({ ...selectedUpload, converted_pdf_url: data.pdfUrl });
        toast({
          title: "Conversion Complete",
          description: "The Word document has been converted to PDF.",
        });
        fetchPendingUploads();
      }
    } catch (error: any) {
      console.error("Conversion error:", error);
      toast({
        title: "Conversion Failed",
        description: error.message || "Failed to convert document to PDF.",
        variant: "destructive",
      });
    } finally {
      setConverting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedUpload) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("pending_polygraph_uploads")
        .update({
          first_name: editedData.first_name,
          last_name: editedData.last_name,
          id_number: editedData.id_number,
          email: editedData.email,
          contact_number: editedData.contact_number,
          physical_address: editedData.physical_address,
          position_applying_for: editedData.position_applying_for,
          examination_date: editedData.examination_date,
          overall_result: editedData.overall_result,
          risk_score: editedData.risk_score,
          risk_level: editedData.risk_level,
          risk_analysis: editedData.risk_analysis,
          extracted_data: editedData.extracted_data,
          account_id: selectedAccountId || null,
          store_id: selectedStoreId || null,
          examiner_id: selectedExaminerId || null,
        })
        .eq("id", selectedUpload.id);

      if (error) throw error;

      toast({
        title: "Changes Saved",
        description: "The report data has been updated.",
      });
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedUpload) return;

    // Validate required fields
    if (!selectedStoreId) {
      toast({
        title: "Missing Information",
        description: "Please select a store before approving.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedUpload.converted_pdf_url && selectedUpload.original_file_name.toLowerCase().endsWith(".docx")) {
      toast({
        title: "PDF Required",
        description: "Please convert the Word document to PDF before approving.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      // Create the polygraph report
      const reportPayload = {
        store_id: selectedStoreId,
        examiner_id: selectedExaminerId || null,
        examination_date: editedData.examination_date,
        first_name: editedData.first_name,
        last_name: editedData.last_name,
        id_number: editedData.id_number,
        contact_number: editedData.contact_number || null,
        email: editedData.email || null,
        physical_address: editedData.physical_address || null,
        position_applying_for: editedData.position_applying_for || null,
        overall_result: editedData.overall_result?.toLowerCase() || null,
        status: "completed" as const,
        report_pdf_url: selectedUpload.converted_pdf_url || selectedUpload.original_file_url,
        uploaded_by: selectedUpload.uploaded_by,
        risk_score: editedData.risk_score,
        risk_level: editedData.risk_level,
        risk_analysis: editedData.risk_analysis,
        extracted_disclosure: editedData.extracted_data?.disclosure,
        education_history: editedData.extracted_data?.educationHistory,
        employment_history: editedData.extracted_data?.employmentHistory,
        family_criminal_history: editedData.extracted_data?.familyCriminalHistory,
        friend_criminal_history: editedData.extracted_data?.friendCriminalHistory,
        financial_circumstances: editedData.extracted_data?.financialCircumstances,
        permits_licensing: editedData.extracted_data?.permitsLicensing,
        personal_law_encounters: editedData.extracted_data?.personalLawEncounters,
        post_exam_admissions: editedData.extracted_data?.postExamAdmissions || null,
      };

      const { data: reportData, error: reportError } = await supabase
        .from("polygraph_reports")
        .insert([reportPayload])
        .select("id")
        .single();

      if (reportError) throw reportError;

      // Create candidate profile
      const candidatePayload = {
        report_id: reportData.id,
        first_name: editedData.first_name,
        last_name: editedData.last_name,
        id_number: editedData.id_number,
        email: editedData.email || null,
        contact_number: editedData.contact_number || null,
        physical_address: editedData.physical_address || null,
        position: editedData.position_applying_for || null,
        store_id: selectedStoreId,
        status: "pending_review" as const,
      };

      await supabase.from("polygraph_candidates").insert([candidatePayload]);

      // Update pending upload status
      await supabase
        .from("pending_polygraph_uploads")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedUpload.id);

      toast({
        title: "Report Approved",
        description: "The report has been approved and is now visible to authorized users.",
      });

      setReviewDialogOpen(false);
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Approval error:", error);
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve the report.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUpload || !rejectionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for rejection.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      await supabase
        .from("pending_polygraph_uploads")
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedUpload.id);

      toast({
        title: "Report Rejected",
        description: "The upload has been rejected.",
      });

      setRejectDialogOpen(false);
      setReviewDialogOpen(false);
      setRejectionReason("");
      fetchPendingUploads();
    } catch (error: any) {
      console.error("Rejection error:", error);
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject the report.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const getRiskLevelColor = (level: string | null) => {
    switch (level?.toUpperCase()) {
      case "LOW":
      case "LOW RISK":
        return "bg-green-500";
      case "MEDIUM":
      case "MEDIUM RISK":
        return "bg-yellow-500";
      case "HIGH":
      case "HIGH RISK":
        return "bg-orange-500";
      case "VERY HIGH":
      case "UNACCEPTABLE":
      case "UNACCEPTABLE RISK":
        return "bg-red-500";
      default:
        return "bg-muted";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Pending Polygraph Review" />

      <main className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/admin/portal")} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Uploads for Review
            </CardTitle>
            <CardDescription>
              Review and approve polygraph reports uploaded by admins before they become visible to all authorized users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingUploads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending uploads to review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingUploads.map((upload) => (
                  <Card key={upload.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{upload.original_file_name}</span>
                            {upload.risk_level && (
                              <Badge className={getRiskLevelColor(upload.risk_level)}>
                                {upload.risk_level}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              <span className="font-medium">Candidate:</span>{" "}
                              {upload.first_name && upload.last_name
                                ? `${upload.first_name} ${upload.last_name}`
                                : "Not extracted"}
                              {upload.id_number && ` (ID: ${upload.id_number})`}
                            </p>
                            <p>
                              <span className="font-medium">Uploaded by:</span>{" "}
                              {upload.profiles?.full_name || upload.profiles?.email || "Unknown"}
                            </p>
                            <p>
                              <span className="font-medium">Uploaded:</span>{" "}
                              {format(new Date(upload.created_at), "PPpp")}
                            </p>
                            {upload.stores && (
                              <p>
                                <span className="font-medium">Store:</span>{" "}
                                {upload.stores.store_name} ({upload.stores.store_code})
                              </p>
                            )}
                          </div>
                        </div>
                        <Button onClick={() => openReviewDialog(upload)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Review Polygraph Report</DialogTitle>
            <DialogDescription>
              Review and edit the extracted data before approving. The report will become visible to all authorized users after approval.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <Tabs defaultValue="candidate" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="candidate">Candidate Info</TabsTrigger>
                <TabsTrigger value="examination">Examination</TabsTrigger>
                <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
                <TabsTrigger value="document">Document</TabsTrigger>
              </TabsList>

              <TabsContent value="candidate" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={editedData.first_name || ""}
                      onChange={(e) => setEditedData({ ...editedData, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={editedData.last_name || ""}
                      onChange={(e) => setEditedData({ ...editedData, last_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ID Number</Label>
                    <Input
                      value={editedData.id_number || ""}
                      onChange={(e) => setEditedData({ ...editedData, id_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editedData.email || ""}
                      onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Number</Label>
                    <Input
                      value={editedData.contact_number || ""}
                      onChange={(e) => setEditedData({ ...editedData, contact_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position</Label>
                    <Input
                      value={editedData.position_applying_for || ""}
                      onChange={(e) => setEditedData({ ...editedData, position_applying_for: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Physical Address</Label>
                  <Textarea
                    value={editedData.physical_address || ""}
                    onChange={(e) => setEditedData({ ...editedData, physical_address: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="examination" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Store *</Label>
                    <Select value={selectedStoreId} onValueChange={setSelectedStoreId} disabled={!selectedAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder={selectedAccountId ? "Select store" : "Select account first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name} ({store.store_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Examiner</Label>
                    <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select examiner" />
                      </SelectTrigger>
                      <SelectContent>
                        {examiners.map((ex) => (
                          <SelectItem key={ex.id} value={ex.id}>
                            {ex.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Examination Date</Label>
                    <Input
                      type="date"
                      value={editedData.examination_date || ""}
                      onChange={(e) => setEditedData({ ...editedData, examination_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Overall Result</Label>
                    <Select
                      value={editedData.overall_result || ""}
                      onValueChange={(value) => setEditedData({ ...editedData, overall_result: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">Passed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="inconclusive">Inconclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="risk" className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>Risk Score</Label>
                    <Input
                      type="number"
                      value={editedData.risk_score || ""}
                      onChange={(e) => setEditedData({ ...editedData, risk_score: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Level</Label>
                    <Select
                      value={editedData.risk_level || ""}
                      onValueChange={(value) => setEditedData({ ...editedData, risk_level: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low Risk</SelectItem>
                        <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                        <SelectItem value="HIGH">High Risk</SelectItem>
                        <SelectItem value="VERY HIGH">Very High Risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {editedData.risk_analysis && (
                  <RiskAnalysisDisplay riskAnalysis={editedData.risk_analysis} />
                )}
              </TabsContent>

              <TabsContent value="document" className="space-y-4 p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Original Document</p>
                      <p className="text-sm text-muted-foreground">{selectedUpload?.original_file_name}</p>
                    </div>
                    <Button variant="outline" asChild>
                      <a href={selectedUpload?.original_file_url} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>

                  {selectedUpload?.original_file_name.toLowerCase().endsWith(".docx") && (
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">PDF Conversion</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedUpload.converted_pdf_url
                            ? "PDF has been generated"
                            : "Convert Word document to PDF for distribution"}
                        </p>
                      </div>
                      {selectedUpload.converted_pdf_url ? (
                        <Button variant="outline" asChild>
                          <a href={selectedUpload.converted_pdf_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </a>
                        </Button>
                      ) : (
                        <Button onClick={handleConvertToPdf} disabled={converting}>
                          {converting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Convert to PDF
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleSaveChanges} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => setRejectDialogOpen(true)}
                disabled={processing}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button onClick={handleApprove} disabled={processing}>
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Reject Upload
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this upload. The uploader will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejection..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing || !rejectionReason.trim()}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PendingPolygraphReview;
