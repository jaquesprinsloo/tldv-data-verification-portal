## Impersonation ("View as") for Master Admins

Adds a master-admin-only ability to open any admin, examiner, or restricted admin's portal and see exactly what they see — same appointments list, same reports, same locked/unlocked tabs, same dashboard badges.

### How it works

1. **Impersonation session** (client-side, per browser tab)
   - Stored in `sessionStorage` under `impersonation_target` = `{ userId, role, fullName, email }`.
   - Only a real master admin can set it; cleared on tab close or "Exit view" click.
   - The master's real Supabase auth session stays intact — RLS still runs as the master, who already has read access to everything. We only swap the **user ID used in query filters and permission checks**, so views scoped by `assigned_examiner_user_id`, `granted_by`, `account_access.user_id`, badge state, etc. render as that person.

2. **New hook `useEffectiveUser()`**
   - Returns `{ id, isImpersonating, realUserId, targetRole, targetName }`.
   - Every place in the app that currently reads `session.user.id` for filtering data or checking role is switched to this hook. RLS-critical writes (uploads, mutations) keep using the real master ID and get tagged with an audit note.

3. **Wired into**
   - `ExaminerPortal.tsx` — role gate accepts master when impersonating an examiner; appointment/candidate queries use the effective ID.
   - `AdminPortalDashboard.tsx` — restricted-access mode, permission checks, dashboard card ordering, badge counts all use the effective ID.
   - `usePermissions.ts` — resolves permissions for the effective user so locked tabs appear exactly as the target sees them.
   - `useBadgeLastSeen.ts` — reads/writes badge state under the effective ID.

4. **UI: "View as" button in Profile Management**
   - New column on the master's Profile Management table with an eye icon → confirmation dialog → activates impersonation and navigates to `/examiner` or `/admin/portal` based on the target's role.
   - Persistent red banner at the top of every page while impersonating: *"Viewing as {name} ({role}) — [Exit view]"*.
   - Exit clears the session and returns to Profile Management.

5. **Audit trail**
   - Every impersonation start/stop writes to `audit_log` with action `IMPERSONATE_START` / `IMPERSONATE_END`, actor = real master ID, target = impersonated user ID.

### What it solves

- Master can open the examiner's portal and immediately see whether an appointment actually reached them.
- Master can open a restricted admin's portal and confirm which tabs are locked and what data they see.
- Master can verify a report shows up in the admin dashboard the same way that admin sees it.

### What it does NOT do

- Not a "login as" — no session swap, no new JWT, no password reset. All actions performed while impersonating are still done by the master account for audit integrity.
- Write actions (uploading reports, deleting records) remain performed by the master; a red confirmation dialog appears if the master tries to submit a mutation while impersonating.

### Files touched

- New: `src/hooks/useEffectiveUser.ts`, `src/components/shared/ImpersonationBanner.tsx`
- Updated: `src/App.tsx` (mount banner), `src/pages/ExaminerPortal.tsx`, `src/pages/AdminPortalDashboard.tsx`, `src/hooks/usePermissions.ts`, `src/hooks/useBadgeLastSeen.ts`, `src/components/admin/ProfileManagement.tsx`
- Migration: none required (uses existing `audit_log` table).

Approve and I'll build it.