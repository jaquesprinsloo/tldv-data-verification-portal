import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

interface BulkEmploymentStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeIds: string[];
  statusType: "employed" | "dismissed" | "retrenched";
  onSuccess: () => void;
}

export function BulkEmploymentStatusDialog({
  open,
  onOpenChange,
  employeeIds,
  statusType,
  onSuccess,
}: BulkEmploymentStatusDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [statusDate, setStatusDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState("");
  const [document, setDocument] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let documentUrl = null;

      // Upload document if provided
      if (document) {
        const fileExt = document.name.split('.').pop();
        const fileName = `bulk_${statusType}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('proof-of-residence')
          .upload(filePath, document);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('proof-of-residence')
          .getPublicUrl(filePath);

        documentUrl = publicUrl;
      }

      // Update all selected employees
      const { error } = await supabase
        .from('employees')
        .update({
          employment_status: statusType as Database['public']['Enums']['employment_status'],
          dismissed_at: statusDate,
          dismissal_reason: reason || null,
          dismissal_document_url: documentUrl,
        })
        .in('id', employeeIds);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `${employeeIds.length} employee(s) marked as ${statusType}.`,
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
            Bulk {statusType.charAt(0).toUpperCase() + statusType.slice(1)} Update
          </DialogTitle>
          <DialogDescription>
            Update {employeeIds.length} employee(s) to {statusType} status
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {statusType === 'dismissed' && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide the reason for dismissal..."
                required
                rows={4}
              />
            </div>
          )}

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
