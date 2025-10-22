import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import tldvLogo from "@/assets/tldv-logo-primary.png";

const AdminResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);

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

      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });

      // Clear the temporary recovery session and go to login
      await supabase.auth.signOut();
      navigate("/admin/login");
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
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="flex flex-col items-center w-full max-w-md">
        <img src={tldvLogo} alt="TLDV Logo" className="h-32 mb-8" />
        <Card className="w-full bg-black border-[3px] border-red-600">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-white">Reset Password</CardTitle>
            <CardDescription className="text-gray-300">
              {canReset
                ? "Enter and confirm your new password"
                : "Open the reset link from your email to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canReset ? (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a new password"
                    className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-white">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500"
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <div className="text-gray-300 text-sm">
                No active reset session was found. Please go back to the login page and click
                <span className="text-white font-semibold"> "Forgot Password?"</span> again to receive a new link.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminResetPassword;
