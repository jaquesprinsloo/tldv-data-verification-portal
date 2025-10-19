import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import TLDVHeader from "@/components/employee/TLDVHeader";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const EmployeeLogin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    employeeNumber: "",
    idNumber: "",
    password: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      if (!formData.employeeNumber || !formData.idNumber || !formData.password) {
        toast.error("Please fill in all fields");
        setLoading(false);
        return;
      }

      // Look up employee to get their email
      const { data: employeeData, error: employeeError } = await supabase
        .from("employees")
        .select("id, user_id, email, employment_status")
        .eq("employee_number", formData.employeeNumber)
        .eq("id_number", formData.idNumber)
        .eq("employment_status", "active")
        .maybeSingle();

      if (employeeError || !employeeData) {
        toast.error("Invalid credentials");
        setLoading(false);
        return;
      }

      // Check if user has completed registration
      if (!employeeData.user_id || !employeeData.email) {
        toast.error("Please complete registration first");
        setLoading(false);
        return;
      }

      // Sign in with email and password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: employeeData.email,
        password: formData.password,
      });

      if (signInError) {
        toast.error("Invalid password");
        setLoading(false);
        return;
      }

      toast.success("Login successful");
      navigate("/employee/submit");
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <TLDVHeader />
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Employee Login</CardTitle>
              <CardDescription>
                Sign in with your employee credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeNumber">Employee Number</Label>
                  <Input
                    id="employeeNumber"
                    name="employeeNumber"
                    value={formData.employeeNumber}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="idNumber">ID Number</Label>
                  <Input
                    id="idNumber"
                    name="idNumber"
                    value={formData.idNumber}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EmployeeLogin;
