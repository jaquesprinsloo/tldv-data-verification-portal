import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import POPIADeclaration from "@/components/employee/POPIADeclaration";

const EmployeeRegister = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [step, setStep] = useState<'register' | 'popia'>('register');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
    otp: ""
  });

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      toast({
        title: "Invalid Link",
        description: "This invitation link is invalid. Please contact your administrator.",
        variant: "destructive"
      });
      navigate('/');
      return;
    }
    
    // Validate token exists and is not expired
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_invitations')
        .select('id, employee_id, used, expires_at')
        .eq('token', token)
        .single();

      if (error || !data) {
        toast({
          title: "Invalid Invitation",
          description: "This invitation link is invalid or has expired.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      if (data.used) {
        toast({
          title: "Invitation Already Used",
          description: "This invitation has already been used.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        toast({
          title: "Invitation Expired",
          description: "This invitation has expired. Please request a new one.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      setValidatingToken(false);
    } catch (error) {
      console.error('Error validating token:', error);
      navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate OTP and credentials
      const { data: invitationData, error: invitationError } = await supabase
        .from('employee_invitations')
        .select('id, employee_id, otp')
        .eq('token', token)
        .eq('otp', formData.otp)
        .single();

      if (invitationError || !invitationData) {
        toast({
          title: "Invalid OTP",
          description: "The OTP you entered is incorrect.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Validate employee credentials
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('id, employee_number, id_number')
        .eq('id', invitationData.employee_id)
        .eq('employee_number', formData.employeeNumber)
        .eq('id_number', formData.idNumber)
        .single();

      if (employeeError || !employeeData) {
        toast({
          title: "Invalid Credentials",
          description: "The employee number or ID number is incorrect.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Mark invitation as used
      const { error: updateError } = await supabase
        .from('employee_invitations')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('id', invitationData.id);

      if (updateError) {
        console.error('Error marking invitation as used:', updateError);
        toast({
          title: "Error",
          description: "An error occurred. Please try again.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Store employee credentials in sessionStorage for the submission form
      sessionStorage.setItem('employeeNumber', formData.employeeNumber);
      sessionStorage.setItem('employeeId', employeeData.id);
      sessionStorage.setItem('idNumber', formData.idNumber);

      setEmployeeId(employeeData.id);
      setStep('popia');
      
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePOPIAAccept = () => {
    navigate('/employee/submit');
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (step === 'popia' && employeeId) {
    return <POPIADeclaration employeeId={employeeId} onAccept={handlePOPIAAccept} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/tldv-logo.png" alt="TLDV Logo" className="h-16" />
          </div>
          <CardTitle className="text-2xl">Employee Registration</CardTitle>
          <CardDescription>
            Enter your details and the OTP sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employeeNumber">Employee Number</Label>
              <Input
                id="employeeNumber"
                type="text"
                value={formData.employeeNumber}
                onChange={(e) => setFormData({ ...formData, employeeNumber: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="idNumber">ID Number</Label>
              <Input
                id="idNumber"
                type="text"
                value={formData.idNumber}
                onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="otp">6-Digit OTP</Label>
              <Input
                id="otp"
                type="text"
                maxLength={6}
                pattern="[0-9]{6}"
                value={formData.otp}
                onChange={(e) => setFormData({ ...formData, otp: e.target.value.replace(/\D/g, '') })}
                placeholder="Enter 6-digit code"
                required
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                Check your email for the 6-digit verification code
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeRegister;
