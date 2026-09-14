import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

/**
 * Activity trail for client-facing profiles.
 *
 * Every sign in, sign out, search and document download / view is written to
 * `client_facing_audit_log` so the activity of each profile can be produced on
 * request during an audit. Writes are best-effort: a failure here must never
 * block the person from using the portal.
 */
export type ClientAuditEvent =
  | "login"
  | "logout"
  | "search"
  | "account_opened"
  | "download"
  | "view_report"
  | "view_indemnity";

type Meta = Record<string, unknown>;

/** Cached identity so each event does not re-read the profile row. */
let cached: { id: string; email: string; name: string } | null = null;

async function whoAmI() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  if (cached?.id === user.id) return cached;
  let name = "";
  try {
    const { data } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    name = data?.full_name ?? "";
  } catch { /* name is a convenience only */ }
  cached = { id: user.id, email: user.email ?? "", name };
  return cached;
}

/** True when the signed-in profile is a client-facing (view only) profile. */
let cfFlag: { id: string; value: boolean } | null = null;
export async function isClientFacingUser(): Promise<boolean> {
  const me = await whoAmI();
  if (!me) return false;
  if (cfFlag?.id === me.id) return cfFlag.value;
  try {
    const { data } = await sb.from("user_roles").select("role").eq("user_id", me.id);
    const roles = (data ?? []).map((r: any) => String(r.role));
    const value = roles.includes("client_facing") && !roles.includes("master_admin");
    cfFlag = { id: me.id, value };
    return value;
  } catch {
    return false;
  }
}

/** Writes the event only for client-facing profiles (used for sign out). */
export async function logIfClientFacing(
  event: ClientAuditEvent,
  detail?: string,
  metadata: Meta = {},
) {
  if (await isClientFacingUser()) await logClientEvent(event, detail, metadata);
}

export async function logClientEvent(
  event: ClientAuditEvent,
  detail?: string,
  metadata: Meta = {},
): Promise<void> {
  try {
    const me = await whoAmI();
    if (!me) return;
    await sb.from("client_facing_audit_log").insert({
      user_id: me.id,
      user_email: me.email,
      user_name: me.name,
      event_type: event,
      detail: detail ?? null,
      metadata: { ...metadata, at: new Date().toISOString() },
    });
  } catch (e) {
    console.warn("audit trail write failed", e);
  }
}

/**
 * Records the sign in of a client-facing profile once per browser session, so a
 * page reload does not look like a second login.
 */
export async function logClientLogin(userId: string) {
  const key = `cfal_login_${userId}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  cached = null;
  await logClientEvent("login", "Signed in to the Risk Assessments portal", {
    path: window.location.pathname,
  });
}

/** Clears the once-per-session marker so the next sign in is recorded again. */
export function resetClientLoginMarker(userId?: string) {
  if (userId) sessionStorage.removeItem(`cfal_login_${userId}`);
  cached = null;
}

/**
 * Records a search after the person stops typing, keeping one entry per search
 * instead of one per keystroke.
 */
export function makeSearchLogger(where: string, waitMs = 1200) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  return (term: string) => {
    const q = term.trim();
    clearTimeout(timer);
    if (q.length < 2 || q === last) return;
    timer = setTimeout(() => {
      last = q;
      void logClientEvent("search", `Searched ${where} for “${q}”`, { where, term: q });
    }, waitMs);
  };
}
