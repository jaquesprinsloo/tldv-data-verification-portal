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
    const verifyEmail = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setVerificationStatus("error");
        setMessage("Invalid verification link. No token provided.");
        return;
      }

      try {
        // Update the submission to mark email as verified
        const { data, error } = await supabase
          .from("submissions")
          .update({ 
            email_verified: true,
            verified_at: new Date().toISOString()
          })
          .eq("verification_token", token)
          .gt("verification_token_expires_at", new Date().toISOString())
          .select("employee_number, first_name, last_name")
          .single();

        if (error) {
          console.error("Verification error:", error);
          setVerificationStatus("error");
          setMessage("Verification failed. The link may be invalid or expired.");
          return;
        }

        if (!data) {
          setVerificationStatus("error");
          setMessage("Verification link is invalid or has expired.");
          return;
        }

        setVerificationStatus("success");
        setMessage(`Email verified successfully! Your submission is now complete and awaiting processing.`);
      } catch (error) {
        console.error("Verification error:", error);
        setVerificationStatus("error");
        setMessage("An error occurred during verification. Please try again.");
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-12 pb-12 text-center">
          {verificationStatus === "loading" && (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4">Verifying Your Email</h2>
              <p className="text-muted-foreground">Please wait while we verify your email address...</p>
            </>
          )}

          {verificationStatus === "success" && (
            <>
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4 text-green-600">Email Verified!</h2>
              <p className="text-muted-foreground mb-6">{message}</p>
              <p className="text-sm text-muted-foreground mb-6">
                Your submission is now in the queue for admin review. You will be notified of any status updates.
              </p>
              <Button onClick={() => navigate("/")} className="mt-4">
                Return to Home
              </Button>
            </>
          )}

          {verificationStatus === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4 text-destructive">Verification Failed</h2>
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
