import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Users } from "lucide-react";
import { format } from "date-fns";

interface RenewalRequest {
  id: string;
  employee_id: string;
  requested_at: string;
  status: string;
  requested_via: string;
  employee: {
    employee_number: string;
    id_number: string;
    last_submission_date: string | null;
  };
}

export default function RenewalRequests() {
  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendingIndividual, setSendingIndividual] = useState<string | null>(null);

  useEffect(() => {
    fetchRenewalRequests();
  }, []);

  const fetchRenewalRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('renewal_requests')
        .select(`
          *,
          employee:employees!inner(
            employee_number,
            id_number,
            last_submission_date
          )
        `)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching renewal requests:', error);
      toast({
        title: "Error",
        description: "Failed to load renewal requests.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendInvitation = async (employeeId: string, requestId: string) => {
    try {
      // Get employee details
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .select('employee_number, id_number')
        .eq('id', employeeId)
        .single();

      if (employeeError) throw employeeError;

      // Get associated submission for email
      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .select('email')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (submissionError) throw submissionError;

      // Generate new invitation token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

      // Create invitation
      const { error: inviteError } = await supabase
        .from('employee_invitations')
        .insert({
          employee_id: employeeId,
          email: submission.email,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (inviteError) throw inviteError;

      // Send invitation email
      const invitationLink = `${window.location.origin}/employee/login?token=${token}`;
      
      await supabase.functions.invoke('send-invitation-email', {
        body: {
          email: submission.email,
          employeeNumber: employee.employee_number,
          invitationLink,
        },
      });

      // Mark request as sent
      const { error: updateError } = await supabase
        .from('renewal_requests')
        .update({
          status: 'sent',
          processed_at: new Date().toISOString(),
          processed_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      toast({
        title: "Invitation Sent",
        description: "Renewal invitation has been sent successfully.",
      });

      fetchRenewalRequests();
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast({
        title: "Error",
        description: "Failed to send invitation. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendIndividual = async (employeeId: string, requestId: string) => {
    setSendingIndividual(requestId);
    await sendInvitation(employeeId, requestId);
    setSendingIndividual(null);
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    
    for (const request of requests) {
      await sendInvitation(request.employee_id, request.id);
    }
    
    setSendingAll(false);
    
    toast({
      title: "All Invitations Sent",
      description: `Successfully sent ${requests.length} renewal invitations.`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Renewal Requests</CardTitle>
              <CardDescription>
                Employees who have requested renewal submission invitations
              </CardDescription>
            </div>
            {requests.length > 0 && (
              <Button onClick={handleSendAll} disabled={sendingAll}>
                {sendingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending All...
                  </>
                ) : (
                  <>
                    <Users className="mr-2 h-4 w-4" />
                    Send to All ({requests.length})
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending renewal requests at this time.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Number</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Last Submission</TableHead>
                  <TableHead>Requested At</TableHead>
                  <TableHead>Via</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {request.employee.employee_number}
                    </TableCell>
                    <TableCell>{request.employee.id_number}</TableCell>
                    <TableCell>
                      {request.employee.last_submission_date
                        ? format(new Date(request.employee.last_submission_date), 'PPP')
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(request.requested_at), 'PPp')}
                    </TableCell>
                    <TableCell className="capitalize">
                      {request.requested_via.replace('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{request.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleSendIndividual(request.employee_id, request.id)}
                        disabled={sendingIndividual === request.id}
                      >
                        {sendingIndividual === request.id ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-3 w-3" />
                            Send Invite
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
