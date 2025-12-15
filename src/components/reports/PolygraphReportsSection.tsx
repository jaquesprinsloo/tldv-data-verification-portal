import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Users, Download, Upload, Loader2, Save, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PolygraphReportsList from "@/components/admin/polygraph/PolygraphReportsList";
import PolygraphStatistics from "@/components/admin/polygraph/PolygraphStatistics";
import PolygraphCandidates from "@/components/admin/polygraph/PolygraphCandidates";
import { generatePolygraphTemplate } from "@/utils/polygraphTemplateGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import RiskAnalysisDisplay from "./RiskAnalysisDisplay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";

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
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  // Form fields for candidate
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");
  const [newExaminerName, setNewExaminerName] = useState("");
  const [showAddExaminer, setShowAddExaminer] = useState(false);

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
      if (!selectedFile.name.endsWith('.pdf')) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF file.",
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
    setUploadingStep('processing');
    setExtractedData(null);
    
    try {
      toast({
        title: "Processing Document",
        description: "Extracting data from PDF. This may take a moment...",
      });
      
      const pdfBase64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('extract-polygraph-report', {
        body: { 
          pdfBase64, 
          fileName: file.name
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to process document');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        setExtractedData(data.data);
        toast({
          title: "Data Extracted Successfully",
          description: "Review the extracted information and save the report.",
        });
      } else {
        throw new Error('No data extracted from document');
      }
    } catch (error) {
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

  // Parse date string to valid date format
  const parseExaminationDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];
    
    // Try to parse various date formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    
    // Try parsing "26 November 2024" format
    const months: Record<string, number> = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    const parts = dateStr.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = months[parts[2]];
      const year = parseInt(parts[3]);
      if (month !== undefined) {
        return new Date(year, month, day).toISOString().split("T")[0];
      }
    }
    
    return new Date().toISOString().split("T")[0];
  };

  const handleSaveReport = async () => {
    if (!extractedData) return;

    setSaving(true);
    try {
      // Upload the PDF file directly
      let pdfUrl: string | null = null;
      if (file) {
        const reportId = crypto.randomUUID();
        const fileName = `${reportId}/${file.name}`;
        
        const { error: uploadError } = await supabase.storage
          .from("polygraph-reports")
          .upload(fileName, file, { contentType: "application/pdf" });
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("polygraph-reports")
            .getPublicUrl(fileName);
          pdfUrl = publicUrl;
        }
      }

      const reportPayload: Record<string, any> = {
        store_id: selectedStoreId || null,
        examiner_id: selectedExaminerId || null,
        examination_date: parseExaminationDate(extractedData.examination?.date),
        first_name: extractedData.candidate?.firstName || "",
        last_name: extractedData.candidate?.lastName || "",
        id_number: extractedData.candidate?.idNumber || "",
        contact_number: extractedData.candidate?.contactNumber || null,
        email: extractedData.candidate?.email || null,
        physical_address: extractedData.candidate?.physicalAddress || null,
        position_applying_for: extractedData.candidate?.positionApplyingFor || null,
        overall_result: mapOverallResult(extractedData.examQuestions),
        examiner_notes: extractedData.result?.examinerNotes || null,
        status: "completed",
        report_pdf_url: pdfUrl,
        candidate_photo_url: extractedData.candidatePhotoUrl || null,
      };

      // Add risk analysis data
      if (extractedData.riskAnalysis) {
        reportPayload.risk_score = extractedData.riskAnalysis.TotalRiskScore || null;
        // Map risk level to allowed values: LOW, MEDIUM, HIGH, VERY HIGH
        const rawLevel = extractedData.riskAnalysis.RiskLevel || '';
        let mappedLevel = rawLevel.toUpperCase().replace(' RISK', '');
        // Map UNACCEPTABLE to VERY HIGH
        if (mappedLevel === 'UNACCEPTABLE') mappedLevel = 'VERY HIGH';
        reportPayload.risk_level = ['LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'].includes(mappedLevel) ? mappedLevel : null;
        reportPayload.risk_analysis = extractedData.riskAnalysis;
      }
      if (extractedData.disclosure) {
        reportPayload.extracted_disclosure = extractedData.disclosure;
      }
      if (extractedData.educationHistory) {
        reportPayload.education_history = extractedData.educationHistory;
      }
      if (extractedData.employmentHistory) {
        reportPayload.employment_history = extractedData.employmentHistory;
      }
      if (extractedData.familyCriminalHistory) {
        reportPayload.family_criminal_history = extractedData.familyCriminalHistory;
      }
      if (extractedData.friendCriminalHistory) {
        reportPayload.friend_criminal_history = extractedData.friendCriminalHistory;
      }
      if (extractedData.financialCircumstances) {
        reportPayload.financial_circumstances = extractedData.financialCircumstances;
      }
      if (extractedData.permitsLicensing) {
        reportPayload.permits_licensing = extractedData.permitsLicensing;
      }
      if (extractedData.personalLawEncounters) {
        reportPayload.personal_law_encounters = extractedData.personalLawEncounters;
      }
      if (extractedData.postExamAdmissions) {
        reportPayload.post_exam_admissions = extractedData.postExamAdmissions;
      }

      const { data: reportData, error: reportError } = await supabase
        .from("polygraph_reports")
        .insert(reportPayload as any)
        .select("id")
        .single();

      if (reportError) throw reportError;

      // Ensure an employee record exists for this candidate so they appear in the
      // Data & Employee Management portal's employee list
      const candidateIdNumber = extractedData.candidate?.idNumber || "";
      let employeeId: string | null = null;

      if (candidateIdNumber) {
        // Check if an employee with this ID number already exists
        const { data: existingEmployee } = await supabase
          .from("employees")
          .select("id")
          .eq("id_number", candidateIdNumber)
          .maybeSingle();

        if (existingEmployee) {
          employeeId = existingEmployee.id;
        } else {
          // Generate an employee number indicating polygraph origin
          const employeeNumber = `PG${Date.now().toString().slice(-6)}`;

          const { data: newEmployee, error: empError } = await supabase
            .from("employees")
            .insert({
              employee_number: employeeNumber,
              id_number: candidateIdNumber,
              email: extractedData.candidate?.email || null,
              store_id: selectedStoreId || null,
              employment_status: "active",
            })
            .select("id")
            .single();

          if (!empError && newEmployee) {
            employeeId = newEmployee.id;
          }
        }
      }

      // Create candidate profile linked to the employee (if created)
      const candidatePayload = {
        report_id: reportData.id,
        first_name: extractedData.candidate?.firstName || "",
        last_name: extractedData.candidate?.lastName || "",
        id_number: candidateIdNumber,
        email: extractedData.candidate?.email || null,
        contact_number: extractedData.candidate?.contactNumber || null,
        physical_address: extractedData.candidate?.physicalAddress || null,
        position: extractedData.candidate?.positionApplyingFor || null,
        store_id: selectedStoreId || null,
        status: "pending_review" as const,
        employee_id: employeeId,
      };

      await supabase.from("polygraph_candidates").insert([candidatePayload]);

      toast({
        title: "Report Saved",
        description: "Report completed and candidate profile created for review.",
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
        description: error.message || "Failed to save report",
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
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => setActiveTab("upload")}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Report
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
          {canEdit && (
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="candidates" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Candidates</span>
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Statistics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <PolygraphReportsList 
            onCreateNew={() => setActiveTab("upload")} 
            onEditReport={() => {}}
          />
        </TabsContent>

        {canEdit && (
          <TabsContent value="upload" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Completed Report</CardTitle>
                <CardDescription>
                  Upload a completed polygraph report PDF for AI data extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center p-8 border-2 border-dashed rounded-lg">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="report-upload"
                  />
                  <label htmlFor="report-upload">
                    <Button variant="outline" asChild className="cursor-pointer">
                      <span>Select PDF File</span>
                    </Button>
                  </label>
                  {file && (
                    <div className="mt-4">
                      <p className="text-sm font-medium">{file.name}</p>
                      {extractedData?.candidatePhotoUrl && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Extracted Photo:</p>
                          <img 
                            src={extractedData.candidatePhotoUrl} 
                            alt="Candidate" 
                            className="w-16 h-16 object-cover rounded-full mx-auto border"
                          />
                        </div>
                      )}
                      <Button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="mt-2"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Extracting data from PDF...
                          </>
                        ) : (
                          "Extract Report Data"
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {extractedData && (
                  <div className="space-y-6">
                    {/* Risk Analysis Display with extracted data for background summary */}
                    {extractedData.riskAnalysis && (
                      <RiskAnalysisDisplay 
                        riskAnalysis={extractedData.riskAnalysis} 
                        extractedData={{
                          educationHistory: extractedData.educationHistory,
                          employmentHistory: extractedData.employmentHistory,
                          familyCriminalHistory: extractedData.familyCriminalHistory,
                          friendCriminalHistory: extractedData.friendCriminalHistory,
                          financialCircumstances: extractedData.financialCircumstances,
                          permitsLicensing: extractedData.permitsLicensing,
                          personalLawEncounters: extractedData.personalLawEncounters,
                          disclosure: extractedData.disclosure,
                          examQuestions: extractedData.examQuestions,
                        }}
                      />
                    )}

                    <Card className="bg-muted/50">
                      <CardHeader>
                        <CardTitle className="text-lg">Extracted Candidate Data</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {extractedData.candidate && (
                          <div>
                            <h4 className="font-medium mb-2">Candidate Information</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">Name:</span> {extractedData.candidate.firstName} {extractedData.candidate.lastName}</p>
                              <p><span className="text-muted-foreground">ID Number:</span> {extractedData.candidate.idNumber || 'N/A'}</p>
                              <p><span className="text-muted-foreground">Contact:</span> {extractedData.candidate.contactNumber || 'N/A'}</p>
                              <p><span className="text-muted-foreground">Email:</span> {extractedData.candidate.email || 'N/A'}</p>
                              <p><span className="text-muted-foreground">Position:</span> {extractedData.candidate.positionApplyingFor || 'N/A'}</p>
                              <p><span className="text-muted-foreground">Address:</span> {extractedData.candidate.physicalAddress || 'N/A'}</p>
                            </div>
                          </div>
                        )}
                        
                        {extractedData.examination && (
                          <div>
                            <h4 className="font-medium mb-2">Examination Details</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">Date:</span> {extractedData.examination.date || 'N/A'}</p>
                              <p><span className="text-muted-foreground">Examiner:</span> {extractedData.examination.examinerName || 'N/A'}</p>
                            </div>
                          </div>
                        )}

                        {extractedData.result && (
                          <div>
                            <h4 className="font-medium mb-2">Result</h4>
                            <p className="text-sm">
                              <span className="text-muted-foreground">Overall Result:</span>{" "}
                              <Badge variant={
                                extractedData.result.overallResult === 'passed' ? 'default' :
                                extractedData.result.overallResult === 'failed' ? 'destructive' : 'secondary'
                              }>
                                {extractedData.result.overallResult || 'N/A'}
                              </Badge>
                            </p>
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
        )}

        <TabsContent value="candidates" className="mt-6">
          <PolygraphCandidates />
        </TabsContent>

        <TabsContent value="statistics" className="mt-6">
          <PolygraphStatistics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PolygraphReportsSection;
