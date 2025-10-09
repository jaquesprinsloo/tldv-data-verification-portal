import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import EmployeeSubmissionForm from "@/components/employee/EmployeeSubmissionForm";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const EmployeeDashboard = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [isValidToken, setIsValidToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employeeData, setEmployeeData] = useState<any>(null);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("employees")
          .select("*")
          .eq("unique_link_token", token)
          .single();

        if (error || !data) {
          toast({
            title: "Invalid Link",
            description: "This verification link is invalid or has expired.",
            variant: "destructive",
          });
          setIsValidToken(false);
        } else if (data.link_expires_at && new Date(data.link_expires_at) < new Date()) {
          toast({
            title: "Link Expired",
            description: "This verification link has expired. Please contact your administrator.",
            variant: "destructive",
          });
          setIsValidToken(false);
        } else {
          setIsValidToken(true);
          setEmployeeData(data);
        }
      } catch (err) {
        console.error("Error verifying token:", err);
        setIsValidToken(false);
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying your link...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full p-6">
          <div className="flex items-center gap-3 text-destructive mb-4">
            <AlertCircle className="h-8 w-8" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
          </div>
          <p className="text-muted-foreground">
            This verification link is invalid or has expired. Please contact your administrator for a new link.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <EmployeeSubmissionForm employeeData={employeeData} token={token} />
    </div>
  );
};

export default EmployeeDashboard;
