import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Copy, Loader2 } from "lucide-react";

interface InviteEmployeeDialogProps {
  employeeId: string;
  employeeNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InviteEmployeeDialog = ({ employeeId, employeeNumber, open, onOpenChange }: InviteEmployeeDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [invitationLink, setInvitationLink] = useState("");

  const generateInvitation = async () => {
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Generate unique token
      const token = crypto.randomUUID();

      // Create invitation
      const { error: insertError } = await supabase.from("employee_invitations").insert({
        employee_id: employeeId,
        token: token,
        email: email,
      });

      if (insertError) throw insertError;

      // Generate invitation link
      const link = `${window.location.origin}/employee/login?token=${token}`;
      setInvitationLink(link);

      // Send invitation email
      const { error: emailError } = await supabase.functions.invoke("send-invitation-email", {
        body: {
          email: email,
          employeeNumber: employeeNumber,
          invitationLink: link,
        },
      });

      if (emailError) {
        console.error("Failed to send email:", emailError);
        toast({
          title: "Invitation Created",
          description: "Link generated but email failed to send. Please share the link manually.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Invitation Sent",
          description: "Invitation email sent successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Create Invitation",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(invitationLink);
    toast({
      title: "Link Copied",
      description: "Invitation link copied to clipboard",
    });
  };

  const handleClose = () => {
    setEmail("");
    setInvitationLink("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Employee to Portal</DialogTitle>
          <DialogDescription>
            Send an invitation to employee #{employeeNumber} to create an account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Employee Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="employee@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || !!invitationLink}
            />
          </div>

          {invitationLink && (
            <div className="space-y-2">
              <Label>Invitation Link</Label>
              <div className="flex gap-2">
                <Input value={invitationLink} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link expires in 7 days. Share it securely with the employee.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!invitationLink ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={generateInvitation} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" />
                Generate Invitation
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteEmployeeDialog;
