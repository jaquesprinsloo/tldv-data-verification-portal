import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const PRESENCE_CHANNEL = "app-presence";

export interface PresenceMeta {
  user_id: string;
  email: string;
  name: string;
  role: string;
  route: string;
  online_at: string;
}

/**
 * Module-level store of everyone currently online. There is exactly ONE
 * presence channel per browser tab (opening a second channel on the same topic
 * inside the same Supabase client makes presence state unreliable, which is why
 * viewers read from this store instead of subscribing themselves).
 */
let onlineList: PresenceMeta[] = [];
const listeners = new Set<(users: PresenceMeta[]) => void>();

const publish = (users: PresenceMeta[]) => {
  onlineList = users;
  listeners.forEach((fn) => fn(users));
};

export const getPresenceSnapshot = () => onlineList;

export const subscribePresence = (fn: (users: PresenceMeta[]) => void) => {
  listeners.add(fn);
  fn(onlineList);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Tracks the signed-in user on a shared Realtime presence channel so a master
 * admin can see who is currently online (and which portal page they are on).
 * Mounted once globally so presence survives navigation between portals.
 */
const PresenceTracker = () => {
  const location = useLocation();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const metaRef = useRef<PresenceMeta | null>(null);

  // Join / leave with the auth session
  useEffect(() => {
    let cancelled = false;

    const leave = async () => {
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        metaRef.current = null;
      }
      publish([]);
    };

    const join = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled || channelRef.current) return;

      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("profiles").select("full_name").eq("id", session.user.id).maybeSingle(),
      ]);

      const roles = (roleRows || []).map((r: { role: string }) => r.role);
      const role = roles.includes("master_admin")
        ? "master_admin"
        : roles.includes("admin")
          ? "admin"
          : roles[0] || "user";

      const meta: PresenceMeta = {
        user_id: session.user.id,
        email: session.user.email || "",
        name: profile?.full_name || sessionStorage.getItem("user_display_name") || session.user.email || "Unknown",
        role,
        route: window.location.pathname,
        online_at: new Date().toISOString(),
      };
      metaRef.current = meta;

      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: session.user.id } },
      });
      channelRef.current = channel;

      const sync = () => {
        const state = channel.presenceState<PresenceMeta>();
        const byUser = new Map<string, PresenceMeta>();
        Object.values(state).forEach((entries) => {
          (entries as unknown as PresenceMeta[]).forEach((entry) => {
            if (!entry?.user_id) return;
            const existing = byUser.get(entry.user_id);
            // Keep the earliest sign-in time when the same person has several tabs
            if (!existing || new Date(entry.online_at) < new Date(existing.online_at)) {
              byUser.set(entry.user_id, entry);
            }
          });
        });
        publish([...byUser.values()].sort((a, b) => a.name.localeCompare(b.name)));
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && metaRef.current) {
            await channel.track(metaRef.current);
            sync();
          }
        });
    };

    join();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        leave();
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        join();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      leave();
    };
  }, []);

  // Keep the reported page current as the user moves between portals
  useEffect(() => {
    if (!channelRef.current || !metaRef.current) return;
    const next = { ...metaRef.current, route: location.pathname };
    metaRef.current = next;
    channelRef.current.track(next);
  }, [location.pathname]);

  return null;
};

export default PresenceTracker;
