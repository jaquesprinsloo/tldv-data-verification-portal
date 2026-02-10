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
import PolygraphCandidates from "@/components/admin/polygraph/PolygraphCandidates";
import { User } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileCheck, UserCheck, X } from "lucide-react";

type EmployeeFilterType = "all" | "verified" | "flagged" | "pending";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState("employees");
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilterType>("all");
  const [pendingCandidatesCount, setPendingCandidatesCount] = useState(0);
  const [approvedCandidates, setApprovedCandidates] = useState<any[]>([]);
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [showApprovedAlert, setShowApprovedAlert] = useState(false);
  const [showSubmissionsAlert, setShowSubmissionsAlert] = useState(false);
  const employeeTabRef = useRef<HTMLDivElement>(null);

  // Fetch pending candidates count
  useEffect(() => {
    const fetchPendingCount = async () => {
      const { count } = await supabase
        .from("polygraph_candidates")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review");
      setPendingCandidatesCount(count || 0);
    };
    fetchPendingCount();
  }, [activeTab]);

  // Fetch approved polygraph candidates and pending submissions for notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      // Approved polygraph candidates awaiting acceptance/rejection
      const { data: candidates } = await supabase
        .from("polygraph_candidates")
        .select("first_name, last_name, approved_at")
        .eq("status", "approved")
        .order("approved_at", { ascending: false });

      if (candidates && candidates.length > 0) {
        setApprovedCandidates(candidates);
        setShowApprovedAlert(true);
      }

      // Pending employee submissions for review
      const { data: submissions } = await supabase
        .from("submissions")
        .select("first_name, last_name, submission_timestamp")
        .eq("status", "pending")
        .order("submission_timestamp", { ascending: false });

      if (submissions && submissions.length > 0) {
        setPendingSubmissions(submissions);
        setShowSubmissionsAlert(true);
      }
    };
    fetchNotifications();
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate("/admin/login");
          return;
        }

        // Verify admin or master_admin role
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .in("role", ["admin", "master_admin"]);

        if (roleError || !roleData || roleData.length === 0) {
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
        <StatsOverview onSelectFilter={handleStatClick} activeFilter={employeeFilter} />
        
        {/* Notification Alerts */}
        {showApprovedAlert && approvedCandidates.length > 0 && (
          <Alert className="border-green-600 bg-green-600/10 relative">
            <FileCheck className="h-4 w-4 text-green-600" />
            <button
              onClick={() => setShowApprovedAlert(false)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <AlertTitle className="text-green-600 font-semibold">
              {approvedCandidates.length} Reviewed Polygraph Report{approvedCandidates.length > 1 ? 's' : ''} Uploaded
            </AlertTitle>
            <AlertDescription className="mt-1 text-sm">
              The following reviewed reports have been uploaded and are awaiting your acceptance or rejection:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {approvedCandidates.slice(0, 5).map((c, i) => (
                  <li key={i} className="text-foreground">{c.first_name} {c.last_name}</li>
                ))}
                {approvedCandidates.length > 5 && (
                  <li className="text-muted-foreground">...and {approvedCandidates.length - 5} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {showSubmissionsAlert && pendingSubmissions.length > 0 && (
          <Alert className="border-yellow-600 bg-yellow-600/10 relative">
            <UserCheck className="h-4 w-4 text-yellow-600" />
            <button
              onClick={() => setShowSubmissionsAlert(false)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <AlertTitle className="text-yellow-600 font-semibold">
              {pendingSubmissions.length} Employee{pendingSubmissions.length > 1 ? 's' : ''} Submitted Profile{pendingSubmissions.length > 1 ? 's' : ''} for Review
            </AlertTitle>
            <AlertDescription className="mt-1 text-sm">
              The following employees have submitted their profile details and are awaiting review:
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {pendingSubmissions.slice(0, 5).map((s, i) => (
                  <li key={i} className="text-foreground">{s.first_name} {s.last_name}</li>
                ))}
                {pendingSubmissions.length > 5 && (
                  <li className="text-muted-foreground">...and {pendingSubmissions.length - 5} more</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-5xl grid-cols-6">
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="candidates" className="relative">
              Candidates
              {pendingCandidatesCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingCandidatesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
            <TabsTrigger value="renewals">Renewals</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
          </TabsList>
          
          <TabsContent value="employees" className="mt-4 sm:mt-6" ref={employeeTabRef}>
            <EmployeeManagement filterType={employeeFilter} />
          </TabsContent>
          
          <TabsContent value="candidates" className="mt-4 sm:mt-6">
            <PolygraphCandidates />
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
