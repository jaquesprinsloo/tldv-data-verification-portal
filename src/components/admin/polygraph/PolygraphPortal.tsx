import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, BarChart3, Users, Plus } from "lucide-react";
import PolygraphReportForm from "./PolygraphReportForm";
import PolygraphReportsList from "./PolygraphReportsList";
import PolygraphStatistics from "./PolygraphStatistics";
import PolygraphCandidates from "./PolygraphCandidates";

const PolygraphPortal = () => {
  const [activeTab, setActiveTab] = useState("reports");
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Report
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

export default PolygraphPortal;
