import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InvitationDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitation: {
    id: string;
    employee_id: string;
    email: string;
    token: string;
    otp: string;
    invitation_method: string;
    created_at: string;
    expires_at: string;
    used: boolean;
    used_at?: string;
    employees: {
      employee_number: string;
      id_number: string;
    };
  } | null;
}

const InvitationDetailsDialog = ({
  open,
  onOpenChange,
  invitation,
}: InvitationDetailsDialogProps) => {
  const { toast } = useToast();

  if (!invitation) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  const DetailRow = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => (
    <div className="flex justify-between items-center py-3 border-b last:border-b-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{value}</span>
        {copyable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(value, label)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invitation Details</DialogTitle>
          <DialogDescription>
            View credentials and information for this invitation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-1">
            <DetailRow
              label="Employee Number"
              value={invitation.employees.employee_number}
              copyable
            />
            <DetailRow
              label="ID Number"
              value={invitation.employees.id_number}
              copyable
            />
          </div>

          <div className="bg-primary/5 p-4 rounded-lg space-y-1">
            <DetailRow
              label="Email"
              value={invitation.email}
              copyable
            />
            <DetailRow
              label="OTP"
              value={invitation.otp}
              copyable
            />
          </div>

          <div className="space-y-1">
            <DetailRow
              label="Invitation Method"
              value={invitation.invitation_method.replace("_", " ").toUpperCase()}
            />
            <DetailRow
              label="Status"
              value={invitation.used ? "Used" : new Date(invitation.expires_at) < new Date() ? "Expired" : "Active"}
            />
            <DetailRow
              label="Created"
              value={new Date(invitation.created_at).toLocaleString()}
            />
            {invitation.used && invitation.used_at && (
              <DetailRow
                label="Used At"
                value={new Date(invitation.used_at).toLocaleString()}
              />
            )}
            <DetailRow
              label="Expires"
              value={new Date(invitation.expires_at).toLocaleString()}
            />
          </div>

          <div className="bg-muted/30 p-4 rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">Registration Link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background p-2 rounded border overflow-x-auto">
                {`${window.location.origin}/employee/register?token=${invitation.token}`}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(
                    `${window.location.origin}/employee/register?token=${invitation.token}`,
                    "Registration link"
                  )
                }
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {invitation.used && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> The password used during registration is hashed and cannot be retrieved. Only the OTP and other invitation details are available.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvitationDetailsDialog;
