import { supabase } from "@/integrations/supabase/client";
import { beginSignOut } from "./signOutFlow";

export const SIGN_OUT_PENDING = "tldv_sign_out_pending";

export function signOutImmediately() {
  return beginSignOut({
    clearLocalSession: () => {
      // A durable intent also prevents restoration if the window closes mid-request.
      localStorage.setItem(SIGN_OUT_PENDING, "1");
      const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0];
      const key = `sb-${project}-auth-token`;
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}-code-verifier`);
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("cfal_login_") || ["portal_animation_played", "examiner_animation_played", "user_is_master_admin", "user_display_name"].includes(key)) {
          sessionStorage.removeItem(key);
        }
      }
    },
    revokeSession: () => supabase.auth.signOut({ scope: "local" }),
  });
}