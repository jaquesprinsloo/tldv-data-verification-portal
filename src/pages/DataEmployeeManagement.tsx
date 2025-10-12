import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AdminHeader from "@/components/admin/AdminHeader";
import SubmissionsTable, { type FilterType } from "@/components/admin/SubmissionsTable";
import StatsOverview from "@/components/admin/StatsOverview";
import EmployeeManagement from "@/components/admin/EmployeeManagement";
import RenewalRequests from "@/components/admin/RenewalRequests";
import InvitationsList from "@/components/admin/InvitationsList";
import FlaggedEmployees from "@/components/admin/FlaggedEmployees";
import { User } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type EmployeeFilterType = "all" | "verified" | "flagged" | "pending";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState("employees");
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilterType>("all");
  const employeeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/admin/login");
          return;
        }

        // Verify admin role
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .single();

        if (roleError || !roleData) {
          toast({
            title: "Access Denied",
            description: "You do not have administrator privileges.",
            variant: "destructive",
          });
          navigate("/admin/login");
          return;
        }

        setUser(user);
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate("/admin/login");
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate, toast]);

  const handleStatClick = (filterType: EmployeeFilterType) => {
    setEmployeeFilter(filterType);
    setActiveTab("employees");
    
    // Scroll to employee tab after a short delay to ensure tab switch completes
    setTimeout(() => {
      employeeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader user={user} />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/portal")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Portal Selection
        </Button>
        <StatsOverview onSelectFilter={handleStatClick} activeFilter={employeeFilter} />
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-5">
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
            <TabsTrigger value="renewals">Renewals</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>
          
          <TabsContent value="employees" className="mt-4 sm:mt-6" ref={employeeTabRef}>
            <EmployeeManagement filterType={employeeFilter} />
          </TabsContent>
          
          <TabsContent value="submissions" className="mt-4 sm:mt-6">
            <SubmissionsTable filterType={filter} onFilterChange={setFilter} />
          </TabsContent>
          
          <TabsContent value="flagged" className="mt-4 sm:mt-6">
            <FlaggedEmployees />
          </TabsContent>
          
          <TabsContent value="renewals" className="mt-4 sm:mt-6">
            <RenewalRequests />
          </TabsContent>
          
          <TabsContent value="invitations" className="mt-4 sm:mt-6">
            <InvitationsList />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
