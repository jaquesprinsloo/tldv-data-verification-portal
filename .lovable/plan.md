
Root cause:
- PreAppliCheck and the debug tool are not globally missing from the app. They are rendered on the Main Portal page (`/admin/portal`) inside `src/pages/AdminPortalDashboard.tsx`.
- After an update or when reopening the app, users can land on `/` instead. The `Home.tsx` page does not redirect signed-in admins to `/admin/portal`, and its “Access Portal” button currently goes to `/admin/data-employee-management` instead of the Main Portal.
- Because of that, users bypass the page that contains the PreAppliCheck card and the bug/diagnostics button, so it looks like they disappeared.
- This is made worse by update/reload timing: after a publish, auth restores asynchronously, and pages using direct one-off auth checks can leave people on the wrong entry screen rather than consistently pushing them back to the portal.

What I would change:
1. Fix the entry path
- Update `src/pages/Home.tsx` so authenticated admin/master admin users are sent straight to `/admin/portal`.
- Change the “Access Portal” button to open `/admin/portal`, not Data & Employee Management.

2. Stabilize post-update auth behavior
- Add an auth-state listener on `Home.tsx` similar to existing patterns elsewhere so the page reacts when the session is restored after refresh/update.
- Keep a loading state until auth + role resolution completes, instead of briefly showing the wrong landing screen.

3. Make the portal the single source of truth
- Treat `AdminPortalDashboard.tsx` as the canonical landing page for admin/master admin.
- Keep PreAppliCheck and the debug tool visible there regardless of granular permission flicker while auth is resolving.

4. Verify related navigation inconsistencies
- Review and correct any outdated back-navigation paths such as the `/admin/dashboard` route reference in `src/pages/PolygraphVetting.tsx`, since the actual portal route is `/admin/portal`.
- Check other pages for buttons that bypass the main portal unintentionally.

Files to update:
- `src/pages/Home.tsx`
- likely `src/pages/PolygraphVetting.tsx`
- possibly any other admin pages with stale dashboard route references

Expected result:
- After updates, hard refreshes, or reopening the PWA/app, admin and master profiles will consistently land in the Main Portal where the PreAppliCheck card and System Diagnostics button live.
- The features will no longer appear to “disappear” just because the app reopened on the wrong route.

Technical details:
```text
Current flow:
login/update/reopen
  -> "/"
  -> Home.tsx
  -> button sends user to data-management page
  -> user never sees AdminPortalDashboard
  -> PreAppliCheck/debug appear missing

Target flow:
login/update/reopen
  -> auth restores
  -> role resolves
  -> "/admin/portal"
  -> AdminPortalDashboard
  -> PreAppliCheck + debug visible
```

Validation after implementation:
- Sign in as master admin and confirm app opens on `/admin/portal`
- Refresh after a publish/update and confirm the same behavior
- Reopen the installed app/PWA and confirm portal still opens first
- Confirm PreAppliCheck card is present
- Confirm bug icon / diagnostics dialog is visible
- Confirm examiner-only profiles still route to `/examiner`
