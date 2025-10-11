import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EmployeeSubmissionForm from "@/components/employee/EmployeeSubmissionForm";
import TLDVHeader from "@/components/employee/TLDVHeader";
import { Loader2 } from "lucide-react";

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Check if employee credentials are in sessionStorage (OTP-based flow)
      const employeeId = sessionStorage.getItem('employeeId');
      const employeeNumber = sessionStorage.getItem('employeeNumber');
      const idNumber = sessionStorage.getItem('idNumber');
      
      if (!employeeId || !employeeNumber || !idNumber) {
        navigate("/employee/login");
        return;
      }

      // Verify employee exists and is active
      const { data: employeeData, error } = await supabase
        .from("employees")
        .select("id, employment_status")
        .eq("id", employeeId)
        .eq("employee_number", employeeNumber)
        .eq("id_number", idNumber)
        .single();

      if (error || !employeeData || employeeData.employment_status !== 'active') {
        sessionStorage.clear();
        navigate("/employee/login");
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      sessionStorage.clear();
      navigate("/employee/login");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <TLDVHeader />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <EmployeeSubmissionForm />
      </div>
    </div>
  );
};

export default EmployeeDashboard;
