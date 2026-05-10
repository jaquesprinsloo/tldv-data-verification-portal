import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BADGE_KEY = "preapplichecked-seen-ids";
const STORAGE_PREFIX = "preappli:seenApprovedIds:";

const cacheKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

const readCache = (userId: string): Set<string> => {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
};

const writeCache = (userId: string, ids: Set<string>) => {
  if (!userId) return;
  try {
    const arr = Array.from(ids).slice(-5000);
    localStorage.setItem(cacheKey(userId), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
};

const fetchRemoteIds = async (userId: string): Promise<Set<string>> => {
  const { data } = await supabase
    .from("user_badge_state")
    .select("seen_ids")
    .eq("user_id", userId)
    .eq("badge_key", BADGE_KEY)
    .maybeSingle();
  const raw = (data as any)?.seen_ids;
  if (Array.isArray(raw)) return new Set(raw.filter((v: any) => typeof v === "string"));
  return new Set();
};

const writeRemoteIds = async (userId: string, ids: Set<string>) => {
  const arr = Array.from(ids).slice(-5000);
  await supabase
    .from("user_badge_state")
    .upsert(
      {
        user_id: userId,
        badge_key: BADGE_KEY,
        seen_ids: arr as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,badge_key" }
    );
};

export const markPreAppliCheckedNotificationsSeenForUser = async (
  userId: string | null | undefined
) => {
  if (!userId) return;
  const { data } = await supabase
    .from("candex_applications")
    .select("id")
    .in("status", ["approved", "candexed"])
    .is("deleted_at", null);
  const remote = await fetchRemoteIds(userId);
  const local = readCache(userId);
  const merged = new Set<string>([...remote, ...local]);
  (data || []).forEach((r: any) => r?.id && merged.add(r.id));
  writeCache(userId, merged);
  await writeRemoteIds(userId, merged);
};

/**
 * Tracks newly-approved PreAppliCheck applications since the user last opened
 * the PreAppliChecked tab. State is synced via Supabase so the same admin
 * sees consistent unread counts across browsers/tabs/devices.
 */
export function usePreAppliCheckedNotifications(
  userId: string | null | undefined,
  options: { showToast?: boolean } = {}
) {
  const { showToast = false } = options;
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      seenIdsRef.current = new Set();
      return;
    }
    const [remote, { data }] = await Promise.all([
      fetchRemoteIds(userId),
      supabase
        .from("candex_applications")
        .select("id")
        .in("status", ["approved", "candexed"])
        .is("deleted_at", null),
    ]);
    const local = readCache(userId);
    const merged = new Set<string>([...remote, ...local]);
    if (merged.size !== remote.size) writeCache(userId, merged);
    seenIdsRef.current = merged;
    const rows = (data || []) as { id: string }[];
    setUnreadCount(rows.filter((r) => !merged.has(r.id)).length);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refetch();
  }, [userId, refetch]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`preappli-approvals-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candex_applications" },
        (payload) => {
          const newRow: any = payload.new;
          const oldRow: any = payload.old;
          const becameApproved =
            ["approved", "candexed"].includes(newRow?.status) &&
            !["approved", "candexed"].includes(oldRow?.status);
          if (!becameApproved) return;

          if (showToast) {
            toast.success("New PreAppliChecked application", {
              description: newRow?.candidate_name
                ? `${newRow.candidate_name} has moved to PreAppliChecked.`
                : "An approved application is now available.",
            });
          }
          refetch();
        }
      )
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
          if (row?.badge_key !== BADGE_KEY) return;
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch, showToast]);

  const markSeen = useCallback(async () => {
    await markPreAppliCheckedNotificationsSeenForUser(userId);
    setUnreadCount(0);
  }, [userId]);

  return { unreadCount, markSeen, refetch };
}
