import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminHeader from "@/components/admin/AdminHeader";
import PolygraphHome from "@/components/admin/PolygraphHome";
import PolygraphBookingForm from "@/components/admin/PolygraphBookingForm";
import { User } from "@supabase/supabase-js";

const PolygraphVetting = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPortal, setShowPortal] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/admin/login");
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();

        if (!roleData) {
          await supabase.auth.signOut();
          navigate("/admin/login");
          return;
        }

        setUser(user);
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
      <AdminHeader user={user} title="Polygraph & Vetting Portal" />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Button
          variant="ghost"
          onClick={() => showPortal ? setShowPortal(false) : navigate("/admin/dashboard")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {showPortal ? "Back to Overview" : "Back to Dashboard"}
        </Button>
        
        {!showPortal ? (
          <PolygraphHome onEnterPortal={() => setShowPortal(true)} />
        ) : (
          <PolygraphBookingForm />
        )}
      </main>
    </div>
  );
};

export default PolygraphVetting;
