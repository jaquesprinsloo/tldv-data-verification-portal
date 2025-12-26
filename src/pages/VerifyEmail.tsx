import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleRequest = async () => {
      const token = searchParams.get("token");
      const action = searchParams.get("action");
      const employeeId = searchParams.get("employeeId");

      // Handle renewal request
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
          setMessage("Failed to submit renewal request. Please try again or contact support.");
        }
        return;
      }

      // Handle email verification
      if (!token) {
        setVerificationStatus("error");
        setMessage("Invalid verification link. No token provided.");
        return;
      }

      try {
        // Call edge function to verify email (bypasses RLS for anonymous users)
        const { data, error } = await supabase.functions.invoke('verify-email-token', {
          body: { token },
        });

        if (error) {
          console.error("Edge function error:", error);
          setVerificationStatus("error");
          setMessage("An error occurred during verification. Please try again.");
          return;
        }

        if (!data.success) {
          setVerificationStatus("error");
          setMessage(data.message || "Invalid or expired verification link.");
          return;
        }

        setVerificationStatus("success");
        setMessage(data.message);
        
        // Redirect to home after 3 seconds (unless already verified)
        if (!data.alreadyVerified) {
          setTimeout(() => {
            navigate("/");
          }, 3000);
        }
      } catch (error) {
        console.error("Verification error:", error);
        setVerificationStatus("error");
        setMessage("An error occurred during verification. Please try again.");
      }
    };

    handleRequest();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
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
              <h2 className="text-2xl font-bold mb-4 text-green-600">Success!</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              {searchParams.get("action") !== "renewal-request" && (
                <p className="text-sm text-muted-foreground mb-6">
                  Redirecting you to the homepage in 3 seconds...
                </p>
              )}
              <Button onClick={() => navigate("/")} className="mt-4">
                Return to Home
              </Button>
            </>
          )}

          {verificationStatus === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4 text-destructive">Request Failed</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <Button onClick={() => navigate("/")} variant="outline" className="mt-4">
                Return to Home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
