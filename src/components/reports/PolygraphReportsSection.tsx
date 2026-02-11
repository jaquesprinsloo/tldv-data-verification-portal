import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileText, BarChart3, Download, Upload, Loader2, Save, Plus, Package, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PolygraphReportsList from "@/components/admin/polygraph/PolygraphReportsList";
import PolygraphStatistics from "@/components/admin/polygraph/PolygraphStatistics";
import BatchUploadSection from "./BatchUploadSection";
import BatchListSection from "./BatchListSection";

import { generatePolygraphTemplate } from "@/utils/polygraphTemplateGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import RiskAnalysisDisplay from "./RiskAnalysisDisplay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JSZip from "jszip";
import { usePermissions, PERMISSION_KEYS } from "@/hooks/usePermissions";

interface PolygraphReportsSectionProps {
  canEdit: boolean;
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

const PolygraphReportsSection = ({ canEdit }: PolygraphReportsSectionProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<'extracting' | 'processing' | null>(null);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Form fields for candidate
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [newExaminerName, setNewExaminerName] = useState("");
  const [showAddExaminer, setShowAddExaminer] = useState(false);
  
  // Get user ID for permissions
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUser();
  }, []);
  
  const { hasPermission, isMasterAdmin, isLoading: permissionsLoading } = usePermissions(currentUserId || undefined);
  
  // Permissions are still loading if we don't have a user ID yet OR if the hook is loading
  const isStillLoadingPermissions = !currentUserId || permissionsLoading;
  
  // Check specific permissions - while loading, default to checking canEdit prop for backwards compatibility
  const canSelectAccounts = isStillLoadingPermissions ? true : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_SELECT_ACCOUNTS));
  const canBatchUpload = isStillLoadingPermissions ? canEdit : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_BATCH_UPLOAD));
  const canSingleUpload = isStillLoadingPermissions ? canEdit : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_SINGLE_UPLOAD));
  const canViewBatches = isStillLoadingPermissions ? true : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_BATCHES));
  const canViewStatistics = isStillLoadingPermissions ? true : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_STATISTICS));
  const canViewReports = isStillLoadingPermissions ? true : (isMasterAdmin || hasPermission(PERMISSION_KEYS.ACCOUNTS_VIEW_REPORTS));

  // Fetch accounts the user has access to on mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch stores when account changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchStoresByAccount(selectedAccountId);
    } else {
      setStores([]);
    }
    setSelectedStoreId("");
  }, [selectedAccountId]);

  const fetchInitialData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if master admin
    const { data: isMasterAdmin } = await supabase.rpc('is_master_admin', { _user_id: user.id });

    // Fetch accounts
    if (isMasterAdmin) {
      const { data: accountsData } = await supabase.from("accounts").select("id, name").order("name");
      setAccounts(accountsData || []);
    } else {
      // Fetch only accessible accounts
      const { data: accessData } = await supabase
        .from("account_access")
        .select("account_id, accounts(id, name)")
        .eq("user_id", user.id);
      
      const accessibleAccounts = accessData?.map(a => a.accounts).filter(Boolean) as Account[] || [];
      setAccounts(accessibleAccounts);
    }

    // Fetch examiners
    const { data: examinersData } = await supabase
      .from("examiners")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setExaminers(examinersData || []);
  };

  const fetchStoresByAccount = async (accountId: string) => {
    const { data: storesData } = await supabase
      .from("stores")
      .select("id, store_name, store_code, account_id")
      .eq("account_id", accountId)
      .order("store_name");
    setStores(storesData || []);
  };

  const handleAddExaminer = async () => {
    if (!newExaminerName.trim()) return;
    
    try {
      const { data, error } = await supabase
        .from("examiners")
        .insert({ name: newExaminerName.trim(), is_active: true })
        .select("id, name")
        .single();

      if (error) throw error;

      setExaminers(prev => [...prev, data]);
      setSelectedExaminerId(data.id);
      setNewExaminerName("");
      setShowAddExaminer(false);
      
      toast({
        title: "Examiner Added",
        description: `${data.name} has been added to the examiners list.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add examiner",
        variant: "destructive",
      });
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await generatePolygraphTemplate();
      toast({
        title: "Template Downloaded",
        description: "The polygraph report template has been downloaded successfully.",
      });
    } catch (error) {
      console.error("Error generating template:", error);
      toast({
        title: "Download Failed",
        description: "Failed to generate the template. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      console.info('[polygraph] selected file', {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      });

      const normalizedName = selectedFile.name.trim();
      const lowerName = normalizedName.toLowerCase();

      const isPdf = /\.pdf$/i.test(lowerName);
      const isDocx = /\.docx$/i.test(lowerName);
      const isOldDoc = /\.doc$/i.test(lowerName) && !isDocx;

      // Some environments provide an empty MIME type for Office files.
      // We still accept based on extension, but we also allow by MIME when present.
      const mime = (selectedFile.type || "").toLowerCase();
      const isAllowedMime =
        mime === "application/pdf" ||
        mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      if (isOldDoc) {
        toast({
          title: "Unsupported Format",
          description:
            "The older .doc format is not supported. Please save your document as .docx (Word 2007+) or PDF and try again.",
          variant: "destructive",
        });
        return;
      }

      if (!(isPdf || isDocx || isAllowedMime)) {
        toast({
          title: "Invalid File Type",
          description: `Please upload a PDF or Word document (.pdf, .docx). Detected: \"${normalizedName}\" (${selectedFile.type || "no MIME"}).`,
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
      setExtractedData(null);
      setSelectedAccountId("");
      setSelectedStoreId("");
      setSelectedExaminerId("");
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadingStep('extracting');
    setExtractedData(null);
    setExtractionProgress(0);
    
    // Simulate progress for better UX (extraction takes ~30-60 seconds)
    const progressInterval = setInterval(() => {
      setExtractionProgress(prev => {
        // Slow down as we approach 90% (leave room for completion)
        if (prev < 30) return prev + 2;
        if (prev < 60) return prev + 1.5;
        if (prev < 80) return prev + 0.8;
        if (prev < 90) return prev + 0.3;
        return prev;
      });
    }, 500);
    
    try {
      const fileName = file.name.toLowerCase();
      const isWordDoc = fileName.endsWith('.docx') || fileName.endsWith('.doc');
      
      toast({
        title: "Processing Document",
        description: `AI is extracting data from your ${isWordDoc ? 'Word document' : 'PDF'}. This may take up to a minute...`,
      });
      
      const fileBase64 = await fileToBase64(file);
      setExtractionProgress(15); // File read complete

      // Send as docxBase64 for Word docs, pdfBase64 for PDFs
      const requestBody = isWordDoc 
        ? { docxBase64: fileBase64, fileName: file.name }
        : { pdfBase64: fileBase64, fileName: file.name };

      const { data, error } = await supabase.functions.invoke('extract-polygraph-report', {
        body: requestBody
      });

      clearInterval(progressInterval);

      if (error) {
        throw new Error(error.message || 'Failed to process document');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        setExtractionProgress(100);
        setExtractedData(data.data);
        toast({
          title: "Data Extracted Successfully",
          description: "Review the extracted information and save the report.",
        });
      } else {
        throw new Error('No data extracted from document');
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Upload error:", error);
      toast({
        title: "Extraction Failed",
        description: error instanceof Error ? error.message : "Failed to extract data from the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadingStep(null);
    }
  };

  // Helper to convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  // Map overall result based on exam question findings
  // SR (Significant Response) = fail, NSR (No Significant Response) = pass
  // If ANY question has SR, overall result is failed
  // All questions must have NSR for passed result
  const mapOverallResult = (examQuestions: any[] | null | undefined): 'passed' | 'failed' | 'inconclusive' | null => {
    if (!examQuestions || examQuestions.length === 0) return null;
    
    const findings = examQuestions.map(q => q.finding?.toUpperCase() || q.result?.toUpperCase() || '');
    
    // If any question has SR (Significant Response), it's failed
    if (findings.some(f => f === 'SR')) {
      return 'failed';
    }
    
    // If any question has INC (Inconclusive), it's inconclusive
    if (findings.some(f => f === 'INC')) {
      return 'inconclusive';
    }
    
    // If all questions have NSR (No Significant Response), it's passed
    if (findings.length > 0 && findings.every(f => f === 'NSR')) {
      return 'passed';
    }
    
    return 'inconclusive'; // Default to inconclusive if unclear
  };

  // Parse date string to valid date format — avoid timezone shift by using local date parts
  const parseExaminationDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];
    
    // Strip leading day-of-week prefix (e.g., "Monday, 13 January 2025" → "13 January 2025")
    let cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '');
    
    // Try parsing "26 November 2024" or "November 26, 2024" formats first
    const months: Record<string, number> = {
      'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
      'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
      'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'october': 9, 'oct': 9,
      'november': 10, 'nov': 10, 'december': 11, 'dec': 11
    };
    
    // "Jan 13, 2025" or "January 13, 2025"
    const monthFirst = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (monthFirst) {
      const month = months[monthFirst[1].toLowerCase()];
      if (month !== undefined) {
        const day = parseInt(monthFirst[2]);
        const year = parseInt(monthFirst[3]);
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // "13 January 2025"
    const dayFirst = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (dayFirst) {
      const month = months[dayFirst[2].toLowerCase()];
      if (month !== undefined) {
        const day = parseInt(dayFirst[1]);
        const year = parseInt(dayFirst[3]);
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    
    // Fallback: parse with Date but use LOCAL date parts to avoid timezone shift
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    
    return new Date().toISOString().split("T")[0];
  };

  const handleSaveReport = async () => {
    if (!extractedData) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Upload the original file to storage
      let fileUrl: string | null = null;
      if (file) {
        const uploadId = crypto.randomUUID();
        const fileName = `pending/${uploadId}/${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("polygraph-reports")
          .upload(fileName, file, { contentType: file.type });
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("polygraph-reports")
            .getPublicUrl(fileName);
          fileUrl = publicUrl;
        }
      }

      if (!fileUrl) {
        throw new Error("Failed to upload file");
      }

      // Prepare risk analysis data
      let riskScore: number | null = null;
      let riskLevel: string | null = null;
      if (extractedData.riskAnalysis) {
        riskScore = extractedData.riskAnalysis.TotalRiskScore || null;
        const rawLevel = extractedData.riskAnalysis.RiskLevel || '';
        let mappedLevel = rawLevel.toUpperCase().replace(' RISK', '');
        if (mappedLevel === 'UNACCEPTABLE') mappedLevel = 'VERY HIGH';
        riskLevel = ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'].includes(mappedLevel) ? mappedLevel : null;
      }

      // Save to pending_polygraph_uploads table for master admin review
      const pendingPayload = {
        account_id: selectedAccountId || null,
        store_id: selectedStoreId || null,
        examiner_id: selectedExaminerId || null,
        original_file_url: fileUrl,
        original_file_name: file?.name || "report",
        extracted_data: extractedData,
        first_name: extractedData.candidate?.firstName || null,
        last_name: extractedData.candidate?.lastName || null,
        id_number: extractedData.candidate?.idNumber || null,
        email: extractedData.candidate?.email || null,
        contact_number: extractedData.candidate?.contactNumber || null,
        physical_address: extractedData.candidate?.physicalAddress || null,
        position_applying_for: extractedData.candidate?.positionApplyingFor || null,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_analysis: extractedData.riskAnalysis || null,
        examination_date: parseExaminationDate(extractedData.examination?.date),
        overall_result: mapOverallResult(extractedData.examQuestions),
        status: "pending",
        uploaded_by: user?.id,
      };

      const { error: pendingError } = await supabase
        .from("pending_polygraph_uploads")
        .insert([pendingPayload]);

      if (pendingError) throw pendingError;

      toast({
        title: "Upload Submitted",
        description: "Your report has been submitted for review by a Master Admin.",
      });

      // Reset and go to reports list
      setExtractedData(null);
      setFile(null);
      setSelectedAccountId("");
      setSelectedStoreId("");
      setSelectedExaminerId("");
      setActiveTab("reports");
    } catch (error: any) {
      console.error("Error saving report:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit report for review",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level?.toUpperCase()) {
      case "LOW RISK": return "bg-green-500";
      case "MEDIUM RISK": return "bg-yellow-500";
      case "HIGH RISK": return "bg-orange-500";
      case "UNACCEPTABLE RISK": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <h2 className="text-xl font-semibold">Polygraph Reports</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generating..." : "Download Template"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Report
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reports" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
            {!isStillLoadingPermissions && !canViewReports && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="batches" className="flex items-center gap-1">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Batches</span>
            {!isStillLoadingPermissions && !canViewBatches && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="batch-upload" className="flex items-center gap-1">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Batch Upload</span>
            {!isStillLoadingPermissions && !canBatchUpload && <Lock className="h-3 w-3" />}
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-1">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Single Upload</span>
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Statistics</span>
            {!isStillLoadingPermissions && !canViewStatistics && <Lock className="h-3 w-3" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          {canViewReports ? (
            <PolygraphReportsList 
              onCreateNew={() => setActiveTab("batch-upload")} 
              onEditReport={() => {}}
              filterByUploader={!isMasterAdmin && canViewReports}
              currentUserId={currentUserId}
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
                  <p className="text-muted-foreground max-w-md">
                    Your profile does not have permission to view reports. 
                    Please contact a Master Admin to request access.
                  </p>
                  <Badge variant="outline" className="mt-4">
                    Permission Required: View Reports
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="batches" className="mt-6">
          {canViewBatches ? (
            <BatchListSection />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
                  <p className="text-muted-foreground max-w-md">
                    Your profile does not have permission to view batches. 
                    Please contact a Master Admin to request access.
                  </p>
                  <Badge variant="outline" className="mt-4">
                    Permission Required: Batches
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="batch-upload" className="mt-6">
          {canBatchUpload ? (
            <BatchUploadSection onBatchCreated={() => setActiveTab("batches")} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
                  <p className="text-muted-foreground max-w-md">
                    Your profile does not have permission to upload batches. 
                    Please contact a Master Admin to request access.
                  </p>
                  <Badge variant="outline" className="mt-4">
                    Permission Required: Batch Upload
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Completed Report</CardTitle>
                <CardDescription>
                  Upload a completed polygraph report (PDF or Word document) for AI data extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center p-8 border-2 border-dashed rounded-lg">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <input
                    type="file"
                    accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="report-upload"
                  />
                  <label htmlFor="report-upload">
                    <Button variant="outline" asChild className="cursor-pointer">
                      <span>Select PDF or Word File</span>
                    </Button>
                  </label>
                  {file && !uploading && !extractedData && (
                    <div className="mt-4">
                      <p className="text-sm font-medium">{file.name}</p>
                      <Button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="mt-2"
                      >
                        Extract Report Data
                      </Button>
                    </div>
                  )}

                  {/* Progress Bar during extraction */}
                  {uploading && (
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm font-medium">
                          Extracting data from PDF...
                        </span>
                      </div>
                      <div className="max-w-md mx-auto space-y-2">
                        <Progress value={extractionProgress} className="h-3" />
                        <p className="text-center text-sm font-semibold text-primary">
                          {Math.round(extractionProgress)}%
                        </p>
                        <p className="text-xs text-muted-foreground text-center">
                          AI is analyzing the document. This may take up to a minute.
                        </p>
                      </div>
                    </div>
                  )}

                  {extractedData?.candidatePhotoUrl && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-1">Extracted Photo:</p>
                      <img 
                        src={extractedData.candidatePhotoUrl} 
                        alt="Candidate" 
                        className="w-16 h-16 object-cover rounded-full mx-auto border"
                      />
                    </div>
                  )}
                </div>

                {extractedData && (
                  <div className="space-y-6">
                    {/* Risk Analysis Display with extracted data for background summary */}
                    {extractedData && (
                      <RiskAnalysisDisplay 
                        polygraphReport={{
                          employment_history: extractedData.employmentHistory,
                          financial_circumstances: extractedData.financialCircumstances,
                          family_criminal_history: extractedData.familyCriminalHistory,
                          friend_criminal_history: extractedData.friendCriminalHistory,
                          personal_law_encounters: extractedData.personalLawEncounters,
                          extracted_disclosure: {
                            ...extractedData.disclosure,
                            admissions: extractedData.admissions,
                            DetailedCriminalActivity: extractedData.detailedCriminalActivity,
                          },
                          extracted_data: {
                            admissions: extractedData.admissions,
                            DetailedCriminalActivity: extractedData.detailedCriminalActivity,
                          },
                          risk_analysis: extractedData.riskAnalysis,
                        }}
                        examQuestions={(extractedData.examQuestions || []).map((q: any) => ({
                          finding: q.finding || q.Finding || '',
                        }))}
                        riskAnalysis={extractedData.riskAnalysis}
                      />
                    )}

                    <Card className="bg-muted/50">
                      <CardHeader>
                        <CardTitle className="text-lg">Extracted Candidate Data</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Personal Information */}
                        {extractedData.candidate && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Personal Information</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Full Name</span>
                                <span className="font-medium">{extractedData.candidate.firstName} {extractedData.candidate.lastName}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">ID Number</span>
                                <span className="font-medium">{extractedData.candidate.idNumber || '—'}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Contact Number</span>
                                <span className="font-medium">{extractedData.candidate.contactNumber || '—'}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Email Address</span>
                                <span className="font-medium">{extractedData.candidate.email || '—'}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Education */}
                        {extractedData.educationHistory && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Education</h4>
                            {(() => {
                              const eduArr = Array.isArray(extractedData.educationHistory) ? extractedData.educationHistory : [extractedData.educationHistory];
                              const schoolEntries = eduArr.filter((e: any) => {
                                const inst = (e.Institution || e.institution || e.School || e.school || '').toLowerCase();
                                const qual = (e.Qualification || e.qualification || e.Degree || e.degree || '').toLowerCase();
                                return inst.includes('school') || inst.includes('high') || inst.includes('primary') || qual.includes('grade') || qual.includes('matric');
                              });
                              const tertiaryEntries = eduArr.filter((e: any) => {
                                const inst = (e.Institution || e.institution || e.School || e.school || '').toLowerCase();
                                const qual = (e.Qualification || e.qualification || e.Degree || e.degree || '').toLowerCase();
                                return !inst.includes('school') && !inst.includes('high') && !inst.includes('primary') && !qual.includes('grade') && !qual.includes('matric');
                              });
                              // If no distinction, treat all as school if only one or try best effort
                              const finalSchool = schoolEntries.length > 0 ? schoolEntries : (tertiaryEntries.length === 0 ? eduArr : []);
                              const finalTertiary = tertiaryEntries.length > 0 ? tertiaryEntries : [];
                              return (
                                <div className="space-y-4">
                                  {finalSchool.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">School</p>
                                      {finalSchool.map((edu: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-2">
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">School Name</span>
                                            <span className="font-medium">{edu.Institution || edu.institution || edu.School || edu.school || '—'}</span>
                                          </div>
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">Last Grade</span>
                                            <span className="font-medium">{edu.Qualification || edu.qualification || edu.Degree || edu.degree || edu.LastGrade || edu.lastGrade || '—'}</span>
                                          </div>
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">Year Completed</span>
                                            <span className="font-medium">{edu.Year || edu.year || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period || '—'}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {finalTertiary.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Tertiary Education</p>
                                      {finalTertiary.map((edu: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-2">
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">Institution</span>
                                            <span className="font-medium">{edu.Institution || edu.institution || edu.School || edu.school || '—'}</span>
                                          </div>
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">Qualification</span>
                                            <span className="font-medium">{edu.Qualification || edu.qualification || edu.Degree || edu.degree || '—'}</span>
                                          </div>
                                          <div className="flex justify-between py-1 border-b border-border/30">
                                            <span className="text-muted-foreground">Year Completed</span>
                                            <span className="font-medium">{edu.Year || edu.year || edu.YearCompleted || edu.yearCompleted || edu.Period || edu.period || '—'}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Medical Suitability */}
                        {extractedData.suitability && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Medical Suitability</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Current Health Status</span>
                                <span className="font-medium">{extractedData.suitability.healthStatus || '—'}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Medication (past 24hrs)</span>
                                <span className="font-medium">
                                  {extractedData.suitability.medicationTaken === true ? `Yes${extractedData.suitability.medicationDetails ? ` — ${extractedData.suitability.medicationDetails}` : ''}` :
                                   extractedData.suitability.medicationTaken === false ? 'No' : '—'}
                                </span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-border/30">
                                <span className="text-muted-foreground">Psychological Diagnosis</span>
                                <span className="font-medium">
                                  {extractedData.suitability.psychologicalDisorders === true ? 'Yes' :
                                   extractedData.suitability.psychologicalDisorders === false ? 'No' : '—'}
                                </span>
                              </div>
                              {extractedData.suitability.pregnant === true && (
                                <div className="flex justify-between py-1 border-b border-border/30">
                                  <span className="text-muted-foreground">Pregnant</span>
                                  <span className="font-medium text-orange-600">Yes</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Family Background */}
                        {extractedData.familyCriminalHistory && Array.isArray(extractedData.familyCriminalHistory) && extractedData.familyCriminalHistory.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Family Background</h4>
                            <div className="space-y-4">
                              {extractedData.familyCriminalHistory
                                .filter((m: any) => {
                                  const rel = (m.Relationship || m.relationship || '').toLowerCase();
                                  return rel.includes('father') || rel.includes('mother') || rel.includes('brother') || rel.includes('sister');
                                })
                                .map((member: any, idx: number) => (
                                <div key={idx} className="p-4 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Badge variant="outline" className="text-xs">{member.Relationship || member.relationship || 'Family'}</Badge>
                                    <span className="font-semibold text-sm">{member.Name || member.name || 'Unknown'}</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    {(member.PhysicalAddress || member.physicalAddress) && (
                                      <div className="flex justify-between py-1 border-b border-border/30">
                                        <span className="text-muted-foreground">Address</span>
                                        <span className="font-medium text-right max-w-[60%]">{member.PhysicalAddress || member.physicalAddress}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Employment</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const status = (member.EmploymentStatus || member.employmentStatus || '').toLowerCase();
                                          if (status.includes('unemploy')) return 'Unemployed';
                                           const employer = member.Employer || member.employer || '';
                                           const position = member.Position || member.position || '';
                                           const parts = [employer, position].filter(Boolean);
                                           return parts.length > 0 ? parts.join(' — ') : (status || '—');
                                        })()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Arrest Disclosed</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const arrest = (member.ArrestDisclosed || member.arrestDisclosed || '').toLowerCase();
                                          const criminal = (member.CriminalHistory || member.criminalHistory || '').toLowerCase();
                                          if (arrest === 'yes' || criminal.includes('arrest') || criminal.includes('convict')) return 'Yes';
                                          if (arrest === 'no' || criminal.includes('not aware') || criminal.includes('none') || criminal.includes('no criminal')) return 'No';
                                          return '—';
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Close Friends */}
                        {extractedData.friendCriminalHistory && Array.isArray(extractedData.friendCriminalHistory) && extractedData.friendCriminalHistory.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Close Friends</h4>
                            <div className="space-y-4">
                              {extractedData.friendCriminalHistory.map((friend: any, idx: number) => (
                                <div key={idx} className="p-4 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Badge variant="outline" className="text-xs">Close Friend</Badge>
                                    <span className="font-semibold text-sm">{friend.Name || friend.name || 'Unknown'}</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    {(friend.PhysicalAddress || friend.physicalAddress) && (
                                      <div className="flex justify-between py-1 border-b border-border/30">
                                        <span className="text-muted-foreground">Address</span>
                                        <span className="font-medium text-right max-w-[60%]">{friend.PhysicalAddress || friend.physicalAddress}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Employment</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const status = (friend.EmploymentStatus || friend.employmentStatus || '').toLowerCase();
                                          if (status.includes('unemploy')) return 'Unemployed';
                                          const employer = friend.Employer || friend.employer || '';
                                          const position = friend.Position || friend.position || '';
                                          const duration = friend.Duration || friend.duration || '';
                                          const parts = [employer, position, duration].filter(Boolean);
                                          return parts.length > 0 ? parts.join(' — ') : (status || '—');
                                        })()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Arrest Disclosed</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const arrest = (friend.ArrestDisclosed || friend.arrestDisclosed || '').toLowerCase();
                                          const criminal = (friend.CriminalHistory || friend.criminalHistory || '').toLowerCase();
                                          if (arrest === 'yes' || criminal.includes('arrest') || criminal.includes('convict')) return 'Yes';
                                          if (arrest === 'no' || criminal.includes('not aware') || criminal.includes('none') || criminal.includes('no criminal')) return 'No';
                                          return '—';
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Next of Kin */}
                        {extractedData.nextOfKin && Array.isArray(extractedData.nextOfKin) && extractedData.nextOfKin.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm uppercase tracking-wider text-primary mb-3 border-b pb-2">Next of Kin</h4>
                            <div className="space-y-4">
                              {extractedData.nextOfKin.map((kin: any, idx: number) => (
                                <div key={idx} className="p-4 rounded-lg border bg-background">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Badge variant="outline" className="text-xs">{kin.Relationship || kin.relationship || 'Next of Kin'}</Badge>
                                    <span className="font-semibold text-sm">{kin.Name || kin.name || 'Unknown'}</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Contact Number</span>
                                      <span className="font-medium">{kin.ContactNumber || kin.contactNumber || '—'}</span>
                                    </div>
                                    {(kin.PhysicalAddress || kin.physicalAddress) && (
                                      <div className="flex justify-between py-1 border-b border-border/30">
                                        <span className="text-muted-foreground">Address</span>
                                        <span className="font-medium text-right max-w-[60%]">{kin.PhysicalAddress || kin.physicalAddress}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between py-1 border-b border-border/30">
                                      <span className="text-muted-foreground">Employment</span>
                                      <span className="font-medium">
                                        {(() => {
                                          const status = (kin.EmploymentStatus || kin.employmentStatus || '').toLowerCase();
                                          if (status.includes('unemploy')) return 'Unemployed';
                                          const employer = kin.Employer || kin.employer || '';
                                          const position = kin.Position || kin.position || '';
                                          const parts = [employer, position].filter(Boolean);
                                          return parts.length > 0 ? parts.join(' — ') : (status || '—');
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Account, Store and Examiner Selection */}
                        <div className="space-y-4 pt-4 border-t">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Account *</Label>
                              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {accounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                      {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Sub-Account / Store *</Label>
                              <Select 
                                value={selectedStoreId} 
                                onValueChange={setSelectedStoreId}
                                disabled={!selectedAccountId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={selectedAccountId ? "Select sub-account" : "Select account first"} />
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
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Examiner *</Label>
                            {!showAddExaminer ? (
                              <div className="flex gap-2">
                                <Select value={selectedExaminerId} onValueChange={setSelectedExaminerId}>
                                  <SelectTrigger className="flex-1">
                                    <SelectValue placeholder={examiners.length > 0 ? "Select examiner" : "No examiners - add one"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {examiners.map((examiner) => (
                                      <SelectItem key={examiner.id} value={examiner.id}>
                                        {examiner.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  size="icon"
                                  onClick={() => setShowAddExaminer(true)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Enter examiner name"
                                  value={newExaminerName}
                                  onChange={(e) => setNewExaminerName(e.target.value)}
                                />
                                <Button type="button" onClick={handleAddExaminer}>Add</Button>
                                <Button type="button" variant="outline" onClick={() => {
                                  setShowAddExaminer(false);
                                  setNewExaminerName("");
                                }}>Cancel</Button>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button 
                          onClick={handleSaveReport} 
                          disabled={saving || !selectedAccountId || !selectedStoreId || !selectedExaminerId}
                          className="w-full mt-4"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Report & Create Candidate Profile
                            </>
                          )}
                        </Button>
                        {(!selectedAccountId || !selectedStoreId || !selectedExaminerId) && (
                          <p className="text-xs text-muted-foreground text-center mt-2">
                            Please select account, sub-account, and examiner to proceed
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Instructions:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Download the template using the "Download Template" button</li>
                    <li>Have the examiner complete the template during or after the examination</li>
                    <li>Save or print the completed document as PDF</li>
                    <li>Upload the PDF here for AI data extraction</li>
                    <li>Review the extracted data, select store and examiner, then save</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="statistics" className="mt-6">
          {canViewStatistics ? (
            <PolygraphStatistics />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
                  <p className="text-muted-foreground max-w-md">
                    Your profile does not have permission to view statistics. 
                    Please contact a Master Admin to request access.
                  </p>
                  <Badge variant="outline" className="mt-4">
                    Permission Required: Statistics
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PolygraphReportsSection;
