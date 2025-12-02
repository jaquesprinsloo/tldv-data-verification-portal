import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Users, Plus, Download, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PolygraphReportForm from "@/components/admin/polygraph/PolygraphReportForm";
import PolygraphReportsList from "@/components/admin/polygraph/PolygraphReportsList";
import PolygraphStatistics from "@/components/admin/polygraph/PolygraphStatistics";
import PolygraphCandidates from "@/components/admin/polygraph/PolygraphCandidates";
import { generatePolygraphTemplate } from "@/utils/polygraphTemplateGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import RiskAnalysisDisplay from "./RiskAnalysisDisplay";

interface PolygraphReportsSectionProps {
  canEdit: boolean;
}

const PolygraphReportsSection = ({ canEdit }: PolygraphReportsSectionProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleCreateNew = () => {
    if (!canEdit) {
      toast({
        title: "View Only",
        description: "You don't have permission to create reports.",
        variant: "destructive",
      });
      return;
    }
    setEditingReportId(null);
    setActiveTab("create");
  };

  const handleEditReport = (reportId: string) => {
    if (!canEdit) {
      toast({
        title: "View Only",
        description: "You don't have permission to edit reports.",
        variant: "destructive",
      });
      return;
    }
    setEditingReportId(reportId);
    setActiveTab("create");
  };

  const handleReportSaved = () => {
    setEditingReportId(null);
    setActiveTab("reports");
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

  const [extractedData, setExtractedData] = useState<any>(null);

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
          description: "Review the extracted information and proceed to create the report.",
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

  const handleProceedWithExtracted = () => {
    setActiveTab("create");
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
          {canEdit && (
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Report</span>
            </TabsTrigger>
          )}
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
            onCreateNew={handleCreateNew} 
            onEditReport={handleEditReport}
          />
        </TabsContent>

        {canEdit && (
          <TabsContent value="create" className="mt-6">
            <PolygraphReportForm 
              reportId={editingReportId}
              initialData={editingReportId ? null : extractedData}
              onSaved={() => {
                handleReportSaved();
                setExtractedData(null);
                setFile(null);
              }}
              onCancel={() => {
                setActiveTab("reports");
                setExtractedData(null);
              }}
            />
          </TabsContent>
        )}

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
                              <p><span className="text-muted-foreground">Store:</span> {extractedData.candidate.storeLocation || 'N/A'}</p>
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
                            <p className="text-sm"><span className="text-muted-foreground">Overall Result:</span> {extractedData.result.overallResult || 'N/A'}</p>
                          </div>
                        )}

                        {/* Disclosure Summary */}
                        {extractedData.disclosure && (
                          <div>
                            <h4 className="font-medium mb-2">Disclosure Summary</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <p><span className="text-muted-foreground">Workplace Theft:</span> {extractedData.disclosure.WorkplaceTheft || 'Not Disclosed'}</p>
                              <p><span className="text-muted-foreground">Bribery Paid:</span> {extractedData.disclosure.BriberyPaid || 'Not Disclosed'}</p>
                              <p><span className="text-muted-foreground">Drug Use History:</span> {extractedData.disclosure.DrugUseHistory || 'Not Disclosed'}</p>
                              <p><span className="text-muted-foreground">Organised Crime:</span> {extractedData.disclosure.OrganisedCrimeLinks || 'Not Disclosed'}</p>
                              <p><span className="text-muted-foreground">Arrests:</span> {extractedData.disclosure.Arrests || 'Not Disclosed'}</p>
                              <p><span className="text-muted-foreground">Convictions:</span> {extractedData.disclosure.Convictions || 'Not Disclosed'}</p>
                            </div>
                          </div>
                        )}

                        <Button onClick={handleProceedWithExtracted} className="w-full mt-4">
                          Proceed to Create Report & Candidate Profile
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
                    <li>Review the extracted data and proceed to create the report</li>
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
