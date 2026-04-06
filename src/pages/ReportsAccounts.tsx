import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import AdminHeader from "@/components/admin/AdminHeader";
import PolygraphReportsSection from "@/components/reports/PolygraphReportsSection";

type UserRole = "admin" | "master_admin";

const ReportsAccounts = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("admin");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      setUser(session.user);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "master_admin"]);

      if (!roleData || roleData.length === 0) {
        await supabase.auth.signOut();
        navigate("/admin/login");
        return;
      }

      const isMasterAdmin = roleData.some(r => r.role === "master_admin");
      setUserRole(isMasterAdmin ? "master_admin" : "admin");
    };

    checkAuth();
  }, [navigate]);

  const isMasterAdmin = userRole === "master_admin";

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Polygraph Reports Portal" />
      <main className="container mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4 md:py-6">
        <PolygraphReportsSection canEdit={isMasterAdmin} />
      </main>
    </div>
  );
};

export default ReportsAccounts;
