import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "badge:lastSeen:";
const ZERO = new Date(0).toISOString();

const cacheKey = (userId: string, badgeKey: string) =>
  `${STORAGE_PREFIX}${badgeKey}:${userId}`;

const readCache = (userId: string, badgeKey: string): string => {
  if (!userId) return ZERO;
  try {
    return localStorage.getItem(cacheKey(userId, badgeKey)) || ZERO;
  } catch {
    return ZERO;
  }
};

const writeCache = (userId: string, badgeKey: string, iso: string) => {
  if (!userId) return;
  try {
    localStorage.setItem(cacheKey(userId, badgeKey), iso);
  } catch {
    /* ignore */
  }
};

const fetchRemote = async (userId: string, badgeKey: string): Promise<string | null> => {
  const { data } = await supabase
    .from("user_badge_state")
    .select("last_seen_at")
    .eq("user_id", userId)
    .eq("badge_key", badgeKey)
    .maybeSingle();
  return (data as any)?.last_seen_at ?? null;
};

const writeRemote = async (userId: string, badgeKey: string, iso: string) => {
  await supabase
    .from("user_badge_state")
    .upsert(
      { user_id: userId, badge_key: badgeKey, last_seen_at: iso, updated_at: new Date().toISOString() },
      { onConflict: "user_id,badge_key" }
    );
};

export const markBadgeLastSeenForUser = async (
  userId: string | null | undefined,
  badgeKey: string
) => {
  const now = new Date().toISOString();
  if (!userId) return now;
  writeCache(userId, badgeKey, now);
  await writeRemote(userId, badgeKey, now);
  return now;
};

/**
 * Per-user "last seen" tracker for dashboard badges, synced via Supabase so
 * the same user gets consistent badge state across browsers, tabs, and devices.
 *
 * Returns an ISO string `lastSeen` to filter your count query
 * (e.g. `.gt('created_at', lastSeen)`), and `markSeen()` to clear the badge.
 */
export function useBadgeLastSeen(
  userId: string | null | undefined,
  badgeKey: string
) {
  const [lastSeen, setLastSeen] = useState<string>(() =>
    readCache(userId || "", badgeKey)
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hydrate from DB whenever user/key changes, and subscribe to realtime updates
  // so a "mark seen" on one tab/device clears the badge on the others.
  useEffect(() => {
    if (!userId) {
      setLastSeen(ZERO);
      return;
    }
    setLastSeen(readCache(userId, badgeKey));

    let cancelled = false;
    (async () => {
      const remote = await fetchRemote(userId, badgeKey);
      if (cancelled || !mountedRef.current) return;
      if (remote) {
        writeCache(userId, badgeKey, remote);
        setLastSeen(remote);
      }
    })();

    const channel = supabase
      .channel(`badge-state-${userId}-${badgeKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_badge_state",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (row?.badge_key !== badgeKey) return;
          const next = (payload.new as any)?.last_seen_at;
          if (next) {
            writeCache(userId, badgeKey, next);
            if (mountedRef.current) setLastSeen(next);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, badgeKey]);

  const markSeen = useCallback(async () => {
    const now = new Date().toISOString();
    if (!userId) {
      setLastSeen(now);
      return;
    }
    writeCache(userId, badgeKey, now);
    setLastSeen(now);
    await writeRemote(userId, badgeKey, now);
  }, [userId, badgeKey]);

  return { lastSeen, markSeen };
}
