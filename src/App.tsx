import { lazy as reactLazy, Suspense, ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import ImpersonationBanner from "@/components/shared/ImpersonationBanner";
import ClientFacingIdleGuard from "@/components/shared/ClientFacingIdleGuard";
import PresenceTracker from "@/components/shared/PresenceTracker";

const LAZY_RELOAD_KEY = "app_lazy_chunk_reload_at";

// Safe lazy loader: when a deployment replaces chunks, the dynamic import can
// reject or (after vite:preloadError is prevented) resolve to undefined.
// Reload once to fetch the fresh build instead of crashing with a blank screen.
function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return reactLazy(async () => {
    try {
      const mod = await factory();
      if (mod && mod.default) {
        sessionStorage.removeItem(LAZY_RELOAD_KEY);
        return mod;
      }
      throw new Error("Lazy module resolved without default export");
    } catch (err) {
      const last = Number(sessionStorage.getItem(LAZY_RELOAD_KEY) ?? "0");
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(LAZY_RELOAD_KEY, String(Date.now()));
        try {
          const regs = await navigator.serviceWorker?.getRegistrations();
          await Promise.all((regs ?? []).map((r) => r.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch { /* ignore */ }
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

const Home = lazy(() => import("./pages/Home"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminResetPassword = lazy(() => import("./pages/AdminResetPassword"));
const AdminPortalDashboard = lazy(() => import("./pages/AdminPortalDashboard"));
const PolygraphVetting = lazy(() => import("./pages/PolygraphVetting"));
const ReportsAccounts = lazy(() => import("./pages/ReportsAccounts"));
const ProfileManagement = lazy(() => import("./pages/ProfileManagement"));
const PendingPolygraphReview = lazy(() => import("./pages/PendingPolygraphReview"));
const CanDexPreScreening = lazy(() => import("./pages/CanDexPreScreening"));
const CandexApplication = lazy(() => import("./pages/CandexApplication"));
const ExaminerPortal = lazy(() => import("./pages/ExaminerPortal"));
const ManualRiskAssessments = lazy(() => import("./pages/ManualRiskAssessments"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Install = lazy(() => import("./pages/Install"));

const queryClient = new QueryClient();

const RouteAwareInstallButton = () => {
  const location = useLocation();

  // Hide the install button on the candidate application route, on any URL that
  // carries an invitation token, and on the 404 page (where a candidate with a
  // broken/stale link could otherwise see admin-app prompts).
  const hasToken = new URLSearchParams(location.search).has("token");
  const candidatePaths = ["/candex-apply", "/preapplicheck-apply"];
  if (candidatePaths.includes(location.pathname) || location.pathname === "/privacy-policy" || hasToken) {
    return null;
  }

  return <InstallAppButton />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <RouteAwareInstallButton />
        <ImpersonationBanner />
        <ClientFacingIdleGuard />
        <PresenceTracker />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/reset-password" element={<AdminResetPassword />} />
          <Route path="/admin/portal" element={<AdminPortalDashboard />} />
          <Route path="/admin/polygraph-vetting" element={<PolygraphVetting />} />
          <Route path="/admin/reports-accounts" element={<ReportsAccounts />} />
          <Route path="/admin/profile-management" element={<ProfileManagement />} />
          <Route path="/admin/pending-polygraph-review" element={<PendingPolygraphReview />} />
          <Route path="/admin/candex-pre-screening" element={<CanDexPreScreening />} />
          <Route path="/admin/manual-risk-assessments" element={<ManualRiskAssessments />} />
            <Route path="/preapplicheck-apply" element={<CandexApplication />} />
            <Route path="/candex-apply" element={<CandexApplication />} />
            <Route path="/examiner" element={<ExaminerPortal />} />
            <Route path="/install" element={<Install />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;