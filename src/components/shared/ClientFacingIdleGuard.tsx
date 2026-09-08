import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIdleLogout } from "@/hooks/useIdleLogout";

/**
 * Mounted app-wide. When the signed-in user has the client_facing role
 * (and is not an admin/master admin), their session is closed after
 * 10 minutes of inactivity.
 */
export const ClientFacingIdleGuard = () => {
  const [isClientFacing, setIsClientFacing] = useState(false);

  useEffect(() => {
    let active = true;

    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user) {
        setIsClientFacing(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (!active) return;
      const roles = (data ?? []).map((r: any) => r.role as string);
      setIsClientFacing(
        roles.includes("client_facing") &&
          !roles.includes("admin") &&
          !roles.includes("master_admin")
      );
    };

    void resolve();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setIsClientFacing(false);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") void resolve();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useIdleLogout(isClientFacing, 10);

  return null;
};

export default ClientFacingIdleGuard;
