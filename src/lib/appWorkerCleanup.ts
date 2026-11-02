const APP_WORKER_PATHS = ["/sw.js", "/service-worker.js"];

/** Remove only this app's shell workers and caches; leave messaging workers alone. */
export async function cleanupAppWorkers() {
  const registrations = await navigator.serviceWorker?.getRegistrations();
  const appRegistrations = (registrations ?? []).filter(registration => {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    return worker && APP_WORKER_PATHS.includes(new URL(worker.scriptURL).pathname);
  });
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.allSettled(keys.filter(name =>
      /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|^app-/.test(name) &&
      appRegistrations.some(registration => name.endsWith(registration.scope) || name.startsWith("app-"))
    ).map(name => caches.delete(name)));
  }
  await Promise.allSettled(appRegistrations.map(registration => registration.unregister()));
}

const PREVIEW_HOST_SUFFIXES = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];

export function isOfflineShellAllowed(): boolean {
  if (!import.meta.env.PROD) return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  const host = window.location.hostname.toLowerCase();
  const label = host.split(".")[0];
  if (PREVIEW_HOST_SUFFIXES.some(s => host.endsWith(s))) {
    if (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label)) return false;
    if (/^project--.+-dev$/.test(label)) return false;
  }
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (host === d || host.endsWith(`.${d}`)) return false;
  }
  return true;
}

/** Single registrar for the offline app shell (examiners need the app to open with no signal). */
export async function registerAppWorker() {
  if (!isOfflineShellAllowed()) {
    await cleanupAppWorkers().catch(() => {});
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* offline shell is best-effort */
  }
}
