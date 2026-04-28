import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "badge:lastSeen:";

const getKey = (userId: string, badgeKey: string) =>
  `${STORAGE_PREFIX}${badgeKey}:${userId}`;

const readLastSeen = (userId: string, badgeKey: string): string => {
  if (!userId) return new Date(0).toISOString();
  try {
    return (
      localStorage.getItem(getKey(userId, badgeKey)) ||
      new Date(0).toISOString()
    );
  } catch {
    return new Date(0).toISOString();
  }
};

const writeLastSeen = (userId: string, badgeKey: string, iso: string) => {
  if (!userId) return;
  try {
    localStorage.setItem(getKey(userId, badgeKey), iso);
  } catch {
    /* ignore */
  }
};

/**
 * Per-user "last seen" tracker for dashboard badges.
 *
 * Use the returned `lastSeen` ISO string to filter your count query
 * (e.g. `.gt('created_at', lastSeen)`), and call `markSeen()` when the
 * user opens the corresponding view so the badge clears immediately.
 */
export function useBadgeLastSeen(
  userId: string | null | undefined,
  badgeKey: string
) {
  const [lastSeen, setLastSeen] = useState<string>(() =>
    readLastSeen(userId || "", badgeKey)
  );

  useEffect(() => {
    setLastSeen(readLastSeen(userId || "", badgeKey));
  }, [userId, badgeKey]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();
    writeLastSeen(userId, badgeKey, now);
    setLastSeen(now);
  }, [userId, badgeKey]);

  return { lastSeen, markSeen };
}
