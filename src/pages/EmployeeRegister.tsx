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
import type { Session } from "@supabase/supabase-js";

const EmployeeRegister = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [invitationMethod, setInvitationMethod] = useState<string>("email");
  
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
    otp: "",
    password: "",
    confirmPassword: "",
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
    
    if (!formData.employeeNumber || !formData.idNumber || !formData.otp || !formData.password) {
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

    if (formData.password.length < 6) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Call edge function to handle registration
      const { data, error } = await supabase.functions.invoke('complete-employee-registration', {
        body: {
          token,
          employeeNumber: formData.employeeNumber,
          idNumber: formData.idNumber,
          otp: formData.otp,
          password: formData.password
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { email } = data;

      // If already logged in as this user, skip sign-in
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user?.email === email) {
        toast({
          title: "Registration Successful",
          description: "Welcome! Redirecting to POPIA declaration...",
        });
        navigate("/employee/submit");
        return;
      }

      // Otherwise sign in with the provided credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: formData.password,
      });
      if (signInError) throw signInError;

      // Wait for session to be established
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Failed to establish session");
      }

      toast({
        title: "Registration Successful",
        description: "Welcome! Redirecting to POPIA declaration...",
      });

      // Navigate to submission page (POPIA will be handled there if needed)
      navigate("/employee/submit");

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

  if (validatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Create a secure password"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 6 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Re-enter your password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account & Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeRegister;
