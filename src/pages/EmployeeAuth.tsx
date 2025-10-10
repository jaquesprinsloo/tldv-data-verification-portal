import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TLDVHeader from "@/components/employee/TLDVHeader";
import POPIADeclaration from "@/components/employee/POPIADeclaration";

const EmployeeAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("token");
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'signup' | 'popia'>('signup');
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [signupData, setSignupData] = useState({
    employeeNumber: "",
    idNumber: "",
    email: invitationToken ? "" : "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Check if user has accepted POPIA
        const { data: employee } = await supabase
          .from('employees')
          .select('id')
          .eq('user_id', session.user.id)
          .single();

        if (employee) {
          const { data: popiaAcceptance } = await supabase
            .from('popia_acceptances')
            .select('id')
            .eq('employee_id', employee.id)
            .single();

          if (popiaAcceptance) {
            navigate("/employee/submit");
          } else {
            setStep('popia');
            setEmployeeId(employee.id);
          }
        }
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate passwords match
      if (signupData.password !== signupData.confirmPassword) {
        toast({
          title: "Passwords Don't Match",
          description: "Please ensure both passwords are identical",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Validate password strength
      if (signupData.password.length < 8) {
        toast({
          title: "Weak Password",
          description: "Password must be at least 8 characters long",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If invitation token exists, validate it
      if (invitationToken) {
        const { data: validationData, error: validationError } = await supabase.rpc(
          "validate_invitation_token",
          {
            _token: invitationToken,
            _employee_number: signupData.employeeNumber,
            _id_number: signupData.idNumber,
          }
        );

        if (validationError || !validationData?.[0]?.is_valid) {
          toast({
            title: "Invalid Invitation",
            description: "The invitation link is invalid, expired, or credentials don't match",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Use email from invitation
        signupData.email = validationData[0].email;

        // Mark invitation as used
        await supabase
          .from('employee_invitations')
          .update({ used_at: new Date().toISOString() })
          .eq('token', invitationToken);
      } else {
        // Without invitation, verify employee credentials
        const { data: credentialsData, error: credentialsError } = await supabase.rpc(
          "verify_employee_credentials",
          {
            _employee_number: signupData.employeeNumber,
            _id_number: signupData.idNumber,
          }
        );

        if (credentialsError || !credentialsData?.[0]?.is_valid) {
          toast({
            title: "Invalid Credentials",
            description: "Employee number or ID number not found in the system",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      // Try to create auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/employee/submit`,
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Failed to create account");
      }

      // Link employee to user
      const { data: employeeData } = await supabase.rpc("verify_employee_credentials", {
        _employee_number: signupData.employeeNumber,
        _id_number: signupData.idNumber,
      });

      if (employeeData?.[0]?.employee_id) {
        await supabase.rpc("link_employee_to_user", {
          _employee_id: employeeData[0].employee_id,
          _user_id: authData.user.id,
        });

        // Show POPIA declaration step
        setEmployeeId(employeeData[0].employee_id);
        setStep('popia');
      }

      toast({
        title: "Account Created",
        description: "Please accept the POPIA declaration to continue.",
      });
    } catch (error: any) {
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePOPIAAccept = () => {
    toast({
      title: "POPIA Accepted",
      description: "Proceeding to submission form...",
    });
    
    // Store employee credentials in sessionStorage for form pre-fill
    sessionStorage.setItem('employeeNumber', signupData.employeeNumber);
    sessionStorage.setItem('idNumber', signupData.idNumber);
    
    navigate("/employee/submit");
  };

  if (step === 'popia' && employeeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <TLDVHeader />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <POPIADeclaration employeeId={employeeId} onAccept={handlePOPIAAccept} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <TLDVHeader />
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Employee Registration</CardTitle>
            <CardDescription>
              {invitationToken
                ? "Complete your registration using your invitation link"
                : "Create an account to submit your verification"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-employee-number">Employee Number</Label>
                <Input
                  id="signup-employee-number"
                  value={signupData.employeeNumber}
                  onChange={(e) => setSignupData({ ...signupData, employeeNumber: e.target.value })}
                  required
                  placeholder="Your employee number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-id-number">ID Number</Label>
                <Input
                  id="signup-id-number"
                  value={signupData.idNumber}
                  onChange={(e) => setSignupData({ ...signupData, idNumber: e.target.value })}
                  required
                  placeholder="13-digit ID number"
                  maxLength={13}
                />
              </div>

              {!invitationToken && (
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    required
                    placeholder="your.email@example.com"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    required
                    placeholder="At least 8 characters"
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                <Input
                  id="signup-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={signupData.confirmPassword}
                  onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                  required
                  placeholder="Re-enter your password"
                  minLength={8}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Creating Account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeAuth;
