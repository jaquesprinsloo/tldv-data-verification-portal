import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, Edit, Trash2, FileText, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { RiskProfileDialog } from "@/components/shared/RiskProfileDialog";
import { extractStoragePath } from "@/lib/storageUtils";

interface PolygraphReport {
  id: string;
  first_name: string;
  last_name: string;
  id_number: string;
  examination_date: string;
  status: string;
  overall_result: string | null;
  risk_level: string | null;
  store_id: string | null;
  created_at: string;
  report_pdf_url?: string | null;
  candidate_photo_url?: string | null;
  stores?: { store_name: string } | null;
  examiners?: { name: string } | null;
}

interface PolygraphReportsListProps {
  onCreateNew: () => void;
  onEditReport: (reportId: string) => void;
  filterByUploader?: boolean;
  currentUserId?: string | null;
}

const PolygraphReportsList = ({ onCreateNew, onEditReport, filterByUploader = false, currentUserId }: PolygraphReportsListProps) => {
  const { toast } = useToast();
  const [reports, setReports] = useState<PolygraphReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Risk profile dialog state
  const [riskProfileOpen, setRiskProfileOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState<string>("");
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<PolygraphReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [filterByUploader, currentUserId]);

  const fetchReports = async () => {
    try {
      let query = supabase
        .from("polygraph_reports")
        .select(`
          *,
          stores(store_name),
          examiners(name)
        `)
        .order("created_at", { ascending: false });

      // Filter by uploader if required and user ID is available
      if (filterByUploader && currentUserId) {
        query = query.eq("uploaded_by", currentUserId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setReports(data || []);
    } catch (error: any) {
      console.error("Error fetching reports:", error);
      toast({
        title: "Error",
        description: "Failed to load polygraph reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDialog = (report: PolygraphReport) => {
    setReportToDelete(report);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    
    setDeleting(true);
    try {
      // ========== STORAGE CLEANUP FIRST ==========
      
      // Delete report PDF from polygraph-reports bucket
      if (reportToDelete.report_pdf_url) {
        const pdfPath = extractStoragePath(reportToDelete.report_pdf_url, "polygraph-reports");
        if (pdfPath) {
          await supabase.storage.from("polygraph-reports").remove([pdfPath]);
        }
      }

      // Delete candidate photo from employee-selfies bucket
      if (reportToDelete.candidate_photo_url) {
        const photoPath = extractStoragePath(reportToDelete.candidate_photo_url, "employee-selfies");
        if (photoPath) {
          await supabase.storage.from("employee-selfies").remove([photoPath]);
        }
      }

      // ========== DATABASE CLEANUP ==========
      const { error } = await supabase
        .from("polygraph_reports")
        .delete()
        .eq("id", reportToDelete.id);

      if (error) throw error;

      toast({
        title: "Report Permanently Deleted",
        description: "The polygraph report and all associated files have been completely removed.",
      });
      
      setDeleteDialogOpen(false);
      setReportToDelete(null);
      fetchReports();
    } catch (error: any) {
      console.error("Error deleting report:", error);
      toast({
        title: "Error",
        description: "Failed to delete the report",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      completed: "secondary",
      approved: "default",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">Pending</Badge>;
    if (result === "passed") {
      return <Badge variant="success">{result}</Badge>;
    }
    if (result === "failed") {
      return <Badge variant="destructive">{result}</Badge>;
    }
    return <Badge variant="warning">{result}</Badge>;
  };

  const getRiskLevelBadge = (level: string | null) => {
    if (!level) return null;
    const colors: Record<string, string> = {
      LOW: "bg-green-500",
      MEDIUM: "bg-yellow-500",
      HIGH: "bg-orange-500",
      "VERY HIGH": "bg-red-500",
    };
    return <Badge className={colors[level] || "bg-gray-500"}>{level}</Badge>;
  };

  const handleViewRiskProfile = (report: PolygraphReport) => {
    setSelectedReportId(report.id);
    setSelectedCandidateName(`${report.first_name} ${report.last_name}`);
    setRiskProfileOpen(true);
  };

  const filteredReports = reports.filter((report) => {
    const query = searchQuery.toLowerCase();
    return (
      report.first_name.toLowerCase().includes(query) ||
      report.last_name.toLowerCase().includes(query) ||
      report.id_number.includes(query)
    );
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Polygraph Reports
            </CardTitle>
            <CardDescription>
              Manage and view all polygraph examination reports
            </CardDescription>
          </div>
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            New Report
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No reports found</p>
            <Button onClick={onCreateNew} variant="outline" className="mt-4">
              Create your first report
            </Button>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {report.first_name} {report.last_name}
                    </TableCell>
                    <TableCell>{report.id_number}</TableCell>
                    <TableCell>{format(new Date(report.examination_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{report.stores?.store_name || "N/A"}</TableCell>
                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                    <TableCell>{getResultBadge(report.overall_result)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewRiskProfile(report)}
                          title="View Risk Profile"
                        >
                          <Eye className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditReport(report.id)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(report)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Risk Profile Dialog */}
      <RiskProfileDialog
        open={riskProfileOpen}
        onOpenChange={setRiskProfileOpen}
        reportId={selectedReportId || undefined}
        candidateName={selectedCandidateName}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanent Deletion Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium text-foreground">
                This action will permanently delete:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>The polygraph report and all assessment data</li>
                <li>The uploaded PDF report file (if any)</li>
                <li>Candidate photo (if uploaded)</li>
                <li>All examination questions and findings</li>
                <li>Risk analysis and admissions data</li>
              </ul>
              {reportToDelete && (
                <p className="text-sm bg-muted p-2 rounded">
                  <strong>Candidate:</strong> {reportToDelete.first_name} {reportToDelete.last_name}
                  <br />
                  <strong>ID:</strong> {reportToDelete.id_number}
                </p>
              )}
              <p className="text-sm font-semibold text-destructive pt-2">
                All associated files will be removed from storage. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default PolygraphReportsList;
