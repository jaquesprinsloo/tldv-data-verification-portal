import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { History, User, Calendar, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface AuditHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string;
}

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: string;
  changed_at: string;
  old_data: any;
  new_data: any;
  changes_summary: string;
  admin_email?: string;
}

const AuditHistoryDialog = ({ open, onOpenChange, employeeId }: AuditHistoryDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (open) {
      loadAuditHistory();
    }
  }, [open, employeeId]);

  const loadAuditHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100);

      // If employeeId is provided, filter for that specific employee
      if (employeeId) {
        query = query.or(`record_id.eq.${employeeId},table_name.eq.employees`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch admin emails for each log entry
      const logsWithEmails = await Promise.all(
        (data || []).map(async (log) => {
          if (log.changed_by) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', log.changed_by)
              .single();

            return {
              ...log,
              admin_email: userData?.email || 'Unknown Admin',
            };
          }
          return {
            ...log,
            admin_email: 'System',
          };
        })
      );

      setAuditLogs(logsWithEmails);
    } catch (error: any) {
      console.error('Error loading audit history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load audit history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-green-600">Created</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-600">Updated</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-600">Deleted</Badge>;
      default:
        return <Badge>{action}</Badge>;
    }
  };

  const getTableDisplayName = (tableName: string) => {
    const names: Record<string, string> = {
      employees: 'Employee',
      submissions: 'Submission',
      employee_invitations: 'Invitation',
      stores: 'Store',
      employee_store_assignments: 'Store Assignment',
    };
    return names[tableName] || tableName;
  };

  const getChangesDetails = (log: AuditLog) => {
    if (log.action === 'DELETE') {
      return <span className="text-muted-foreground">Record was deleted</span>;
    }

    if (log.action === 'INSERT') {
      return <span className="text-muted-foreground">New record created</span>;
    }

    if (log.action === 'UPDATE' && log.old_data && log.new_data) {
      const changes: string[] = [];
      const oldData = log.old_data;
      const newData = log.new_data;

      // Find what changed
      Object.keys(newData).forEach((key) => {
        if (
          oldData[key] !== newData[key] &&
          key !== 'updated_at' &&
          key !== 'created_at'
        ) {
          changes.push(key);
        }
      });

      if (changes.length === 0) {
        return <span className="text-muted-foreground">No significant changes</span>;
      }

      return (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Fields updated:</span>{' '}
          {changes.map((field, idx) => (
            <span key={field}>
              {field.replace(/_/g, ' ')}
              {idx < changes.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit History
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No audit history found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getActionBadge(log.action)}
                      <span className="font-medium">
                        {getTableDisplayName(log.table_name)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(log.changed_at), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm mb-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Changed by:</span>
                    <span className="font-medium">{log.admin_email}</span>
                  </div>

                  {getChangesDetails(log)}

                  {log.changes_summary && (
                    <div className="mt-2 text-sm text-muted-foreground italic">
                      {log.changes_summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuditHistoryDialog;
