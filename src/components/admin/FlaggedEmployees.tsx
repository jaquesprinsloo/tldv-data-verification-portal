import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Mail, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import SubmissionDetailDialog from "./SubmissionDetailDialog";
import InviteEmployeeDialog from "./InviteEmployeeDialog";

const FlaggedEmployees = () => {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; number: string } | null>(null);

  useEffect(() => {
    fetchFlaggedSubmissions();
  }, []);

  const fetchFlaggedSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("flagged", true)
        .order("submission_timestamp", { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (error) {
      console.error("Error fetching flagged submissions:", error);
      toast({
        title: "Error",
        description: "Failed to fetch flagged submissions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = (employeeId: string, employeeNumber: string) => {
    setSelectedEmployee({ id: employeeId, number: employeeNumber });
    setInviteDialogOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-muted-foreground">Loading flagged submissions...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Flagged Employees (Geofence Failed)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Geofence Distance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No flagged submissions found
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell className="font-medium">{submission.employee_number}</TableCell>
                      <TableCell>{submission.first_name} {submission.last_name}</TableCell>
                      <TableCell>{format(new Date(submission.submission_timestamp), "MMM dd, yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">
                          {submission.geofence_distance_meters ? `${Math.round(submission.geofence_distance_meters)}m away` : 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> Flagged
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setSelectedSubmission(submission);
                              setDetailDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSendInvite(submission.employee_id, submission.employee_number)}
                          >
                            <Mail className="h-4 w-4 mr-1" />
                            Reinvite
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SubmissionDetailDialog
        submission={selectedSubmission}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUpdate={fetchFlaggedSubmissions}
      />

      {selectedEmployee && (
        <InviteEmployeeDialog
          employeeId={selectedEmployee.id}
          employeeNumber={selectedEmployee.number}
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
        />
      )}
    </>
  );
};

export default FlaggedEmployees;