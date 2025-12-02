import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Eye, FileText, ClipboardCheck, ShieldCheck, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Employee {
  id: string;
  employee_number: string;
  id_number: string;
  designation: string | null;
  employment_status: string;
  email: string | null;
  submission?: {
    first_name: string;
    last_name: string;
    contact_number: string | null;
    physical_address: string;
    email: string;
  } | null;
}

interface StoreEmployeesListProps {
  storeId: string;
  storeName: string;
  canEdit: boolean;
}

export const StoreEmployeesList = ({ storeId, storeName, canEdit }: StoreEmployeesListProps) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [employeeData, setEmployeeData] = useState<{
    popia: any | null;
    examinations: any[];
    riskAssessments: any[];
  }>({ popia: null, examinations: [], riskAssessments: [] });
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchEmployees();
  }, [storeId]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          employee_number,
          id_number,
          designation,
          employment_status,
          email,
          submissions (
            first_name,
            last_name,
            contact_number,
            physical_address,
            email
          )
        `)
        .eq("store_id", storeId)
        .order("employee_number");

      if (error) throw error;

      const formattedEmployees = (data || []).map((emp: any) => ({
        ...emp,
        submission: emp.submissions || null,
      }));

      setEmployees(formattedEmployees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setDetailDialogOpen(true);
    setLoadingDetails(true);

    try {
      const [popiaResult, examsResult, riskResult] = await Promise.all([
        supabase
          .from("popia_acceptances")
          .select("*")
          .eq("employee_id", employee.id)
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("examinations")
          .select(`
            *,
            examiners (name, email)
          `)
          .eq("employee_id", employee.id)
          .order("examination_date", { ascending: false }),
        supabase
          .from("risk_assessments")
          .select("*")
          .eq("employee_id", employee.id)
          .order("assessment_date", { ascending: false }),
      ]);

      setEmployeeData({
        popia: popiaResult.data,
        examinations: examsResult.data || [],
        riskAssessments: riskResult.data || [],
      });
    } catch (error) {
      console.error("Error fetching employee details:", error);
      toast.error("Failed to load employee details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      employed: "default",
      dismissed: "destructive",
      suspended: "secondary",
      resigned: "outline",
      retrenched: "outline",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const getResultBadge = (result: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pass: "default",
      clear: "default",
      fail: "destructive",
      flagged: "destructive",
      pending: "secondary",
      inconclusive: "outline",
    };
    const colors: Record<string, string> = {
      pass: "bg-green-500",
      clear: "bg-green-500",
      fail: "bg-red-500",
      flagged: "bg-red-500",
      pending: "bg-yellow-500",
      inconclusive: "bg-orange-500",
    };
    return (
      <Badge variant={variants[result] || "secondary"} className={colors[result]}>
        {result}
      </Badge>
    );
  };

  const formatDesignation = (designation: string | null) => {
    if (!designation) return "-";
    return designation
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employees at {storeName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No employees assigned to this store</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.employee_number}</TableCell>
                    <TableCell>
                      {employee.submission
                        ? `${employee.submission.first_name} ${employee.submission.last_name}`
                        : "-"}
                    </TableCell>
                    <TableCell>{employee.id_number}</TableCell>
                    <TableCell>{formatDesignation(employee.designation)}</TableCell>
                    <TableCell>{getStatusBadge(employee.employment_status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewEmployee(employee)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Employee Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Employee Details - {selectedEmployee?.submission?.first_name} {selectedEmployee?.submission?.last_name}
            </DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">Personal Info</TabsTrigger>
                <TabsTrigger value="popia">POPIA</TabsTrigger>
                <TabsTrigger value="polygraph">Polygraph</TabsTrigger>
                <TabsTrigger value="risk">Risk Assessments</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Employee Number</p>
                        <p className="font-medium">{selectedEmployee?.employee_number}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">ID Number</p>
                        <p className="font-medium">{selectedEmployee?.id_number}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Full Name</p>
                        <p className="font-medium">
                          {selectedEmployee?.submission
                            ? `${selectedEmployee.submission.first_name} ${selectedEmployee.submission.last_name}`
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Designation</p>
                        <p className="font-medium">{formatDesignation(selectedEmployee?.designation || null)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{selectedEmployee?.submission?.email || selectedEmployee?.email || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Contact Number</p>
                        <p className="font-medium">{selectedEmployee?.submission?.contact_number || "-"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Physical Address</p>
                        <p className="font-medium">{selectedEmployee?.submission?.physical_address || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Employment Status</p>
                        {selectedEmployee && getStatusBadge(selectedEmployee.employment_status)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="popia" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      POPIA Declaration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeData.popia ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Accepted At</p>
                            <p className="font-medium">
                              {format(new Date(employeeData.popia.accepted_at), "PPpp")}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">IP Address</p>
                            <p className="font-medium">{employeeData.popia.ip_address}</p>
                          </div>
                          {employeeData.popia.gps_latitude && (
                            <div>
                              <p className="text-sm text-muted-foreground">GPS Coordinates</p>
                              <p className="font-medium">
                                {employeeData.popia.gps_latitude}, {employeeData.popia.gps_longitude}
                              </p>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Declaration Text</p>
                          <p className="text-sm bg-muted p-4 rounded-lg whitespace-pre-wrap">
                            {employeeData.popia.declaration_text}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No POPIA declaration on record</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="polygraph" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-green-500" />
                      Polygraph Examinations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeData.examinations.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Examiner</TableHead>
                            <TableHead>Result</TableHead>
                            <TableHead>Report</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {employeeData.examinations.map((exam) => (
                            <TableRow key={exam.id}>
                              <TableCell>
                                {format(new Date(exam.examination_date), "PP")}
                              </TableCell>
                              <TableCell className="capitalize">
                                {exam.examination_type.replace(/_/g, " ")}
                              </TableCell>
                              <TableCell>{exam.examiners?.name || "-"}</TableCell>
                              <TableCell>{getResultBadge(exam.result)}</TableCell>
                              <TableCell>
                                {exam.report_url ? (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a href={exam.report_url} target="_blank" rel="noopener noreferrer">
                                      <FileText className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No polygraph examinations on record</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="risk" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-purple-500" />
                      Risk Assessments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeData.riskAssessments.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>ID Verification</TableHead>
                            <TableHead>Criminal Check</TableHead>
                            <TableHead>Result</TableHead>
                            <TableHead>Report</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {employeeData.riskAssessments.map((assessment) => (
                            <TableRow key={assessment.id}>
                              <TableCell>
                                {format(new Date(assessment.assessment_date), "PP")}
                              </TableCell>
                              <TableCell className="capitalize">{assessment.id_verification_status}</TableCell>
                              <TableCell className="capitalize">{assessment.criminal_check_status}</TableCell>
                              <TableCell>{getResultBadge(assessment.result)}</TableCell>
                              <TableCell>
                                {assessment.report_url ? (
                                  <Button variant="ghost" size="sm" asChild>
                                    <a href={assessment.report_url} target="_blank" rel="noopener noreferrer">
                                      <FileText className="h-4 w-4" />
                                    </a>
                                  </Button>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No risk assessments on record</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
