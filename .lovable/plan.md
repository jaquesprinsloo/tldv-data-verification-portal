# Restore offline start-up for examiner reports

## Problem (confirmed)
When the old app cache was retired to fix stale screens and auto sign-in, nothing replaced it. Examiner drafts are still saved on the device, but the app itself can no longer open with no signal, so examiners at a venue cannot reach them.

## What changes
- The published app saves its own screens on the device again, so it opens with no signal.
- Pages always try the internet first, so a new release still shows straight away when online (no return of stale screens).
- Sign-in pages and session data are never cached, so sign-out still requires a fresh OTP.
- Examiner drafts on the device are untouched.
- The editor preview never uses offline mode; it works only in the published/installed app.

## Technical details
- Re-add `vite-plugin-pwa` (`generateSW`, `registerType: "autoUpdate"`, `injectRegister: null`, `devOptions.enabled: false`, filename `sw.js`) replacing the kill-switch `public/sw.js` (same path, so the new worker supersedes it).
- Navigations: `NetworkFirst` with short network timeout and `index.html` fallback; deny `/~oauth`. Hashed same-origin `/assets/*`: `CacheFirst`. No caching of Supabase/API requests.
- Replace `cleanupAppWorkers()` in `src/main.tsx` with a single guarded registration wrapper: refuse in dev, iframes, Lovable preview hostnames and `?sw=off` (unregistering `/sw.js` there); register otherwise.
- `App.tsx` chunk-failure reload: skip reload when `navigator.onLine === false`, show an offline message instead.
- Update the AGENTS.md installed-app rule and PWA memory (offline shell now allowed, network-first).
- Verify: production build, then Playwright offline mode loads `/examiner` from cache and lists device drafts; confirm sign-out still forces OTP.
