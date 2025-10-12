import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Users, MapPin, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminHeader from "@/components/admin/AdminHeader";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/admin/login");
          return;
        }

        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();

        if (roleError || !roleData) {
          navigate("/admin/login");
          return;
        }

        setUser(user);

        // Fetch employee count
        const { count } = await supabase
          .from("employees")
          .select("*", { count: "exact", head: true })
          .eq("employment_status", "active");

        setEmployeeCount(count || 0);
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} />
      
      <main className="container mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Employee & Data Management System</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Managing & Verifying information made easy
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card>
            <CardContent className="pt-6 text-center">
              <ShieldCheck className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Secure Verification</h3>
              <p className="text-sm text-muted-foreground">
                Information obtained and verified through unique tokens linked to employee numbers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Geolocation Verification</h3>
              <p className="text-sm text-muted-foreground">
                Proof of residence is confirmed with Geolocation when completing submissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <FileCheck className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Document Management</h3>
              <p className="text-sm text-muted-foreground">
                Link Employee documents to the employee profile
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <Users className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">{employeeCount}+ Employees</h3>
              <p className="text-sm text-muted-foreground">
                Managing employment status & store assignment made easy
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button size="lg" onClick={() => navigate("/admin/data-employee-management")}>
            <ShieldCheck className="mr-2 h-5 w-5" />
            Access Portal
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Home;
