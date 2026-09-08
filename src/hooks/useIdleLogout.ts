import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "visibilitychange",
];

/**
 * Signs the current user out after a period of inactivity.
 * Used for client-facing profiles (10 minutes).
 */
export const useIdleLogout = (enabled: boolean, minutes = 10) => {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const logout = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        window.location.href = "/admin/login?timeout=1";
      }
    };

    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void logout(), minutes * 60 * 1000);
    };

    reset();
    ACTIVITY_EVENTS.forEach((ev) =>
      document.addEventListener(ev as string, reset, { passive: true })
    );

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev as string, reset));
    };
  }, [enabled, minutes]);
};

export default useIdleLogout;
