import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, Users, Plus, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PolygraphReportForm from "./PolygraphReportForm";
import PolygraphReportsList from "./PolygraphReportsList";
import PolygraphStatistics from "./PolygraphStatistics";
import PolygraphCandidates from "./PolygraphCandidates";
import { generatePolygraphTemplate } from "@/utils/polygraphTemplateGenerator";

const PolygraphPortal = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleCreateNew = () => {
    setEditingReportId(null);
    setActiveTab("create");
  };

  const handleEditReport = (reportId: string) => {
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

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-end">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Report
          </TabsTrigger>
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Candidates
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Statistics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6">
          <PolygraphReportsList 
            onCreateNew={handleCreateNew} 
            onEditReport={handleEditReport}
          />
        </TabsContent>

        <TabsContent value="create" className="mt-6">
          <PolygraphReportForm 
            reportId={editingReportId}
            onSaved={handleReportSaved}
            onCancel={() => setActiveTab("reports")}
          />
        </TabsContent>

        <TabsContent value="upload" className="mt-6">
          <PolygraphReportUpload onUploaded={handleReportSaved} />
        </TabsContent>

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

// Placeholder component for upload functionality
const PolygraphReportUpload = ({ onUploaded }: { onUploaded: () => void }) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

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
      // TODO: Implement file parsing and data extraction
      toast({
        title: "Upload Received",
        description: "The report has been uploaded. Manual data entry may be required to complete processing.",
      });
      onUploaded();
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
      <div className="text-center p-8 border-2 border-dashed rounded-lg">
        <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Upload Completed Report</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a completed polygraph report template (.docx format)
        </p>
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
          <li>Download the template using the "Download Template" button above</li>
          <li>Have the examiner complete the template during or after the examination</li>
          <li>Save the completed document</li>
          <li>Upload the completed document here</li>
          <li>Review and verify the extracted data before saving</li>
        </ol>
      </div>
    </div>
  );
};

export default PolygraphPortal;
