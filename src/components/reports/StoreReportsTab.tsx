import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Upload, FileText, ClipboardCheck, ShieldCheck, Plus, Trash2, Eye, Shield } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { RiskProfileDialog } from "@/components/shared/RiskProfileDialog";

interface StoreReportsTabProps {
  storeId: string;
  canEdit: boolean;
}

interface Employee {
  id: string;
  employee_number: string;
  submission?: { first_name: string; last_name: string } | null;
}

export const StoreReportsTab = ({ storeId, canEdit }: StoreReportsTabProps) => {
  const [activeTab, setActiveTab] = useState("polygraph");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [examiners, setExaminers] = useState<{ id: string; name: string }[]>([]);
  const [polygraphReports, setPolygraphReports] = useState<any[]>([]);
  const [polygraphFullReports, setPolygraphFullReports] = useState<any[]>([]);
  const [riskReports, setRiskReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"polygraph" | "risk">("polygraph");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Risk profile dialog state
  const [riskProfileOpen, setRiskProfileOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState<string>("");

  const [formData, setFormData] = useState({
    employee_id: "",
    date: "",
    examiner_id: "",
    assessor_name: "",
    examination_type: "periodic_screening",
    result: "pending",
    id_verification_status: "pending",
    criminal_check_status: "pending",
    notes: "",
    admission_before_exam: "",
    admission_after_exam: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: "polygraph" | "risk"; reportUrl?: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [storeId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [employeesRes, examinersRes, polygraphRes, polygraphFullRes, riskRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_number, submissions (first_name, last_name)")
          .eq("store_id", storeId),
        supabase.from("examiners").select("id, name").eq("is_active", true),
        supabase
          .from("examinations")
          .select("*, employees (employee_number, submissions (first_name, last_name)), examiners (name)")
          .eq("store_id", storeId)
          .order("examination_date", { ascending: false }),
        // Fetch polygraph_reports linked to this store (from PDF uploads)
        supabase
          .from("polygraph_reports")
          .select("*, examiners (name)")
          .eq("store_id", storeId)
          .order("examination_date", { ascending: false }),
        supabase
          .from("risk_assessments")
          .select("*, employees (employee_number, submissions (first_name, last_name))")
          .eq("store_id", storeId)
          .order("assessment_date", { ascending: false }),
      ]);

      setEmployees((employeesRes.data || []).map((e: any) => ({ ...e, submission: e.submissions })));
      setExaminers(examinersRes.data || []);
      setPolygraphReports(polygraphRes.data || []);
      setPolygraphFullReports(polygraphFullRes.data || []);
      setRiskReports(riskRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleViewRiskProfile = (report: any) => {
    setSelectedReportId(report.id);
    setSelectedCandidateName(`${report.first_name} ${report.last_name}`);
    setRiskProfileOpen(true);
  };

  const openUploadDialog = (type: "polygraph" | "risk") => {
    setUploadType(type);
    setFormData({
      employee_id: "",
      date: new Date().toISOString().split("T")[0],
      examiner_id: "",
      assessor_name: "",
      examination_type: "periodic_screening",
      result: "pending",
      id_verification_status: "pending",
      criminal_check_status: "pending",
      notes: "",
      admission_before_exam: "",
      admission_after_exam: "",
    });
    setSelectedFile(null);
    setUploadDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
    } else {
      toast.error("Please select a PDF file");
    }
  };

  const handleUploadReport = async () => {
    if (!formData.date) {
      toast.error("Please select a date");
      return;
    }

    setUploading(true);
    try {
      let reportUrl = null;

      // Upload PDF if selected
      if (selectedFile) {
        const fileName = `${storeId}/${uploadType}/${Date.now()}_${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("invoices") // Reusing invoices bucket for reports
          .upload(fileName, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from("invoices").getPublicUrl(fileName);
        reportUrl = publicUrl;
      }

      if (uploadType === "polygraph") {
        const { error } = await supabase.from("examinations").insert({
          store_id: storeId,
          employee_id: formData.employee_id || null,
          examination_date: formData.date,
          examination_type: formData.examination_type as any,
          examiner_id: formData.examiner_id || null,
          result: formData.result as any,
          notes: formData.notes || null,
          admission_before_exam: formData.admission_before_exam || null,
          admission_after_exam: formData.admission_after_exam || null,
          report_url: reportUrl,
        });

        if (error) throw error;
        toast.success("Polygraph examination added");
      } else {
        const { error } = await supabase.from("risk_assessments").insert({
          store_id: storeId,
          employee_id: formData.employee_id || null,
          assessment_date: formData.date,
          assessor_name: formData.assessor_name || null,
          id_verification_status: formData.id_verification_status,
          criminal_check_status: formData.criminal_check_status,
          result: formData.result as any,
          notes: formData.notes || null,
          report_url: reportUrl,
        });

        if (error) throw error;
        toast.success("Risk assessment added");
      }

      setUploadDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error("Error uploading report:", error);
      toast.error(error.message || "Failed to upload report");
    } finally {
      setUploading(false);
    }
  };

  const getResultBadge = (result: string) => {
    const config: Record<string, { className: string }> = {
      pass: { className: "bg-green-500" },
      clear: { className: "bg-green-500" },
      fail: { className: "bg-red-500" },
      flagged: { className: "bg-red-500" },
      pending: { className: "bg-yellow-500" },
      inconclusive: { className: "bg-orange-500" },
    };
    return <Badge className={config[result]?.className}>{result}</Badge>;
  };

  const getEmployeeName = (emp: any) => {
    if (emp?.submissions?.first_name) {
      return `${emp.submissions.first_name} ${emp.submissions.last_name}`;
    }
    return emp?.employee_number || "-";
  };

  const handleDeleteClick = (id: string, type: "polygraph" | "risk", reportUrl?: string | null) => {
    setItemToDelete({ id, type, reportUrl });
    setDeleteDialogOpen(true);
  };

  const handleDeleteReport = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      // Delete from storage if there's a file
      if (itemToDelete.reportUrl) {
        const urlParts = itemToDelete.reportUrl.split("/invoices/");
        if (urlParts[1]) {
          await supabase.storage.from("invoices").remove([urlParts[1]]);
        }
      }

      // Delete from database
      const tableName = itemToDelete.type === "polygraph" ? "examinations" : "risk_assessments";
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq("id", itemToDelete.id);

      if (error) throw error;

      toast.success(`${itemToDelete.type === "polygraph" ? "Polygraph examination" : "Risk assessment"} deleted successfully`);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      fetchData();
    } catch (error: any) {
      console.error("Error deleting report:", error);
      toast.error(error.message || "Failed to delete report");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="polygraph" className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Polygraph Reports
            </TabsTrigger>
            <TabsTrigger value="risk" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Risk Assessment Reports
            </TabsTrigger>
          </TabsList>

          {canEdit && (
            <Button onClick={() => openUploadDialog(activeTab as "polygraph" | "risk")}>
              <Plus className="h-4 w-4 mr-2" />
              Add {activeTab === "polygraph" ? "Examination" : "Assessment"}
            </Button>
          )}
        </div>

        <TabsContent value="polygraph">
          <div className="space-y-6">
            {/* Full Polygraph Reports from PDF Uploads */}
            {polygraphFullReports.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Polygraph Vetting Reports (from PDF Uploads)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Examiner</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {polygraphFullReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>{format(new Date(report.examination_date), "PP")}</TableCell>
                          <TableCell className="font-medium">{report.first_name} {report.last_name}</TableCell>
                          <TableCell>{report.id_number}</TableCell>
                          <TableCell>{report.examiners?.name || "-"}</TableCell>
                          <TableCell>
                            {report.risk_level && (
                              <Badge className={
                                report.risk_level === "LOW" ? "bg-green-500" :
                                report.risk_level === "MEDIUM" ? "bg-yellow-500" :
                                report.risk_level === "HIGH" ? "bg-orange-500" :
                                "bg-red-500"
                              }>
                                {report.risk_level}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {report.overall_result && (
                              <Badge variant={
                                report.overall_result === "passed" ? "default" :
                                report.overall_result === "failed" ? "destructive" :
                                "secondary"
                              }>
                                {report.overall_result}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewRiskProfile(report)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Profile
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Regular Polygraph Examinations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-green-500" />
                  Polygraph Examinations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {polygraphReports.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No polygraph examinations recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Examiner</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Report</TableHead>
                        {canEdit && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {polygraphReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell>{format(new Date(report.examination_date), "PP")}</TableCell>
                          <TableCell>{getEmployeeName(report.employees)}</TableCell>
                          <TableCell className="capitalize">{report.examination_type.replace(/_/g, " ")}</TableCell>
                          <TableCell>{report.examiners?.name || "-"}</TableCell>
                          <TableCell>{getResultBadge(report.result)}</TableCell>
                          <TableCell>
                            {report.report_url ? (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={report.report_url} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteClick(report.id, "polygraph", report.report_url)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="risk">
          <Card>
            <CardContent className="pt-4">
              {riskReports.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No risk assessment reports uploaded</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>ID Verification</TableHead>
                      <TableHead>Criminal Check</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Report</TableHead>
                      {canEdit && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {riskReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>{format(new Date(report.assessment_date), "PP")}</TableCell>
                        <TableCell>{getEmployeeName(report.employees)}</TableCell>
                        <TableCell className="capitalize">{report.id_verification_status}</TableCell>
                        <TableCell className="capitalize">{report.criminal_check_status}</TableCell>
                        <TableCell>{getResultBadge(report.result)}</TableCell>
                        <TableCell>
                          {report.report_url ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={report.report_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(report.id, "risk", report.report_url)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add {uploadType === "polygraph" ? "Polygraph Examination" : "Risk Assessment"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Link to Employee</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={(v) => setFormData({ ...formData, employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.submission ? `${emp.submission.first_name} ${emp.submission.last_name}` : emp.employee_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {uploadType === "polygraph" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Examination Type</Label>
                    <Select
                      value={formData.examination_type}
                      onValueChange={(v) => setFormData({ ...formData, examination_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="periodic_screening">Periodic Screening</SelectItem>
                        <SelectItem value="pre_employment">Pre-Employment</SelectItem>
                        <SelectItem value="specific">Specific</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Examiner</Label>
                    <Select
                      value={formData.examiner_id}
                      onValueChange={(v) => setFormData({ ...formData, examiner_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select examiner" />
                      </SelectTrigger>
                      <SelectContent>
                        {examiners.map((ex) => (
                          <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Admission Before Exam</Label>
                    <Input
                      value={formData.admission_before_exam}
                      onChange={(e) => setFormData({ ...formData, admission_before_exam: e.target.value })}
                      placeholder="Any admissions made before"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Admission After Exam</Label>
                    <Input
                      value={formData.admission_after_exam}
                      onChange={(e) => setFormData({ ...formData, admission_after_exam: e.target.value })}
                      placeholder="Any admissions made after"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ID Verification Status</Label>
                    <Select
                      value={formData.id_verification_status}
                      onValueChange={(v) => setFormData({ ...formData, id_verification_status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Criminal Check Status</Label>
                    <Select
                      value={formData.criminal_check_status}
                      onValueChange={(v) => setFormData({ ...formData, criminal_check_status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="clear">Clear</SelectItem>
                        <SelectItem value="flagged">Flagged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Assessor Name</Label>
                  <Input
                    value={formData.assessor_name}
                    onChange={(e) => setFormData({ ...formData, assessor_name: e.target.value })}
                    placeholder="Name of person who conducted assessment"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Result</Label>
              <Select
                value={formData.result}
                onValueChange={(v) => setFormData({ ...formData, result: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uploadType === "polygraph" ? (
                    <>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="pass">Pass</SelectItem>
                      <SelectItem value="fail">Fail</SelectItem>
                      <SelectItem value="inconclusive">Inconclusive</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>

            <div className="space-y-2">
              <Label>Upload Report (PDF)</Label>
              <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? selectedFile.name : "Select PDF"}
                </Button>
                {selectedFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUploadReport} disabled={uploading}>
              {uploading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemToDelete?.type === "polygraph" ? "Polygraph Examination" : "Risk Assessment"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {itemToDelete?.type === "polygraph" ? "polygraph examination" : "risk assessment"}? 
              This action cannot be undone and will also remove the associated report file if present.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteReport} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Risk Profile Dialog */}
      <RiskProfileDialog
        open={riskProfileOpen}
        onOpenChange={setRiskProfileOpen}
        reportId={selectedReportId || undefined}
        candidateName={selectedCandidateName}
      />
    </div>
  );
};
