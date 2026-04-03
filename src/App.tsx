import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { InstallAppButton } from "@/components/shared/InstallAppButton";
import Home from "./pages/Home";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeAuth from "./pages/EmployeeAuth";
import EmployeeRegister from "./pages/EmployeeRegister";
import EmployeeLogin from "./pages/EmployeeLogin";
import AdminLogin from "./pages/AdminLogin";
import AdminResetPassword from "./pages/AdminResetPassword";
import AdminPortalDashboard from "./pages/AdminPortalDashboard";
import DataEmployeeManagement from "./pages/DataEmployeeManagement";
import PolygraphVetting from "./pages/PolygraphVetting";
import ReportsAccounts from "./pages/ReportsAccounts";
import ProfileManagement from "./pages/ProfileManagement";
import RequestInboxPage from "./pages/RequestInboxPage";
import PendingPolygraphReview from "./pages/PendingPolygraphReview";
import CanDexPreScreening from "./pages/CanDexPreScreening";
import NotFound from "./pages/NotFound";
import VerifyEmail from "./pages/VerifyEmail";
import Install from "./pages/Install";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <InstallAppButton />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/employee/login" element={<EmployeeLogin />} />
          <Route path="/employee/register" element={<EmployeeRegister />} />
          <Route path="/employee/submit" element={<EmployeeDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/reset-password" element={<AdminResetPassword />} />
          <Route path="/admin/portal" element={<AdminPortalDashboard />} />
          <Route path="/admin/data-employee-management" element={<DataEmployeeManagement />} />
          <Route path="/admin/polygraph-vetting" element={<PolygraphVetting />} />
          <Route path="/admin/reports-accounts" element={<ReportsAccounts />} />
          <Route path="/admin/profile-management" element={<ProfileManagement />} />
          <Route path="/admin/request-inbox" element={<RequestInboxPage />} />
          <Route path="/admin/pending-polygraph-review" element={<PendingPolygraphReview />} />
          <Route path="/admin/candex-pre-screening" element={<CanDexPreScreening />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/install" element={<Install />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
