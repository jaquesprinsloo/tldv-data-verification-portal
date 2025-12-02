import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Users, Download, Upload, Loader2, Save } from "lucide-react";
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

interface PolygraphReportsSectionProps {
  canEdit: boolean;
}

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

interface Examiner {
  id: string;
  name: string;
}

const PolygraphReportsSection = ({ canEdit }: PolygraphReportsSectionProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  
  // Form fields for candidate
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [selectedExaminerId, setSelectedExaminerId] = useState("");

  const fetchStoresAndExaminers = async () => {
    const [storesRes, examinersRes] = await Promise.all([
      supabase.from("stores").select("id, store_name, store_code").order("store_name"),
      supabase.from("examiners").select("id, name").eq("is_active", true).order("name")
    ]);
    setStores(storesRes.data || []);
    setExaminers(examinersRes.data || []);
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
          description: "Please upload a PDF document (.pdf) file.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setExtractedData(null);
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
    setExtractedData(null);
    
    try {
      toast({
        title: "Processing Document",
        description: "AI is extracting information from the PDF. This may take a moment...",
      });

      // Fetch stores and examiners while processing
      fetchStoresAndExaminers();

      const pdfBase64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('extract-polygraph-report', {
        body: { pdfBase64, fileName: file.name }
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
    }
  };

  const handleSaveReport = async () => {
    if (!extractedData) return;

    setSaving(true);
    try {
      const reportPayload: Record<string, any> = {
        store_id: selectedStoreId || null,
        examiner_id: selectedExaminerId || null,
        examination_date: extractedData.examination?.date || new Date().toISOString().split("T")[0],
        first_name: extractedData.candidate?.firstName || "",
        last_name: extractedData.candidate?.lastName || "",
        id_number: extractedData.candidate?.idNumber || "",
        contact_number: extractedData.candidate?.contactNumber || null,
        email: extractedData.candidate?.email || null,
        physical_address: extractedData.candidate?.physicalAddress || null,
        position_applying_for: extractedData.candidate?.positionApplyingFor || null,
        overall_result: extractedData.result?.overallResult || null,
        examiner_notes: extractedData.result?.examinerNotes || null,
        status: "completed",
      };

      // Add risk analysis data
      if (extractedData.riskAnalysis) {
        reportPayload.risk_score = extractedData.riskAnalysis.TotalRiskScore || null;
        reportPayload.risk_level = extractedData.riskAnalysis.RiskLevel || null;
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

      // Create candidate profile
      const candidatePayload = {
        report_id: reportData.id,
        first_name: extractedData.candidate?.firstName || "",
        last_name: extractedData.candidate?.lastName || "",
        id_number: extractedData.candidate?.idNumber || "",
        email: extractedData.candidate?.email || null,
        contact_number: extractedData.candidate?.contactNumber || null,
        physical_address: extractedData.candidate?.physicalAddress || null,
        position: extractedData.candidate?.positionApplyingFor || null,
        store_id: selectedStoreId || null,
        status: "pending_review" as const,
      };

      await supabase.from("polygraph_candidates").insert([candidatePayload]);

      toast({
        title: "Report Saved",
        description: "Report completed and candidate profile created for review.",
      });

      // Reset and go to reports list
      setExtractedData(null);
      setFile(null);
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
                  Upload a completed polygraph report PDF for AI data extraction
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
                      <Button
                        onClick={handleUpload}
                        disabled={uploading}
                        className="mt-2"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Extracting Data...
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
                    {/* Risk Analysis Display */}
                    {extractedData.riskAnalysis && (
                      <RiskAnalysisDisplay riskAnalysis={extractedData.riskAnalysis} />
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

                        {/* Key Risk Concerns from Risk Analysis */}
                        {extractedData.riskAnalysis?.KeyRiskConcerns && extractedData.riskAnalysis.KeyRiskConcerns.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">Key Risk Concerns</h4>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              {extractedData.riskAnalysis.KeyRiskConcerns.map((concern: string, idx: number) => (
                                <li key={idx} className="text-destructive">{concern}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Store and Examiner Selection */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                          <div className="space-y-2">
                            <Label>Store Location</Label>
                            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select store" />
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
                                {examiners.map((examiner) => (
                                  <SelectItem key={examiner.id} value={examiner.id}>
                                    {examiner.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Button 
                          onClick={handleSaveReport} 
                          disabled={saving}
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
