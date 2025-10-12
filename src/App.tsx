import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeAuth from "./pages/EmployeeAuth";
import EmployeeRegister from "./pages/EmployeeRegister";
import AdminLogin from "./pages/AdminLogin";
import AdminPortalDashboard from "./pages/AdminPortalDashboard";
import DataEmployeeManagement from "./pages/DataEmployeeManagement";
import PolygraphVetting from "./pages/PolygraphVetting";
import ReportsAccounts from "./pages/ReportsAccounts";
import NotFound from "./pages/NotFound";
import VerifyEmail from "./pages/VerifyEmail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/employee/login" element={<EmployeeAuth />} />
          <Route path="/employee/register" element={<EmployeeRegister />} />
          <Route path="/employee/submit" element={<EmployeeDashboard />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/portal" element={<AdminPortalDashboard />} />
          <Route path="/admin/data-employee-management" element={<DataEmployeeManagement />} />
          <Route path="/admin/polygraph-vetting" element={<PolygraphVetting />} />
          <Route path="/admin/reports-accounts" element={<ReportsAccounts />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
