import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import Home from "./pages/Home";
import AdminLogin from "./pages/AdminLogin";
import AdminResetPassword from "./pages/AdminResetPassword";
import AdminPortalDashboard from "./pages/AdminPortalDashboard";
import PolygraphVetting from "./pages/PolygraphVetting";
import ReportsAccounts from "./pages/ReportsAccounts";
import ProfileManagement from "./pages/ProfileManagement";
import PendingPolygraphReview from "./pages/PendingPolygraphReview";
import CanDexPreScreening from "./pages/CanDexPreScreening";
import CandexApplication from "./pages/CandexApplication";
import ExaminerPortal from "./pages/ExaminerPortal";
import NotFound from "./pages/NotFound";
import Install from "./pages/Install";

const queryClient = new QueryClient();

const RouteAwareInstallButton = () => {
  const location = useLocation();

  if (location.pathname === "/candex-apply") {
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
          <Route path="/candex-apply" element={<CandexApplication />} />
          <Route path="/examiner" element={<ExaminerPortal />} />
          <Route path="/install" element={<Install />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;