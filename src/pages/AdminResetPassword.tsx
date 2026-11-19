import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import { signOutImmediately, SIGN_OUT_PENDING } from "@/lib/portalSignOut";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const AdminResetPassword = () => {
  const { toast } = useToast();
  const { isInstalled, isInstallable, installApp } = usePWAInstall();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [complete, setComplete] = useState(false);
  const [installAccepted, setInstallAccepted] = useState(false);

  useEffect(() => {
    // Check if we have a recovery session active
    supabase.auth.getSession().then(({ data }) => {
      setCanReset(!!data.session);
    });

    // Also listen for the recovery event in case the hash is being processed
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setCanReset(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const signOut = signOutImmediately();
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
      void signOut.then(({ error: signOutError }) => {
        if (!signOutError) localStorage.removeItem(SIGN_OUT_PENDING);
      }).catch(() => { /* Startup will finish the pending sign-out. */ });
    } catch (err: any) {
      toast({
        title: "Reset failed",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-svh flex items-center justify-center bg-black p-4 text-foreground">
      <div className="flex flex-col items-center gap-5 w-full max-w-md">
        <img src={tldvLogo} alt="TLDV Logo" className="h-auto w-full max-w-[260px]" />
        <Card className="w-full bg-black border-primary/60">
          <CardHeader className="text-center">
            {complete && <CircleCheck className="mx-auto mb-2 h-9 w-9 text-primary" aria-hidden="true" />}
            <CardTitle className="text-2xl" aria-live="polite">{complete ? "Password updated" : "Reset password"}</CardTitle>
            <CardDescription>
              {complete ? "Your new password has been saved." : canReset
                ? "Enter and confirm your new password"
                : "Open the reset link from your email to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {complete ? (
              <div className="space-y-4 text-center">
                <p className="text-sm leading-6 text-muted-foreground">You can now close this page. Open the TLDV app from your desktop, Start menu, or taskbar, then sign in with your new password.</p>
                {!isInstalled && !installAccepted && (isInstallable ? (
                  <Button className="min-h-11 w-full" onClick={async () => setInstallAccepted(await installApp())}>Install desktop app</Button>
                ) : (
                  <Button asChild variant="outline" className="min-h-11 w-full"><Link to="/install?setup=complete">Install desktop app</Link></Button>
                ))}
              </div>
            ) : canReset ? (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a new password"
                    className="min-h-11 text-base"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="min-h-11 text-base"
                    required
                  />
                </div>
                <Button type="submit" className="min-h-11 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <div className="text-muted-foreground text-sm">
                No active reset session was found. Please go back to the login page and click
                <Link to="/admin/login" className="font-semibold text-foreground underline"> “Forgot Password?”</Link> again to receive a new link.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminResetPassword;
