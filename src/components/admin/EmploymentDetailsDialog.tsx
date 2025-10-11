import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, Calendar, FileText, Users, Building2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmploymentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeDetails: {
    designation: string | null;
    employment_status: string;
    dismissed_at: string | null;
    dismissal_reason: string | null;
    dismissal_document_url: string | null;
    store: { store_name: string; store_code: string } | null;
  } | null;
}

interface AssignedStore {
  id: string;
  store_name: string;
  store_code: string;
}

interface StoreEmployee {
  employee_number: string;
  id_number: string;
  first_name: string;
  last_name: string;
}

const getEmploymentStatusBadge = (status: string) => {
  const statusMap: Record<string, { variant: any; label: string }> = {
    active: { variant: "success", label: "Active" },
    employed: { variant: "success", label: "Employed" },
    dismissed: { variant: "destructive", label: "Dismissed" },
    retrenched: { variant: "warning", label: "Retrenched" },
    resigned: { variant: "secondary", label: "Resigned" },
    suspended: { variant: "outline", label: "Suspended" },
  };
  
  const config = statusMap[status] || { variant: "default", label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
};

export function EmploymentDetailsDialog({
  open,
  onOpenChange,
  employeeId,
  employeeDetails,
}: EmploymentDetailsDialogProps) {
  const [assignedStores, setAssignedStores] = useState<AssignedStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [storeEmployees, setStoreEmployees] = useState<StoreEmployee[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const isFdoOrTeamLeader = employeeDetails?.designation === 'fdo' || employeeDetails?.designation === 'team_leader';

  useEffect(() => {
    if (open && isFdoOrTeamLeader) {
      fetchAssignedStores();
    }
  }, [open, employeeId, isFdoOrTeamLeader]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchStoreEmployees(selectedStoreId);
    } else {
      setStoreEmployees([]);
    }
  }, [selectedStoreId]);

  const fetchAssignedStores = async () => {
    setLoadingStores(true);
    try {
      const { data, error } = await supabase
        .from('employee_store_assignments')
        .select('store_id, stores(id, store_name, store_code)')
        .eq('employee_id', employeeId);

      if (error) throw error;

      const stores = data
        ?.map(item => item.stores as unknown as AssignedStore)
        .filter(Boolean) || [];
      
      setAssignedStores(stores);
    } catch (error) {
      console.error('Error fetching assigned stores:', error);
    } finally {
      setLoadingStores(false);
    }
  };

  const fetchStoreEmployees = async (storeId: string) => {
    setLoadingEmployees(true);
    try {
      // Get employees from primary store assignment
      const { data: primaryEmployees, error: primaryError } = await supabase
        .from('employees')
        .select('id, employee_number, id_number')
        .eq('store_id', storeId);

      if (primaryError) throw primaryError;

      // Get employees from multi-store assignments
      const { data: multiStoreData, error: multiError } = await supabase
        .from('employee_store_assignments')
        .select('employee_id, employees(id, employee_number, id_number)')
        .eq('store_id', storeId);

      if (multiError) throw multiError;

      const multiStoreEmployees = multiStoreData
        ?.map(item => item.employees)
        .filter(Boolean) || [];

      // Combine and deduplicate
      const allEmployeeIds = new Set();
      const combinedEmployees = [...(primaryEmployees || []), ...multiStoreEmployees]
        .filter(emp => {
          if (allEmployeeIds.has(emp.id)) return false;
          allEmployeeIds.add(emp.id);
          return true;
        });

      // Get submission data for names
      const { data: submissions } = await supabase
        .from('submissions')
        .select('employee_id, first_name, last_name')
        .in('employee_id', combinedEmployees.map(e => e.id));

      const employeesWithNames = combinedEmployees.map(emp => {
        const submission = submissions?.find(s => s.employee_id === emp.id);
        return {
          employee_number: emp.employee_number,
          id_number: emp.id_number,
          first_name: submission?.first_name || 'N/A',
          last_name: submission?.last_name || 'N/A',
        };
      });

      setStoreEmployees(employeesWithNames);
    } catch (error) {
      console.error('Error fetching store employees:', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  if (!employeeDetails) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Employment Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employment Status */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Employment Status</span>
              {getEmploymentStatusBadge(employeeDetails.employment_status)}
            </div>
          </div>

          {/* Designation */}
          {employeeDetails.designation && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Designation</span>
              </div>
              <p className="font-medium capitalize">
                {employeeDetails.designation.replace(/_/g, ' ')}
              </p>
            </div>
          )}

          {/* Primary Store Assignment */}
          {employeeDetails.store && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Primary Store</span>
              </div>
              <p className="font-medium">
                {employeeDetails.store.store_name} ({employeeDetails.store.store_code})
              </p>
            </div>
          )}

          {/* Multi-Store Assignments for FDO/Team Leaders */}
          {isFdoOrTeamLeader && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Assigned Stores</span>
              </div>
              
              {loadingStores ? (
                <p className="text-sm text-muted-foreground">Loading stores...</p>
              ) : assignedStores.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {assignedStores.map(store => (
                      <Badge key={store.id} variant="secondary">
                        {store.store_name} ({store.store_code})
                      </Badge>
                    ))}
                  </div>

                  {/* Store Filter for viewing employees */}
                  <div className="pt-3 border-t space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">View Employees by Store</span>
                    </div>
                    <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a store to view employees" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignedStores.map(store => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.store_name} ({store.store_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Employees Table */}
                    {selectedStoreId && (
                      <div className="border rounded-md">
                        {loadingEmployees ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            Loading employees...
                          </div>
                        ) : storeEmployees.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Employee #</TableHead>
                                <TableHead>ID Number</TableHead>
                                <TableHead>First Name</TableHead>
                                <TableHead>Last Name</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {storeEmployees.map((emp, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{emp.employee_number}</TableCell>
                                  <TableCell>{emp.id_number}</TableCell>
                                  <TableCell>{emp.first_name}</TableCell>
                                  <TableCell>{emp.last_name}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No employees assigned to this store
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No additional stores assigned</p>
              )}
            </div>
          )}

          {/* Dismissal/Retrenchment Details */}
          {employeeDetails.dismissed_at && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {employeeDetails.employment_status === 'dismissed' ? 'Dismissal' : 'Retrenchment'} Date
                </span>
              </div>
              <p className="font-medium">{format(new Date(employeeDetails.dismissed_at), 'PPP')}</p>
              
              {employeeDetails.dismissal_reason && (
                <div className="pt-2 border-t">
                  <span className="text-sm font-medium text-muted-foreground">Reason</span>
                  <p className="mt-1 text-sm">{employeeDetails.dismissal_reason}</p>
                </div>
              )}
              
              {employeeDetails.dismissal_document_url && (
                <div className="pt-2 border-t">
                  <a 
                    href={employeeDetails.dismissal_document_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    View Supporting Document
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
