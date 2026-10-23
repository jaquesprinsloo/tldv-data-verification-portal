/** Retire only this app's old shell workers; leave messaging workers alone. */
export async function cleanupAppWorkers() {
  const registrations = await navigator.serviceWorker?.getRegistrations();
  const appRegistrations = (registrations ?? []).filter(registration => {
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    return worker && ["/sw.js", "/service-worker.js"].includes(new URL(worker.scriptURL).pathname);
  });
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.allSettled(keys.filter(name =>
      /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name) &&
      appRegistrations.some(registration => name.endsWith(registration.scope))
    ).map(name => caches.delete(name)));
  }
  await Promise.allSettled(appRegistrations.map(registration => registration.unregister()));
}