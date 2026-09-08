import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo-primary.png";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  // One-time-code sign in (required for client facing profiles)
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  useEffect(() => {
    if (searchParams.get("timeout") === "1") {
      toast({
        title: "Signed out",
        description: "You were signed out after 10 minutes of inactivity. Please sign in again.",
      });
    }
  }, [searchParams, toast]);

  const routeByRole = async (userId: string) => {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "master_admin", "examiner", "client_facing"]);

    const roles = (roleData ?? []).map((r: any) => r.role as string);
    if (roles.length === 0) {
      await supabase.auth.signOut();
      toast({
        title: "Access Denied",
        description: "You do not have access to this portal.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.removeItem("portal_animation_played");
    sessionStorage.removeItem("user_is_master_admin");
    sessionStorage.removeItem("user_display_name");

    toast({ title: "Welcome back!", description: "You have successfully logged in." });

    const isAdmin = roles.includes("admin") || roles.includes("master_admin");
    const isExaminer = roles.includes("examiner");
    if (isExaminer && !isAdmin && !roles.includes("client_facing")) {
      navigate("/examiner");
    } else {
      navigate("/admin/portal");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isOtpMode) {
        if (!otpSent) {
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: `${window.location.origin}/admin/portal`,
            },
          });
          if (error) throw error;
          setOtpSent(true);
          toast({
            title: "Code Sent",
            description: "We emailed a one-time code to your registered address. It expires shortly.",
          });
        } else {
          const { data, error } = await supabase.auth.verifyOtp({
            email,
            token: otpCode.trim(),
            type: "email",
          });
          if (error) throw error;
          if (data.user) await routeByRole(data.user.id);
        }
      } else if (isResetPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/admin/reset-password`,
        });
        if (error) throw error;
        toast({
          title: "Password Reset Email Sent",
          description: "Check your email for the password reset link.",
        });
        setIsResetPassword(false);
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin/portal` },
        });
        if (error) throw error;
        toast({
          title: "Account Created!",
          description: "Please contact your administrator to assign admin privileges.",
        });
        setIsSignUp(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .in("role", ["admin", "master_admin", "examiner", "client_facing"]);

        const roles = (roleData ?? []).map((r: any) => r.role as string);
        const isAdmin = roles.includes("admin") || roles.includes("master_admin");

        // Client facing profiles may only sign in with an emailed one-time code.
        if (roles.includes("client_facing") && !isAdmin) {
          await supabase.auth.signOut();
          setIsOtpMode(true);
          setOtpSent(false);
          setPassword("");
          toast({
            title: "One-time code required",
            description:
              "This profile signs in with a code emailed to the registered address. Tap “Send code”.",
          });
          return;
        }

        if (roles.length === 0) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "You do not have administrator privileges.",
            variant: "destructive",
          });
          return;
        }

        await routeByRole(data.user.id);
      }
    } catch (error: any) {
      toast({
        title: isOtpMode
          ? (otpSent ? "Invalid Code" : "Could Not Send Code")
          : isResetPassword
          ? "Reset Failed"
          : isSignUp
          ? "Sign Up Failed"
          : "Login Failed",
        description: error.message || "Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel = () => {
    if (loading) {
      if (isOtpMode) return otpSent ? "Verifying..." : "Sending code...";
      if (isResetPassword) return "Sending Reset Link...";
      return isSignUp ? "Creating Account..." : "Signing in...";
    }
    if (isOtpMode) return otpSent ? "Verify & Sign In" : "Send code";
    if (isResetPassword) return "Send Reset Link";
    return isSignUp ? "Sign Up" : "Sign In";
  };

  const description = isOtpMode
    ? otpSent
      ? "Enter the one-time code we emailed you"
      : "We'll email a one-time code to your registered address"
    : isResetPassword
    ? "Reset your password"
    : isSignUp
    ? "Create your admin account"
    : "Enter your credentials to access the portal";

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="flex flex-col items-center w-full max-w-md">
        <img src={tldvLogo} alt="TLDV Logo" className="h-32 mb-8 animate-fade-in" />
        <Card
          className={`w-full bg-black border-[3px] border-red-600 transition-all duration-500 ${
            !loading ? 'hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] hover:animate-[pulse-glow_2s_ease-in-out_infinite]' : ''
          }`}
        >
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-white">Admin Portal</CardTitle>
            <CardDescription className="text-gray-300">{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@tldv.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (isOtpMode) setOtpSent(false); }}
                  required
                  disabled={loading}
                  className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500"
                />
              </div>

              {isOtpMode && otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="otp" className="text-white">One-Time Code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500 tracking-widest text-center text-lg"
                  />
                  <p className="text-xs text-gray-400">
                    You can also simply click the sign-in link in the same email.
                  </p>
                </div>
              )}

              {!isOtpMode && !isResetPassword && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                {primaryLabel()}
              </Button>

              {isOtpMode && otpSent && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-white hover:text-red-500"
                  disabled={loading}
                  onClick={() => { setOtpSent(false); setOtpCode(""); }}
                >
                  Send a new code
                </Button>
              )}

              {!isOtpMode && !isResetPassword && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-white hover:text-red-500"
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full text-gray-300 hover:text-red-500"
                onClick={() => {
                  setIsOtpMode(!isOtpMode);
                  setOtpSent(false);
                  setOtpCode("");
                  setIsSignUp(false);
                  setIsResetPassword(false);
                }}
              >
                <MailCheck className="h-4 w-4 mr-2" />
                {isOtpMode ? "Use password instead" : "Sign in with an emailed code"}
              </Button>

              {!isOtpMode && (
                <Button
                  type="button"
                  variant="link"
                  className="w-full text-gray-400 hover:text-red-500"
                  onClick={() => { setIsResetPassword(!isResetPassword); setIsSignUp(false); }}
                >
                  {isResetPassword ? "Back to Sign In" : "Forgot Password?"}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 60px rgba(239, 68, 68, 0.7);
          }
          50% {
            box-shadow: 0 0 80px rgba(239, 68, 68, 0.9), 0 0 120px rgba(239, 68, 68, 0.5);
          }
        }
      `}</style>
    </div>
  );
};

export default AdminLogin;
