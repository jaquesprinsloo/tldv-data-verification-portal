import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProfileManagement as ProfileManagementComponent } from "@/components/admin/ProfileManagement";
import { Button } from "@/components/ui/button";

const ProfileManagement = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "master_admin")
        .single();

      if (!roleData) {
        navigate("/admin/portal");
      }
    };

    checkAuth();
  }, [navigate]);

  return (
    <div>
      <div className="absolute top-4 left-4">
        <Button
          onClick={() => navigate("/admin/portal")}
          variant="outline"
          className="border-red-600 text-white hover:bg-red-600/20"
        >
          ← Back to Portal Selection
        </Button>
      </div>
      <ProfileManagementComponent />
    </div>
  );
};

export default ProfileManagement;
