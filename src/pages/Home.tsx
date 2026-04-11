import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isActive) return;

      if (!session?.user) {
        navigate("/admin/login", { replace: true });
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "master_admin", "examiner"]);

      if (!isActive) return;

      if (roleData && roleData.length > 0) {
        const isExaminer = roleData.every(r => r.role === "examiner");
        navigate(isExaminer ? "/examiner" : "/admin/portal", { replace: true });
      } else {
        navigate("/admin/login", { replace: true });
      }
    };

    void resolve();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isActive) return;
      if (event === "SIGNED_OUT") {
        navigate("/admin/login", { replace: true });
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    </div>
  );
};

export default Home;
