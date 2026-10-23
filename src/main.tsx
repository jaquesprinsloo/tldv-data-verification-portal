import { createRoot } from "react-dom/client";
import { cleanupAppWorkers } from "./lib/appWorkerCleanup";
import { supabase } from "./integrations/supabase/client";
import { SIGN_OUT_PENDING, signOutImmediately } from "./lib/portalSignOut";
import App from "./App.tsx";
import "./index.css";

const STALE_CLIENT_RECOVERY_KEY = "app_stale_client_recovery_at";

const CHUNK_LOAD_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\d]+ failed/i;

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
  await cleanupAppWorkers();
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

const isCandidateRoute =
  window.location.pathname === "/candex-apply" ||
  window.location.pathname === "/preapplicheck-apply";

const isPrivacyPolicyRoute = window.location.pathname === "/privacy-policy";

// Keep the installed icon, but retire stale app-shell caching.
void cleanupAppWorkers();

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

async function startApp() {
  if (localStorage.getItem(SIGN_OUT_PENDING)) {
    const result = await signOutImmediately();
    if (result.error) {
      const root = document.getElementById("root");
      if (root) root.textContent = "You are signed out. Reconnect and reopen to sign in.";
      return;
    }
    localStorage.removeItem(SIGN_OUT_PENDING);
  }
  window.addEventListener("storage", event => {
    if (event.key === SIGN_OUT_PENDING && event.newValue === "1") {
      void supabase.auth.signOut({ scope: "local" }).finally(() => window.location.replace("/admin/login"));
    }
  });
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<App />);
}
void startApp();
