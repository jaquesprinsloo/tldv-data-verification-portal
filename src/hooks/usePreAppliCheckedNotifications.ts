import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// We track *which* approved application IDs the user has already seen.
// Using IDs (not a timestamp) means once a notification has been cleared,
// later edits to the same row (risk_level updates, etc.) cannot re-trigger
// the badge — only genuinely new approvals will.
const STORAGE_PREFIX = "preappli:seenApprovedIds:";

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

const readSeenIds = (userId: string): Set<string> => {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
};

const writeSeenIds = (userId: string, ids: Set<string>) => {
  if (!userId) return;
  try {
    // Cap to last 5000 ids to keep storage bounded.
    const arr = Array.from(ids).slice(-5000);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(arr));
  } catch {
    /* ignore */
  }
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
  const seen = readSeenIds(userId);
  (data || []).forEach((r: any) => r?.id && seen.add(r.id));
  writeSeenIds(userId, seen);
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

  const refetch = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const seen = readSeenIds(userId);
    const { data } = await supabase
      .from("candex_applications")
      .select("id")
      .in("status", ["approved", "candexed"])
      .is("deleted_at", null);
    const rows = (data || []) as { id: string }[];
    const unread = rows.filter((r) => !seen.has(r.id)).length;
    setUnreadCount(unread);
  }, [userId]);

  // Initial + dependency-driven refetch
  useEffect(() => {
    if (!userId) return;
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

  const markSeen = useCallback(async () => {
    await markPreAppliCheckedNotificationsSeenForUser(userId);
    setUnreadCount(0);
  }, [userId]);

  return { unreadCount, markSeen, refetch };
}
