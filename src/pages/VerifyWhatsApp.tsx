import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VerifyWhatsApp = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get("token");
      const submissionId = searchParams.get("submission");

      if (!token || !submissionId) {
        setStatus("error");
        setMessage("Invalid verification link");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('verify-whatsapp-token', {
          body: { 
            token,
            submissionId
          }
        });

        if (error) throw error;

        if (data.success) {
          setStatus("success");
          setMessage(data.message || "Your WhatsApp number has been verified successfully!");
          toast({
            title: "Verification Successful",
            description: "Your contact number has been verified.",
          });
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed");
        }
      } catch (error: any) {
        console.error("Verification error:", error);
        setStatus("error");
        setMessage(error.message || "An error occurred during verification");
        toast({
          title: "Verification Failed",
          description: error.message || "Could not verify your WhatsApp number",
          variant: "destructive",
        });
      }
    };

    verifyToken();
  }, [searchParams, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-2xl text-center">WhatsApp Verification</CardTitle>
          <CardDescription className="text-center">
            {status === "loading" && "Verifying your contact number..."}
            {status === "success" && "Verification Complete"}
            {status === "error" && "Verification Failed"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          {status === "loading" && (
            <Loader2 className="h-16 w-16 text-primary animate-spin" />
          )}
          
          {status === "success" && (
            <>
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-center text-muted-foreground">{message}</p>
              <Button onClick={() => navigate("/")}>Return to Home</Button>
            </>
          )}
          
          {status === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-center text-muted-foreground">{message}</p>
              <Button variant="outline" onClick={() => navigate("/")}>Return to Home</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyWhatsApp;
