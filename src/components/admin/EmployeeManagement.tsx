import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Copy, Upload, Download, Eye, Mail, Store, Users, Briefcase, History } from "lucide-react";
import InviteEmployeeDialog from "./InviteEmployeeDialog";
import AuditHistoryDialog from "./AuditHistoryDialog";
import { DismissEmployeeDialog } from "./DismissEmployeeDialog";
import { StoreManagementDialog } from "./StoreManagementDialog";
import { MultiStoreAssignmentDialog } from "./MultiStoreAssignmentDialog";
import { EmploymentDetailsDialog } from "./EmploymentDetailsDialog";
import { BulkEmploymentStatusDialog } from "./BulkEmploymentStatusDialog";
import { Checkbox } from "@/components/ui/checkbox";
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
  email: string | null;
  created_at: string;
  employment_status: string;
  designation: string | null;
  store_id: string | null;
  user_id: string | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
  submission?: any;
  store?: { store_name: string; store_code: string } | null;
}

type FilterType = "all" | "approved" | "awaiting_status" | "awaiting_submission" | "flagged";
type ExternalFilterType = "all" | "verified" | "flagged" | "pending";

interface EmployeeManagementProps {
  filterType?: ExternalFilterType;
}

const EmployeeManagement = ({ filterType = "all" }: EmployeeManagementProps) => {
  const [employees, setEmployees] = useState<EmployeeWithSubmission[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; store_name: string; store_code: string }>>([]);
  const [multiStoreAssignments, setMultiStoreAssignments] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Map external filter to internal filter
  const activeFilter: FilterType = 
    filterType === "all" ? "all" :
    filterType === "verified" ? "approved" :
    filterType === "flagged" ? "flagged" :
    "awaiting_status"; // pending maps to awaiting_status
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [employeeToInvite, setEmployeeToInvite] = useState<{ id: string; number: string; email: string | null } | null>(null);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [employeeToDismiss, setEmployeeToDismiss] = useState<{ id: string; name: string; type: "dismissed" | "retrenched" } | null>(null);
  const [storeManagementOpen, setStoreManagementOpen] = useState(false);
  const [multiStoreDialogOpen, setMultiStoreDialogOpen] = useState(false);
  const [employeeForMultiStore, setEmployeeForMultiStore] = useState<{ id: string; name: string } | null>(null);
  const [employmentDetailsOpen, setEmploymentDetailsOpen] = useState(false);
  const [selectedEmployeeDetails, setSelectedEmployeeDetails] = useState<any>(null);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatusType, setBulkStatusType] = useState<"employed" | "dismissed" | "retrenched">("employed");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [employeeStatuses, setEmployeeStatuses] = useState<Map<string, string>>(new Map());
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false);
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchEmployees();
    fetchStores();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select(`
          id, 
          employee_number, 
          id_number, 
          email,
          created_at, 
          employment_status,
          designation,
          store_id,
          user_id,
          dismissed_at,
          dismissal_reason,
          store:stores(store_name, store_code)
        `)
        .order("created_at", { ascending: false });

      if (employeesError) throw employeesError;

      const { data: submissionsData, error: submissionsError } = await supabase
        .from("submissions")
        .select("*")
        .order("submission_timestamp", { ascending: false });

      if (submissionsError) throw submissionsError;

      // Fetch multi-store assignments
      const { data: assignmentsData } = await supabase
        .from("employee_store_assignments")
        .select("employee_id, store_id");

      // Count store assignments per employee
      const assignmentCounts = new Map<string, number>();
      assignmentsData?.forEach(assignment => {
        const count = assignmentCounts.get(assignment.employee_id) || 0;
        assignmentCounts.set(assignment.employee_id, count + 1);
      });
      setMultiStoreAssignments(assignmentCounts);

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

  const fetchStores = async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('store_name');

    if (error) {
      console.error('Error fetching stores:', error);
      return;
    }

    setStores(data || []);
  };

  const getEmployeeStatus = (employee: EmployeeWithSubmission) => {
    // Check if employee hasn't completed registration (no user_id linked)
    if (!employee.user_id) {
      return { status: "awaiting_submission", label: "Awaiting Registration", variant: "secondary" as const };
    }
    
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
    const statusMatch = activeFilter === "all" || getEmployeeStatus(emp).status === activeFilter;
    const storeMatch = storeFilter === "all" || emp.store_id === storeFilter;
    return statusMatch && storeMatch;
  });

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if employee number already exists
      const { data: existingEmployee } = await supabase
        .from("employees")
        .select("employee_number")
        .eq("employee_number", formData.employeeNumber)
        .maybeSingle();

      if (existingEmployee) {
        toast({
          title: "Duplicate Employee Number",
          description: "This employee number already exists in the system.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Check if ID number already exists
      const { data: existingId } = await supabase
        .from("employees")
        .select("id_number")
        .eq("id_number", formData.idNumber)
        .maybeSingle();

      if (existingId) {
        toast({
          title: "Duplicate ID Number",
          description: "This ID number already exists in the system.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

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

  const handleInviteEmployee = (employeeId: string, employeeNumber: string, employeeEmail: string | null) => {
    setEmployeeToInvite({ id: employeeId, number: employeeNumber, email: employeeEmail });
    setInviteDialogOpen(true);
  };

  const handleUpdateDesignation = async (employeeId: string, designation: string) => {
    const updateValue = designation === "none" ? null : designation;
    const { error } = await supabase
      .from('employees')
      .update({ designation: updateValue as any })
      .eq('id', employeeId);

    if (error) {
      console.error('Error updating designation:', error);
      toast({
        title: "Error",
        description: "Failed to update designation.",
        variant: "destructive",
      });
    } else {
      fetchEmployees();
    }
  };

  const handleUpdateStore = async (employeeId: string, storeId: string) => {
    const { error } = await supabase
      .from('employees')
      .update({ store_id: storeId === "none" ? null : storeId })
      .eq('id', employeeId);

    if (error) {
      console.error('Error updating store:', error);
      toast({
        title: "Error",
        description: "Failed to update store assignment.",
        variant: "destructive",
      });
    } else {
      fetchEmployees();
    }
  };

  const handleDismissEmployee = (employeeId: string, employeeName: string, type: "dismissed" | "retrenched") => {
    setEmployeeToDismiss({ id: employeeId, name: employeeName, type });
    setDismissDialogOpen(true);
  };

  const handleOpenMultiStore = (employeeId: string, employeeName: string) => {
    setEmployeeForMultiStore({ id: employeeId, name: employeeName });
    setMultiStoreDialogOpen(true);
  };

  const handleOpenEmploymentDetails = (employee: EmployeeWithSubmission) => {
    setSelectedEmployeeDetails({
      id: employee.id,
      designation: employee.designation,
      employment_status: employee.employment_status || 'active',
      dismissed_at: employee.dismissed_at,
      dismissal_reason: employee.dismissal_reason,
      dismissal_document_url: null,
      store: employee.store,
    });
    setEmploymentDetailsOpen(true);
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    const newSelection = new Set(selectedEmployeeIds);
    if (newSelection.has(employeeId)) {
      newSelection.delete(employeeId);
    } else {
      newSelection.add(employeeId);
    }
    setSelectedEmployeeIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  const handleBulkStatusUpdate = (status: "employed" | "dismissed" | "retrenched") => {
    if (selectedEmployeeIds.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select at least one employee",
        variant: "destructive",
      });
      return;
    }
    setBulkStatusType(status);
    setBulkStatusDialogOpen(true);
  };

  const handleStatusUpdate = (employeeId: string, status: "employed" | "dismissed" | "retrenched") => {
    setSelectedEmployeeIds(new Set([employeeId]));
    setBulkStatusType(status);
    setBulkStatusDialogOpen(true);
  };

  const handleStatusSuccess = () => {
    fetchEmployees();
    setSelectedEmployeeIds(new Set());
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
                  id="employee-csv-upload"
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
            <div className="flex gap-2">
              <Button onClick={handleCopySubmissionLink} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy Submission Link
              </Button>
              <Button onClick={() => setAuditHistoryOpen(true)} variant="outline">
                <History className="h-4 w-4 mr-2" />
                View History
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap items-center justify-between w-full">
            {activeFilter === "approved" && (
              <div className="flex gap-2 items-center ml-auto">
                <Label className="text-sm">Store:</Label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Stores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.store_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setStoreManagementOpen(true)}>
                  <Store className="h-4 w-4 mr-2" />
                  Manage Stores
                </Button>
              </div>
            )}
            {activeFilter === "approved" && selectedEmployeeIds.size > 0 && (
              <div className="flex gap-2">
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => handleBulkStatusUpdate("employed")}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Mark as Employed ({selectedEmployeeIds.size})
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => handleBulkStatusUpdate("retrenched")}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  Mark as Retrenched ({selectedEmployeeIds.size})
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {activeFilter === "approved" && (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedEmployeeIds.size === filteredEmployees.length && filteredEmployees.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Employee #</TableHead>
                  <TableHead>ID Number</TableHead>
                  {activeFilter === "approved" && <TableHead>Designation</TableHead>}
                  {activeFilter === "approved" && <TableHead>Store</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Added Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
               <TableBody>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {employees.length === 0 
                        ? "No employees found. Add your first employee above."
                        : "No employees match this filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => {
                    const { label, variant } = getEmployeeStatus(employee);
                    const employeeName = employee.submission 
                      ? `${employee.submission.first_name} ${employee.submission.last_name}`
                      : employee.employee_number;
                    const isLeaderOrFDO = employee.designation === 'team_leader' || employee.designation === 'fdo';
                    
                    return (
                      <TableRow key={employee.id}>
                        {activeFilter === "approved" && (
                          <TableCell>
                            <Checkbox
                              checked={selectedEmployeeIds.has(employee.id)}
                              onCheckedChange={() => toggleEmployeeSelection(employee.id)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          {employee.employee_number}
                        </TableCell>
                        <TableCell>{employee.id_number}</TableCell>
                        {activeFilter === "approved" && (
                          <TableCell>
                            <Select
                              value={employee.designation || "none"}
                              onValueChange={(value) => handleUpdateDesignation(employee.id, value)}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select designation" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No Designation</SelectItem>
                                <SelectItem value="team_leader">Team Leader</SelectItem>
                                <SelectItem value="fdo">FDO</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="assistant_manager">Assistant Manager</SelectItem>
                                <SelectItem value="buyer">Buyer</SelectItem>
                                <SelectItem value="sales_person">Sales Person</SelectItem>
                                <SelectItem value="cashier">Cashier</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        {activeFilter === "approved" && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isLeaderOrFDO && multiStoreAssignments.get(employee.id) && multiStoreAssignments.get(employee.id)! > 1 ? (
                                <>
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                                    Multi-Store
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenMultiStore(employee.id, employeeName)}
                                    title="Manage store assignments"
                                  >
                                    <Users className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Select
                                    value={employee.store_id || "none"}
                                    onValueChange={(value) => handleUpdateStore(employee.id, value)}
                                  >
                                    <SelectTrigger className="w-[180px]">
                                      <SelectValue placeholder="Select store" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">No Store</SelectItem>
                                      {stores.map((store) => (
                                        <SelectItem key={store.id} value={store.id}>
                                          {store.store_name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {isLeaderOrFDO && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleOpenMultiStore(employee.id, employeeName)}
                                      title="Assign multiple stores"
                                    >
                                      <Users className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                         <TableCell>
                          <div className="flex flex-col gap-2">
                            <Badge variant={variant}>{label}</Badge>
                            {activeFilter === "approved" && variant === "success" && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={employee.employment_status === 'employed' || employee.employment_status === 'active' ? "default" : "outline"}
                                  className={
                                    employee.employment_status === 'employed' || employee.employment_status === 'active'
                                      ? 'bg-green-600 hover:bg-green-700 text-white h-6 text-xs'
                                      : 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white h-6 text-xs'
                                  }
                                  onClick={() => handleStatusUpdate(employee.id, 'employed')}
                                >
                                  Employed
                                </Button>
                                <Button
                                  size="sm"
                                  variant={employee.employment_status === 'dismissed' ? "default" : "outline"}
                                  className={
                                    employee.employment_status === 'dismissed'
                                      ? 'bg-red-600 hover:bg-red-700 text-white h-6 text-xs'
                                      : 'border-destructive text-destructive hover:bg-destructive hover:text-white h-6 text-xs'
                                  }
                                  onClick={() => handleStatusUpdate(employee.id, 'dismissed')}
                                >
                                  Dismissed
                                </Button>
                                <Button
                                  size="sm"
                                  variant={employee.employment_status === 'retrenched' ? "default" : "outline"}
                                  className={
                                    employee.employment_status === 'retrenched'
                                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white h-6 text-xs'
                                      : 'border-yellow-600 text-yellow-600 hover:bg-yellow-600 hover:text-white h-6 text-xs'
                                  }
                                  onClick={() => handleStatusUpdate(employee.id, 'retrenched')}
                                >
                                  Retrenched
                                </Button>
                              </div>
                            )}
                          </div>
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
                              onClick={() => handleInviteEmployee(employee.id, employee.employee_number, employee.email)}
                              title="Invite to portal"
                            >
                              <Mail className="h-4 w-4 text-primary" />
                            </Button>
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

      {employeeToInvite && (
        <InviteEmployeeDialog
          employeeId={employeeToInvite.id}
          employeeNumber={employeeToInvite.number}
          employeeEmail={employeeToInvite.email}
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
        />
      )}

      {employeeToDismiss && (
        <DismissEmployeeDialog
          open={dismissDialogOpen}
          onOpenChange={setDismissDialogOpen}
          employeeId={employeeToDismiss.id}
          employeeName={employeeToDismiss.name}
          statusType={employeeToDismiss.type}
          onSuccess={fetchEmployees}
        />
      )}

      <StoreManagementDialog
        open={storeManagementOpen}
        onOpenChange={setStoreManagementOpen}
      />

      {employeeForMultiStore && (
        <MultiStoreAssignmentDialog
          open={multiStoreDialogOpen}
          onOpenChange={setMultiStoreDialogOpen}
          employeeId={employeeForMultiStore.id}
          employeeName={employeeForMultiStore.name}
          onSuccess={fetchEmployees}
        />
      )}

      <EmploymentDetailsDialog
        open={employmentDetailsOpen}
        onOpenChange={setEmploymentDetailsOpen}
        employeeId={selectedEmployeeDetails?.id || ""}
        employeeDetails={selectedEmployeeDetails}
      />

      <BulkEmploymentStatusDialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        employeeIds={Array.from(selectedEmployeeIds)}
        statusType={bulkStatusType}
        onSuccess={handleStatusSuccess}
      />

      <AuditHistoryDialog
        open={auditHistoryOpen}
        onOpenChange={setAuditHistoryOpen}
      />
    </div>
  );
};

export default EmployeeManagement;
