import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Users, MapPin, FileCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminHeader from "@/components/admin/AdminHeader";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const resolvePortalRoute = async (session: Session | null) => {
      if (!isActive) return;

      try {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (!nextUser) {
          setLoading(false);
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", nextUser.id)
          .in("role", ["admin", "master_admin", "examiner"]);

        if (!isActive) return;

        if (roleData && roleData.length > 0) {
          const isExaminer = roleData.every(r => r.role === "examiner");
          navigate(isExaminer ? "/examiner" : "/admin/portal", { replace: true });
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error("Auth error:", error);
        setLoading(false);
      }
    };

    const initializeAuth = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      void resolvePortalRoute(session);
    };

    void initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return;

      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
        return;
      }

      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        setLoading(true);
        void resolvePortalRoute(session);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
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
      <AdminHeader user={user} showUserDetails={false} showMainPortalButton={false} />
      
      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Employee & Data Management System</h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
            Managing & Verifying information made easy
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8 sm:mb-12">
          <Card>
            <CardContent className="pt-4 sm:pt-6 text-center px-2 sm:px-4">
              <ShieldCheck className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-primary mx-auto mb-2 sm:mb-4" />
              <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">Secure Verification</h3>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Information obtained and verified through unique tokens linked to employee numbers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 sm:pt-6 text-center px-2 sm:px-4">
              <MapPin className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-primary mx-auto mb-2 sm:mb-4" />
              <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">Geolocation Verification</h3>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Proof of residence is confirmed with Geolocation when completing submissions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 sm:pt-6 text-center px-2 sm:px-4">
              <FileCheck className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-primary mx-auto mb-2 sm:mb-4" />
              <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">Document Management</h3>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Link Employee documents to the employee profile
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 sm:pt-6 text-center px-2 sm:px-4">
              <Users className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 text-primary mx-auto mb-2 sm:mb-4" />
              <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">{employeeCount}+ Employees</h3>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                Managing employment status & store assignment made easy
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button size="lg" className="text-sm sm:text-base px-4 sm:px-6" onClick={() => navigate("/admin/portal")}>
            <ShieldCheck className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Access Portal
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Home;
