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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/employee/login");
        return;
      }

      // Verify user has employee record
      const { data: employeeData, error } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (error || !employeeData) {
        await supabase.auth.signOut();
        navigate("/employee/login");
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
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
