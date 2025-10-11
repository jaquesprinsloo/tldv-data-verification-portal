import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";

interface EmploymentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeDetails: {
    designation: string | null;
    employment_status: string;
    dismissed_at: string | null;
    dismissal_reason: string | null;
    dismissal_document_url: string | null;
    store: { store_name: string; store_code: string } | null;
  } | null;
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
  employeeDetails,
}: EmploymentDetailsDialogProps) {
  if (!employeeDetails) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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

          {/* Store Assignment */}
          {employeeDetails.store && (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Store Assignment</span>
              </div>
              <p className="font-medium">
                {employeeDetails.store.store_name} ({employeeDetails.store.store_code})
              </p>
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
