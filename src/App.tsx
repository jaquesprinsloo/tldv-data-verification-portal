import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import ImpersonationBanner from "@/components/shared/ImpersonationBanner";

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
  if (candidatePaths.includes(location.pathname) || hasToken) {
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