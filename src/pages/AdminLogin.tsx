import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logClientLogin } from "@/lib/clientAudit";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { SIGN_OUT_PENDING } from "@/lib/portalSignOut";

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
  const [step, setStep] = useState<"email" | "password" | "code">("email");
  const { isInstalled } = usePWAInstall();
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

    localStorage.removeItem(SIGN_OUT_PENDING);
    sessionStorage.removeItem("portal_animation_played");
    sessionStorage.removeItem("user_is_master_admin");
    sessionStorage.removeItem("user_display_name");

    toast({ title: "Welcome back!", description: "You have successfully logged in." });

    const isAdmin = roles.includes("admin") || roles.includes("master_admin");
    const isExaminer = roles.includes("examiner");
    // Client-facing profiles keep an audit trail of every sign in.
    if (roles.includes("client_facing") && !roles.includes("master_admin")) {
      await logClientLogin(userId);
    }
    if (isExaminer && !isAdmin && !roles.includes("client_facing")) {
      navigate("/examiner");
    } else {
      navigate("/admin/portal");
    }
  };

  const startOver = () => {
    setStep("email");
    setOtpCode("");
    setPassword("");
    setShowPassword(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isResetPassword && !isSignUp && step === "email") {
      setEmail(normalizedEmail);
      setStep("password");
      return;
    }

    setLoading(true);
    try {
      if (isResetPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/admin/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Password reset requested", description: "If the account exists, check your email for a reset link." });
        setIsResetPassword(false);
        startOver();
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin/portal` },
        });
        if (error) throw error;
        toast({ title: "Account created", description: "Please contact your administrator to assign admin privileges." });
        setIsSignUp(false);
        startOver();
      } else if (step === "code") {
        const { data, error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: otpCode.trim(), type: "email" });
        if (error) throw error;
        if (data.user) await routeByRole(data.user.id);
      } else {
        const { data, error } = await supabase.functions.invoke("portal-password-sign-in", {
          body: { email: normalizedEmail, password },
        });
        if (error) throw new Error("Could not complete sign-in. Please try again.");
        if (data?.error) throw new Error(data.error);
        setPassword("");
        setShowPassword(false);
        if (data?.step === "code") {
          setStep("code");
          toast({ title: "Code sent", description: "Check your inbox for your one-time sign-in code." });
        } else if (data?.step === "session" && data.access_token && data.refresh_token) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: data.access_token, refresh_token: data.refresh_token,
          });
          if (sessionError || !sessionData.user) throw new Error("Could not complete sign-in. Please try again.");
          await routeByRole(sessionData.user.id);
        } else {
          throw new Error("Could not complete sign-in. Please try again.");
        }
      }
    } catch (error) {
      toast({
        title: isResetPassword ? "Reset failed" : isSignUp ? "Sign-up failed" : step === "code" ? "Could not verify code" : "Sign-in failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const primaryLabel = isResetPassword ? (loading ? "Sending reset link…" : "Send reset link")
    : isSignUp ? (loading ? "Creating account…" : "Sign up")
    : step === "code" ? (loading ? "Verifying…" : "Verify and sign in")
    : step === "password" ? (loading ? "Checking password…" : "Continue") : "Next";
  const description = isResetPassword ? "Enter your email address to reset your password."
    : isSignUp ? "Create your admin account."
    : step === "code" ? "Enter the one-time code we emailed you."
    : step === "password" ? "Enter your password to continue." : "Enter your email address to continue.";
  const showEmail = step === "email" || isResetPassword || isSignUp;
  const showPasswordField = !isResetPassword && (step === "password" || isSignUp);

  return (
    <main className="dark min-h-svh flex items-center justify-center bg-black px-4 py-6 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-5">
        <img src={tldvLogo} alt="TLDV Logo" className="h-auto w-full max-w-[260px]" />
        <Card className="w-full bg-black border-primary/60">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">TLDV Portal</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {showEmail ? (
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input id="email" type="email" autoComplete="username" placeholder="Enter your email address" maxLength={255}
                    value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} className="min-h-11 text-base" />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-border px-3 py-1">
                  <span className="min-w-0 break-all text-sm">{email}</span>
                  <Button type="button" variant="ghost" className="min-h-11" onClick={startOver} disabled={loading}>Change email</Button>
                </div>
              )}
              {showPasswordField && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input key="password" id="password" autoFocus={step === "password"} type={showPassword ? "text" : "password"}
                      autoComplete={isSignUp ? "new-password" : "current-password"} value={password}
                      onChange={(e) => setPassword(e.target.value)} required disabled={loading} className="min-h-11 pr-12 text-base" />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" disabled={loading}
                      aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
              {step === "code" && (
                <div className="space-y-2">
                  <Label htmlFor="otp">One-Time Code</Label>
                  <Input key="otp" id="otp" inputMode="numeric" autoFocus autoComplete="one-time-code" value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)} required disabled={loading} className="min-h-11 text-center text-base" />
                </div>
              )}
              <Button type="submit" className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={loading}>{primaryLabel}</Button>
              {step === "code" ? (
                <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={loading} onClick={() => { setStep("password"); setOtpCode(""); }}>
                  Request a new code
                </Button>
              ) : !isSignUp && (
                <Button type="button" variant="link" className="min-h-11 w-full text-muted-foreground" disabled={loading} onClick={() => {
                  setIsResetPassword(!isResetPassword); startOver();
                }}>{isResetPassword ? "Back to sign in" : "Forgot Password?"}</Button>
              )}
              {!isResetPassword && (step === "email" || isSignUp) && (
                <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={loading} onClick={() => { setIsSignUp(!isSignUp); startOver(); }}>
                  {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
        {!isInstalled && <Button variant="link" asChild className="min-h-11 text-muted-foreground"><Link to="/install">Install desktop app</Link></Button>}
      </div>
    </main>
  );
};

export default AdminLogin;
