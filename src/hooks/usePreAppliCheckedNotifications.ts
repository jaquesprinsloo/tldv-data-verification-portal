import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_PREFIX = "preappli:lastSeenApprovedAt:";

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

const readLastSeen = (userId: string): string => {
  if (!userId) return new Date(0).toISOString();
  try {
    return localStorage.getItem(getStorageKey(userId)) || new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

const writeLastSeen = (userId: string, iso: string) => {
  if (!userId) return;
  try {
    localStorage.setItem(getStorageKey(userId), iso);
  } catch {
    /* ignore */
  }
};

/**
 * Tracks newly-approved PreAppliCheck applications (status `approved` or `candexed`)
 * since the user last opened the PreAppliChecked tab.
 *
 * - Per-user unread state via localStorage.
 * - Optional realtime toast when a new approval lands while the user is in the app.
 * - `markSeen()` clears the unread count for the current user.
 */
export function usePreAppliCheckedNotifications(
  userId: string | null | undefined,
  options: { showToast?: boolean } = {}
) {
  const { showToast = false } = options;
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeen, setLastSeen] = useState<string>(() => readLastSeen(userId || ""));

  const refetch = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const since = readLastSeen(userId);
    const { count } = await supabase
      .from("candex_applications")
      .select("*", { count: "exact", head: true })
      .in("status", ["approved", "candexed"])
      .is("deleted_at", null)
      .gt("updated_at", since);
    setUnreadCount(count || 0);
  }, [userId]);

  // Initial + dependency-driven refetch
  useEffect(() => {
    if (!userId) return;
    setLastSeen(readLastSeen(userId));
    refetch();
  }, [userId, refetch]);

  // Realtime subscription: any update on candex_applications that flips into
  // approved/candexed should bump the badge and (optionally) toast.
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refetch, showToast]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();
    writeLastSeen(userId, now);
    setLastSeen(now);
    setUnreadCount(0);
  }, [userId]);

  return { unreadCount, markSeen, refetch, lastSeen };
}
