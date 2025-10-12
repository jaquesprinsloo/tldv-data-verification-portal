import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import tldvLogo from "@/assets/tldv-logo-primary.png";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up flow
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin/portal`
          }
        });

        if (error) throw error;

        toast({
          title: "Account Created!",
          description: "Please contact your administrator to assign admin privileges.",
        });
        setIsSignUp(false);
      } else {
        // Login flow
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Check if user has admin or master_admin role
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .in("role", ["admin", "master_admin"]);

        if (roleError || !roleData || roleData.length === 0) {
          await supabase.auth.signOut();
          toast({
            title: "Access Denied",
            description: "You do not have administrator privileges.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Welcome back!",
          description: "You have successfully logged in.",
        });
        navigate("/admin/portal");
      }
    } catch (error: any) {
      toast({
        title: isSignUp ? "Sign Up Failed" : "Login Failed",
        description: error.message || "Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="flex flex-col items-center w-full max-w-md">
        <img 
          src={tldvLogo} 
          alt="TLDV Logo" 
          className="h-32 mb-8 animate-fade-in"
        />
        <Card 
          className={`w-full bg-black border-[3px] border-red-600 transition-all duration-500 ${
            !loading ? 'hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] hover:animate-[pulse-glow_2s_ease-in-out_infinite]' : ''
          }`}
        >
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-white">Admin Portal</CardTitle>
            <CardDescription className="text-gray-300">
              {isSignUp ? "Create your admin account" : "Enter your credentials to access the portal"}
            </CardDescription>
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-black/50 border-red-600/50 text-white placeholder:text-gray-500 focus:border-red-500"
                />
              </div>
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
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={loading}>
                {loading ? (isSignUp ? "Creating Account..." : "Signing in...") : (isSignUp ? "Sign Up" : "Sign In")}
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-white hover:text-red-500" 
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
              </Button>
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
