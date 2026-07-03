import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ImpersonationTarget {
  userId: string;
  role: "admin" | "master_admin" | "examiner";
  fullName: string;
  email: string;
  startedAt: string;
}

const STORAGE_KEY = "impersonation_target";
const EVENT = "impersonation:changed";

export const readImpersonation = (): ImpersonationTarget | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationTarget) : null;
  } catch {
    return null;
  }
};

const emitChange = () => {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* noop */
  }
};

/**
 * Start impersonating a target user. Callable only by a real master admin.
 * Writes to sessionStorage (per-tab), fires an event so listeners update,
 * and logs the action to audit_log.
 */
export const startImpersonation = async (target: ImpersonationTarget) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  emitChange();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_log").insert({
        table_name: "impersonation",
        record_id: target.userId,
        action: "IMPERSONATE_START",
        changed_by: user.id,
        new_data: target as any,
        changes_summary: `Master admin ${user.email} began viewing as ${target.fullName} (${target.role})`,
      } as any);
    }
  } catch (err) {
    console.error("Failed to log impersonation start:", err);
  }
};

export const stopImpersonation = async () => {
  const current = readImpersonation();
  sessionStorage.removeItem(STORAGE_KEY);
  emitChange();

  if (!current) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_log").insert({
        table_name: "impersonation",
        record_id: current.userId,
        action: "IMPERSONATE_END",
        changed_by: user.id,
        old_data: current as any,
        changes_summary: `Master admin ${user.email} stopped viewing as ${current.fullName}`,
      } as any);
    }
  } catch (err) {
    console.error("Failed to log impersonation end:", err);
  }
};

/** Reactive hook that returns the current impersonation target (or null). */
export const useImpersonation = (): ImpersonationTarget | null => {
  const [target, setTarget] = useState<ImpersonationTarget | null>(() => readImpersonation());

  useEffect(() => {
    const sync = () => setTarget(readImpersonation());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return target;
};

/**
 * Returns the ID to use for data filters / permission checks.
 * When impersonating, returns the target's ID; otherwise the real ID.
 */
export const useEffectiveUserId = (realUserId: string | null | undefined): string => {
  const target = useImpersonation();
  return target?.userId || realUserId || "";
};
