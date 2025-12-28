import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

interface DismissEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  statusType: "dismissed" | "retrenched" | "suspended" | "resigned" | "employed";
  onSuccess: () => void;
}

export function DismissEmployeeDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  statusType,
  onSuccess,
}: DismissEmployeeDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState<Database['public']['Enums']['employment_status']>(statusType);
  const [statusDate, setStatusDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState<File | null>(null);

  // Statuses that require a reason
  const requiresReason = ['dismissed', 'suspended', 'retrenched'].includes(employmentStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (requiresReason && !reason.trim()) {
      toast({
        title: "Reason Required",
        description: `Please provide a reason for marking the employee as ${employmentStatus}.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let documentUrl = null;

      // Upload document if provided
      if (document) {
        const fileExt = document.name.split('.').pop();
        const fileName = `${employeeId}_${employmentStatus}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('dismissal-documents')
          .upload(filePath, document);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('dismissal-documents')
          .getPublicUrl(filePath);

        documentUrl = publicUrl;
      }

      // Build update data
      const updateData: Record<string, any> = {
        employment_status: employmentStatus,
      };

      if (requiresReason) {
        updateData.dismissed_at = statusDate;
        updateData.dismissal_reason = reason;
        updateData.dismissal_document_url = documentUrl;
      } else {
        // Clear dismissal fields for employed/resigned
        updateData.dismissed_at = null;
        updateData.dismissal_reason = null;
        updateData.dismissal_document_url = null;
      }

      // Update employee status
      const { error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', employeeId);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Employee status has been updated to ${employmentStatus}.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating employee status:', error);
      toast({
        title: "Error",
        description: "Failed to update employee status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Update Employee Status
          </DialogTitle>
          <DialogDescription>
            Update the employment status for {employeeName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employmentStatus">Employment Status</Label>
            <Select 
              value={employmentStatus} 
              onValueChange={(value) => setEmploymentStatus(value as Database['public']['Enums']['employment_status'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employed">Employed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="retrenched">Retrenched</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requiresReason && (
            <>
              <div className="space-y-2">
                <Label htmlFor="statusDate">
                  Date of Status Change
                </Label>
                <Input
                  id="statusDate"
                  type="date"
                  value={statusDate}
                  onChange={(e) => setStatusDate(e.target.value)}
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Provide the reason for ${employmentStatus}...`}
                  required
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">Supporting Document (Optional)</Label>
                <Input
                  id="document"
                  type="file"
                  onChange={(e) => setDocument(e.target.files?.[0] || null)}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
                {document && (
                  <p className="text-sm text-muted-foreground">{document.name}</p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
