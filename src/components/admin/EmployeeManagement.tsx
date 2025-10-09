import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Copy, Upload, Download, Eye } from "lucide-react";
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
import SubmissionDetailDialog from "./SubmissionDetailDialog";

interface EmployeeWithSubmission {
  id: string;
  employee_number: string;
  id_number: string;
  created_at: string;
  submission?: any;
}

type FilterType = "all" | "approved" | "awaiting_status" | "awaiting_submission";

const EmployeeManagement = () => {
  const [employees, setEmployees] = useState<EmployeeWithSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      // Fetch employees with their submissions
      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("id, employee_number, id_number, created_at")
        .order("created_at", { ascending: false });

      if (employeesError) throw employeesError;

      // Fetch all submissions
      const { data: submissionsData, error: submissionsError } = await supabase
        .from("submissions")
        .select("*")
        .order("submission_timestamp", { ascending: false });

      if (submissionsError) throw submissionsError;

      // Map submissions to employees (one submission per employee)
      const employeesWithSubmissions = (employeesData || []).map((emp) => {
        const submission = submissionsData?.find((sub) => sub.employee_id === emp.id);
        return {
          ...emp,
          submission: submission || null,
        };
      });

      setEmployees(employeesWithSubmissions);
    } catch (error) {
      console.error("Error fetching employees:", error);
    }
  };

  const getEmployeeStatus = (employee: EmployeeWithSubmission) => {
    if (!employee.submission) {
      return { status: "awaiting_submission", label: "Awaiting Submission", variant: "outline" as const };
    }
    
    const submission = employee.submission;
    
    // Check if flagged
    if (submission.flagged) {
      return { status: "flagged", label: "Flagged", variant: "destructive" as const };
    }
    
    // Check status
    if (submission.status === "verified" || submission.status === "approved") {
      return { status: "approved", label: "Verified", variant: "success" as const };
    }
    
    // Pending status
    return { status: "awaiting_status", label: "Pending", variant: "warning" as const };
  };

  const filteredEmployees = employees.filter((emp) => {
    if (activeFilter === "all") return true;
    const { status } = getEmployeeStatus(emp);
    return status === activeFilter;
  });

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from("employees")
        .insert([
          {
            employee_number: formData.employeeNumber,
            id_number: formData.idNumber,
          },
        ]);

      if (error) throw error;

      toast({
        title: "Employee Added",
        description: "Employee number has been successfully added to the system.",
      });

      setFormData({ employeeNumber: "", idNumber: "" });
      fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add employee",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openDeleteDialog = (employeeId: string) => {
    setEmployeeToDelete(employeeId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;

    const id = employeeToDelete;
    setEmployees((prev) => prev.filter((e) => e.id !== id));

    try {
      const { error: submissionsError } = await supabase
        .from("submissions")
        .delete()
        .eq("employee_id", id);

      if (submissionsError) throw submissionsError;

      const { error: employeeError } = await supabase
        .from("employees")
        .delete()
        .eq("id", id);

      if (employeeError) throw employeeError;

      toast({
        title: "Employee Deleted",
        description: "Employee and all associated submissions have been removed from the system",
      });

      fetchEmployees();
    } catch (error) {
      fetchEmployees();
      toast({
        title: "Error",
        description: "Failed to delete employee",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    }
  };

  const handleCopySubmissionLink = () => {
    const link = `${window.location.origin}/employee/submit`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link Copied",
      description: "Employee submission link copied to clipboard",
    });
  };

  const handleDownloadTemplate = () => {
    const csvContent = "employee_number,id_number\n";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Template Downloaded",
      description: "CSV template downloaded successfully",
    });
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      const hasHeader = lines[0].toLowerCase().includes('employee') || lines[0].toLowerCase().includes('id');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      const employeesToInsert = dataLines.map(line => {
        const [employeeNumber, idNumber] = line.split(',').map(s => s.trim());
        return { employee_number: employeeNumber, id_number: idNumber };
      }).filter(emp => emp.employee_number && emp.id_number);

      if (employeesToInsert.length === 0) {
        throw new Error("No valid employee data found in CSV");
      }

      const { error } = await supabase
        .from("employees")
        .insert(employeesToInsert);

      if (error) throw error;

      toast({
        title: "Employees Added",
        description: `Successfully added ${employeesToInsert.length} employees`,
      });

      fetchEmployees();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload CSV",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleViewSubmission = (employee: EmployeeWithSubmission) => {
    if (employee.submission) {
      setSelectedSubmission(employee.submission);
      setDetailDialogOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Employee
          </CardTitle>
          <CardDescription>
            Add employee numbers to the system. Employees will use their number to submit verification details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddEmployee} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeNumber">Employee Number</Label>
                <Input
                  id="employeeNumber"
                  value={formData.employeeNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, employeeNumber: e.target.value })
                  }
                  required
                  placeholder="Enter employee number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idNumber">ID Number</Label>
                <Input
                  id="idNumber"
                  value={formData.idNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, idNumber: e.target.value })
                  }
                  required
                  placeholder="Enter ID number"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Employee"}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={uploading}
                  className="hidden"
                  id="csv-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload CSV"}
                </Button>
              </div>
            </div>
          </form>
          <p className="text-sm text-muted-foreground mt-2">
            CSV format: employee_number, id_number (one per line)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Employee List</CardTitle>
              <CardDescription>
                View employee records and submission statuses
              </CardDescription>
            </div>
            <Button onClick={handleCopySubmissionLink} variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Copy Submission Link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              variant={activeFilter === "all" ? "default" : "outline"}
              onClick={() => setActiveFilter("all")}
              size="sm"
            >
              All
            </Button>
            <Button
              variant={activeFilter === "approved" ? "default" : "outline"}
              onClick={() => setActiveFilter("approved")}
              size="sm"
            >
              Approved
            </Button>
            <Button
              variant={activeFilter === "awaiting_status" ? "default" : "outline"}
              onClick={() => setActiveFilter("awaiting_status")}
              size="sm"
            >
              Awaiting Status Update
            </Button>
            <Button
              variant={activeFilter === "awaiting_submission" ? "default" : "outline"}
              onClick={() => setActiveFilter("awaiting_submission")}
              size="sm"
            >
              Awaiting Submission
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {employees.length === 0 
                        ? "No employees found. Add your first employee above."
                        : "No employees match this filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => {
                    const { label, variant } = getEmployeeStatus(employee);
                    return (
                      <TableRow key={employee.id}>
                        <TableCell className="font-medium">
                          {employee.employee_number}
                        </TableCell>
                        <TableCell>{employee.id_number}</TableCell>
                        <TableCell>
                          <Badge variant={variant}>{label}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(employee.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {employee.submission && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewSubmission(employee)}
                                title="View submission details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(employee.id)}
                              title="Delete employee"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this employee? This will permanently remove the employee and all their submitted information from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEmployee}>
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubmissionDetailDialog
        submission={selectedSubmission}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUpdate={fetchEmployees}
        readOnly={selectedSubmission?.status === "verified"}
      />
    </div>
  );
};

export default EmployeeManagement;
