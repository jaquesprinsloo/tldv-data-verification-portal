import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CandexApplication = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "ready" | "completed" | "invalid">("loading");
  const [invitation, setInvitation] = useState<any>(null);

  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        setStatus("invalid");
        return;
      }

      // Look up the invitation by token
      const { data, error } = await supabase
        .from("candex_invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        setStatus("invalid");
        return;
      }

      if (data.status === "completed") {
        setStatus("completed");
        setInvitation(data);
        return;
      }

      setInvitation(data);

      // Mark as opened if currently sent
      if (data.status === "sent") {
        await supabase.rpc("mark_candex_invitation_opened", { _token: token });
      }

      setStatus("ready");
    };

    loadInvitation();
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Invalid or Expired Link</h2>
            <p className="text-muted-foreground">This invitation link is no longer valid. Please contact the person who invited you for a new link.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Application Already Completed</h2>
            <p className="text-muted-foreground">You have already completed this pre-screening application. Thank you!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary/5 border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <div className="bg-primary rounded-lg p-2">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold">CanDex Pre-Screening</h1>
            <p className="text-xs text-muted-foreground">Welcome, {invitation?.candidate_name}</p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Pre-Screening Questionnaire</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Please complete the following questionnaire. Your responses will be reviewed by the requesting company.
            </p>
            {/* TODO: Render the actual CanDex template questionnaire here */}
            <p className="text-sm text-muted-foreground text-center py-8">
              Questionnaire content will be rendered here based on the assigned template.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  // Mark invitation as completed
                  const { error } = await supabase
                    .from("candex_invitations")
                    .update({ status: "completed" })
                    .eq("token", token!);
                  
                  if (error) {
                    toast.error("Failed to submit application");
                    return;
                  }

                  // Create the application record
                  await supabase.from("candex_applications").insert({
                    invitation_id: invitation.id,
                    client_id: invitation.client_id,
                    candidate_name: invitation.candidate_name,
                    candidate_email: invitation.candidate_email,
                    candidate_phone: invitation.candidate_phone,
                    candidate_id_number: invitation.candidate_id_number,
                    template_id: invitation.template_id,
                    status: "completed",
                    submitted_at: new Date().toISOString(),
                  });

                  setStatus("completed");
                  toast.success("Application submitted successfully!");
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Submit Application
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CandexApplication;
