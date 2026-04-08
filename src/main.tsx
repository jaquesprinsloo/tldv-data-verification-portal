import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const STALE_CLIENT_RECOVERY_KEY = "app_stale_client_recovery_at";

const unregisterServiceWorkers = async () => {
  const registrations = await navigator.serviceWorker?.getRegistrations();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
};

const clearAppCaches = async () => {
  if (!("caches" in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
};

const recoverFromStaleClient = async () => {
  const lastRecoveryAt = Number(sessionStorage.getItem(STALE_CLIENT_RECOVERY_KEY) ?? "0");

  if (Date.now() - lastRecoveryAt < 15000) {
    return;
  }

  sessionStorage.setItem(STALE_CLIENT_RECOVERY_KEY, String(Date.now()));
  await Promise.all([unregisterServiceWorkers(), clearAppCaches()]);
  window.location.reload();
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  void recoverFromStaleClient();
});

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const isCandidateRoute = window.location.pathname === "/candex-apply";

if (isPreviewHost || isInIframe || isCandidateRoute) {
  void unregisterServiceWorkers();
} else {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      void registration?.update();
    },
  });

  window.addEventListener("focus", () => {
    void navigator.serviceWorker?.ready
      .then((registration) => registration.update())
      .catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
