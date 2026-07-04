import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const STALE_CLIENT_RECOVERY_KEY = "app_stale_client_recovery_at";

const CHUNK_LOAD_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i;

const unregisterServiceWorkers = async () => {
  const registrations = await navigator.serviceWorker?.getRegistrations();
  await Promise.all((registrations ?? []).map((registration) => registration.unregister()));
};

const clearAppCaches = async () => {
  if (!("caches" in window)) return;

  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
};

const isChunkLoadError = (value: unknown) => {
  const message =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : typeof (value as { message?: unknown })?.message === "string"
          ? String((value as { message: string }).message)
          : "";

  return CHUNK_LOAD_ERROR_PATTERN.test(message);
};

const recoverFromStaleClient = async () => {
  const lastRecoveryAt = Number(sessionStorage.getItem(STALE_CLIENT_RECOVERY_KEY) ?? "0");

  if (Date.now() - lastRecoveryAt < 15000) {
    return;
  }

  sessionStorage.setItem(STALE_CLIENT_RECOVERY_KEY, String(Date.now()));
  await Promise.all([unregisterServiceWorkers(), clearAppCaches()]);
  window.location.replace(`${window.location.origin}/`);
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  void recoverFromStaleClient();
});

window.addEventListener("error", (event) => {
  if (isChunkLoadError(event.error ?? event.message)) {
    event.preventDefault();
    void recoverFromStaleClient();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    void recoverFromStaleClient();
  }
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

const isCandidateRoute =
  window.location.pathname === "/candex-apply" ||
  window.location.pathname === "/preapplicheck-apply";

const isPrivacyPolicyRoute = window.location.pathname === "/privacy-policy";

if (isPreviewHost || isInIframe || isCandidateRoute || isPrivacyPolicyRoute) {
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

// Candidates completing the PreAppliCheck should never see any browser-level
// "install app" prompt (mini-infobar, address-bar icon prompt, etc.). Suppress
// the event on candidate routes and on any URL that carries an invitation
// token, regardless of whether the InstallAppButton component is mounted.
if (
  isCandidateRoute ||
  isPrivacyPolicyRoute ||
  new URLSearchParams(window.location.search).has("token")
) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
