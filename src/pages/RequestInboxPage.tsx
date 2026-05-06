import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import AdminHeader from "@/components/admin/AdminHeader";
import { RequestInbox } from "@/components/admin/RequestInbox";
import { markBadgeLastSeenForUser } from "@/hooks/useBadgeLastSeen";

const RequestInboxPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      setUser(session.user);
      markBadgeLastSeenForUser(session.user.id, "request-inbox");

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
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} title="Request Inbox Portal" />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <RequestInbox />
      </main>
    </div>
  );
};

export default RequestInboxPage;
