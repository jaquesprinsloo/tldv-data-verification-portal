import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import TLDVHeader from "@/components/employee/TLDVHeader";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const [verificationStatus, setVerificationStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleRequest = async () => {
      const action = searchParams.get("action");
      const employeeId = searchParams.get("employeeId");

      // Handle renewal request only
      if (action === "renewal-request" && employeeId) {
        try {
          const { error } = await supabase.functions.invoke('request-renewal-invitation', {
            body: { employeeId },
          });

          if (error) throw error;

          setVerificationStatus("success");
          setMessage("Your renewal request has been sent to the admin team. You will receive an invitation email shortly to continue your 6-month verification renewal.");
        } catch (error) {
          console.error("Renewal request error:", error);
          setVerificationStatus("error");
          setMessage("Failed to submit renewal request. Please try again or contact your administrator.");
        }
        return;
      }

      // Any other request - show not available
      setVerificationStatus("error");
      setMessage("This page is not available. Please contact your administrator if you need assistance.");
    };

    handleRequest();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <TLDVHeader />
      <div className="flex items-center justify-center p-4 mt-8">
        <Card className="max-w-md w-full border-0 shadow-none">
          <CardContent className="pt-12 pb-12 text-center">
            {verificationStatus === "loading" && (
              <>
                <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-4">Processing Request</h2>
                <p className="text-muted-foreground">Please wait while we process your request...</p>
              </>
            )}

            {verificationStatus === "success" && (
              <>
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-4 text-green-600">Request Submitted</h2>
                <p className="text-muted-foreground mb-6">{message}</p>
                <p className="text-sm text-muted-foreground">
                  You may now close this page.
                </p>
              </>
            )}

            {verificationStatus === "error" && (
              <>
                <XCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-4 text-destructive">Request Failed</h2>
                <p className="text-muted-foreground mb-6">{message}</p>
                <p className="text-sm text-muted-foreground">
                  You may close this page.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerifyEmail;
