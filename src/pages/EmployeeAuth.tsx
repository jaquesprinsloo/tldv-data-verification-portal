import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import TLDVHeader from "@/components/employee/TLDVHeader";

const EmployeeAuth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const invitationToken = searchParams.get("token");

  const [signupData, setSignupData] = useState({
    employeeNumber: "",
    idNumber: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/employee/submit");
      }
    });
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

      // Create auth account
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
      }

      toast({
        title: "Account Created",
        description: "You can now log in and submit your verification details",
      });

      // Auto-login after signup
      navigate("/employee/submit");
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });

      if (error) throw error;

      // Verify user has employee record
      const { data: employeeData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", data.user.id)
        .single();

      if (!employeeData) {
        await supabase.auth.signOut();
        toast({
          title: "Access Denied",
          description: "No employee record found for this account",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });

      navigate("/employee/submit");
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <TLDVHeader />
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Employee Portal</CardTitle>
            <CardDescription>
              {invitationToken
                ? "Complete your registration to access the portal"
                : "Sign in or create an account to submit your verification"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={invitationToken ? "signup" : "login"}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      required
                      placeholder="your.email@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        placeholder="Enter your password"
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

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "Signing In..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeAuth;
