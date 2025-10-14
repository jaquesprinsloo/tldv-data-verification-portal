import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import EmployeeSubmissionForm from "@/components/employee/EmployeeSubmissionForm";
import TLDVHeader from "@/components/employee/TLDVHeader";
import POPIADeclaration from "@/components/employee/POPIADeclaration";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

const EmployeeDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [showPOPIA, setShowPOPIA] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/employee/login");
        } else {
          checkEmployeeAccess(session);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/employee/login");
        setLoading(false);
      } else {
        checkEmployeeAccess(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkEmployeeAccess = async (session: Session) => {
    try {
      // Verify employee exists, is active, and linked to this auth user
      const { data: employeeData, error } = await supabase
        .from("employees")
        .select("id, employment_status")
        .eq("user_id", session.user.id)
        .eq("employment_status", "active")
        .single();

      if (error || !employeeData) {
        await supabase.auth.signOut();
        navigate("/employee/login");
        return;
      }

      setEmployeeId(employeeData.id);

      // Check if POPIA has been accepted
      const { data: popiaData } = await supabase
        .from("popia_acceptances")
        .select("id")
        .eq("employee_id", employeeData.id)
        .maybeSingle();

      if (!popiaData) {
        // POPIA not accepted, show POPIA declaration
        setShowPOPIA(true);
      }

      setIsAuthorized(true);
    } catch (error) {
      await supabase.auth.signOut();
      navigate("/employee/login");
    } finally {
      setLoading(false);
    }
  };

  const handlePOPIAAccept = () => {
    setShowPOPIA(false);
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

  if (showPOPIA && employeeId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <TLDVHeader />
        <div className="container mx-auto px-4 py-8">
          <POPIADeclaration employeeId={employeeId} onAccept={handlePOPIAAccept} />
        </div>
      </div>
    );
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
