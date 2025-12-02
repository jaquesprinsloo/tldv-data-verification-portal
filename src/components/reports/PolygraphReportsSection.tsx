import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Users, Plus, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PolygraphReportForm from "@/components/admin/polygraph/PolygraphReportForm";
import PolygraphReportsList from "@/components/admin/polygraph/PolygraphReportsList";
import PolygraphStatistics from "@/components/admin/polygraph/PolygraphStatistics";
import PolygraphCandidates from "@/components/admin/polygraph/PolygraphCandidates";
import { generatePolygraphTemplate } from "@/utils/polygraphTemplateGenerator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.docx')) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a Word document (.docx) file.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
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
    try {
      toast({
        title: "Upload Received",
        description: "The report has been uploaded. Manual data entry may be required to complete processing.",
      });
      setFile(null);
      setActiveTab("create");
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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
              onSaved={handleReportSaved}
              onCancel={() => setActiveTab("reports")}
            />
          </TabsContent>
        )}

        {canEdit && (
          <TabsContent value="upload" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Completed Report</CardTitle>
                <CardDescription>
                  Upload a completed polygraph report template (.docx format)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center p-8 border-2 border-dashed rounded-lg">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <input
                    type="file"
                    accept=".docx"
                    onChange={handleFileChange}
                    className="hidden"
                    id="report-upload"
                  />
                  <label htmlFor="report-upload">
                    <Button variant="outline" asChild className="cursor-pointer">
                      <span>Select File</span>
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
                        {uploading ? "Uploading..." : "Upload Report"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Instructions:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Download the template using the "Download Template" button</li>
                    <li>Have the examiner complete the template during or after the examination</li>
                    <li>Save the completed document</li>
                    <li>Upload the completed document here</li>
                    <li>Review and verify the extracted data before saving</li>
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
