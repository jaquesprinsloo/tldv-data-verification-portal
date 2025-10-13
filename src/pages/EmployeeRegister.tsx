import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import TLDVHeader from "@/components/employee/TLDVHeader";
import POPIADeclaration from "@/components/employee/POPIADeclaration";

const EmployeeRegister = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [step, setStep] = useState<'register' | 'popia'>('register');
  const [employeeId, setEmployeeId] = useState<string>("");
  const [invitationMethod, setInvitationMethod] = useState<string>("email");
  
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
    otp: "",
  });

  const token = searchParams.get("token");

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        toast({
          title: "Invalid Link",
          description: "This invitation link is invalid",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // Fetch invitation method from the invitation
      try {
        const { data, error } = await supabase
          .from("employee_invitations")
          .select("invitation_method")
          .eq("token", token)
          .maybeSingle();

        if (!error && data) {
          setInvitationMethod(data.invitation_method || "email");
        }
      } catch (error) {
        console.error("Error fetching invitation method:", error);
      }

      setValidatingToken(false);
    };

    validateToken();
  }, [token, navigate, toast]);

  const getOTPHelperText = () => {
    switch (invitationMethod) {
      case "whatsapp":
        return "Enter the 6-digit OTP sent to you via WhatsApp";
      case "qr_coupon":
        return "Enter the 6-digit OTP from your QR code coupon";
      case "email":
      default:
        return "Enter the 6-digit OTP from your email";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.employeeNumber || !formData.idNumber || !formData.otp) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (formData.otp.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "OTP must be 6 digits",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Use the database function to validate everything at once
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_invitation_token', {
          _token: token,
          _employee_number: formData.employeeNumber,
          _id_number: formData.idNumber,
          _otp: formData.otp
        })
        .single();

      if (validationError || !validationResult || !validationResult.is_valid) {
        throw new Error("Invalid invitation link, OTP, or employee credentials");
      }

      const employeeId = validationResult.employee_id;

      // Check if POPIA already accepted
      const { data: popiaData } = await supabase
        .from("popia_acceptances")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle();

      if (popiaData) {
        // POPIA already accepted, go directly to submission
        sessionStorage.setItem("employee_id", employeeId);
        sessionStorage.setItem("employee_number", formData.employeeNumber);
        sessionStorage.setItem("id_number", formData.idNumber);
        navigate("/employee/submit");
      } else {
        // Show POPIA declaration
        setEmployeeId(employeeId);
        setStep('popia');
      }

    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Invalid credentials or invitation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePOPIAAccept = () => {
    // Store credentials in sessionStorage
    sessionStorage.setItem("employee_id", employeeId);
    sessionStorage.setItem("employee_number", formData.employeeNumber);
    sessionStorage.setItem("id_number", formData.idNumber);
    navigate("/employee/submit");
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (step === 'popia' && employeeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <TLDVHeader />
        <div className="container mx-auto px-4 py-8">
          <POPIADeclaration employeeId={employeeId} onAccept={handlePOPIAAccept} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/tldv-logo.png" alt="TLDV Logo" className="h-16 mx-auto mb-4" />
          <CardTitle className="text-2xl">Employee Registration</CardTitle>
          <CardDescription>
            Enter your details and the OTP sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">Employee Number</Label>
              <Input
                id="employeeNumber"
                name="employeeNumber"
                type="text"
                required
                value={formData.employeeNumber}
                onChange={handleInputChange}
                placeholder="Enter your employee number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="idNumber">ID Number</Label>
              <Input
                id="idNumber"
                name="idNumber"
                type="text"
                required
                value={formData.idNumber}
                onChange={handleInputChange}
                placeholder="Enter your ID number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">6-Digit OTP</Label>
              <Input
                id="otp"
                name="otp"
                type="text"
                required
                maxLength={6}
                value={formData.otp}
                onChange={handleInputChange}
                placeholder="Enter the 6-digit OTP"
                className="font-mono text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                {getOTPHelperText()}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue to Portal
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeRegister;
