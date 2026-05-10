import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Home, ChevronDown } from "lucide-react";
import { User } from "@supabase/supabase-js";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";
import preapplicheckShield from "@/assets/preapplicheck-shield.jpg";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { markPreAppliCheckedNotificationsSeenForUser } from "@/hooks/usePreAppliCheckedNotifications";
import { useBadgeLastSeen } from "@/hooks/useBadgeLastSeen";
import CandexStatistics from "@/components/candex/CandexStatistics";
import CandexBuilder from "@/components/candex/CandexBuilder";
import CandexClients from "@/components/candex/CandexClients";
import CandexClientPortal from "@/components/candex/CandexClientPortal";
import CandexRiskRequests from "@/components/candex/CandexRiskRequests";
import PolygraphAppointments from "@/components/admin/PolygraphAppointments";
import POPIAIndemnityEditor from "@/components/candex/POPIAIndemnityEditor";

const CanDexPreScreening = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("statistics");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate("/admin/login");
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .in("role", ["admin", "master_admin"]);

        if (!roleData || roleData.length === 0) {
          navigate("/admin/login");
          return;
        }

        const isMaster = roleData.some(r => r.role === "master_admin");
        setIsMasterAdmin(isMaster);
        setUser(session.user);
        await markPreAppliCheckedNotificationsSeenForUser(session.user.id);
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  // Per-user "last seen" trackers — badges only count rows that arrived
  // since the admin last opened the corresponding sub-tab. Once a tab is
  // viewed it clears immediately and won't return unless new rows appear.
  const userId = user?.id || "";
  const { lastSeen: riskLastSeen, markSeen: markRiskSeen } =
    useBadgeLastSeen(userId, "candex-risk-requests");
  const { lastSeen: apptLastSeen, markSeen: markApptSeen } =
    useBadgeLastSeen(userId, "candex-appointments");
  const { lastSeen: subLastSeen, markSeen: markSubmissionsSeen } =
    useBadgeLastSeen(userId, "candex-submissions");

  const { data: pendingRiskCount = 0 } = useQuery({
    queryKey: ["candex-pending-risk-count", riskLastSeen],
    queryFn: async () => {
      const { count } = await supabase
        .from("candex_risk_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"])
        .gt("created_at", riskLastSeen);
      return count ?? 0;
    },
    enabled: isMasterAdmin && !!userId,
  });

  const { data: pendingAppointmentCount = 0 } = useQuery({
    queryKey: ["candex-pending-appointment-count", apptLastSeen],
    queryFn: async () => {
      const { count } = await supabase
        .from("polygraph_appointments" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "requested")
        .gt("created_at", apptLastSeen);
      return count ?? 0;
    },
    enabled: isMasterAdmin && !!userId,
  });

  const { data: pendingSubmissionsCount = 0 } = useQuery({
    queryKey: ["candex-pending-submissions-count", subLastSeen],
    queryFn: async () => {
      const { count } = await supabase
        .from("candex_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted")
        .gt("submitted_at", subLastSeen);
      return count ?? 0;
    },
    enabled: isMasterAdmin && !!userId,
  });

  // Clear the relevant badge as soon as the admin opens that tab.
  const handleTabChange = (next: string) => {
    setActiveTab(next);
    if (next === "risk-requests") markRiskSeen();
    else if (next === "appointments") markApptSeen();
    else if (next === "statistics") markSubmissionsSeen();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {isMasterAdmin && (
        <div className="container mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-start justify-between mb-4">
            <button
              onClick={() => navigate("/admin/portal")}
              className="bg-white border-[3px] border-red-600 text-foreground px-6 py-2 rounded-lg hover:border-red-500 hover:shadow-[0_0_60px_rgba(239,68,68,0.7)] transition-all duration-500 flex items-center gap-2 font-medium"
            >
              <Home className="h-4 w-4" />
              Main Portal
            </button>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 sm:px-6 pb-8">

        {isMasterAdmin ? (
          <div className="space-y-6">
            {/* Mobile: Dropdown selector */}
            <div className="sm:hidden">
              <select
                value={activeTab}
                onChange={(e) => handleTabChange(e.target.value)}
                className="w-full border border-border rounded-lg px-4 py-3 bg-background text-foreground text-sm font-medium text-center appearance-none"
                style={{ backgroundImage: 'none' }}
              >
                <option value="statistics">
                  Statistics {pendingSubmissionsCount > 0 ? `(${pendingSubmissionsCount})` : ''}
                </option>
                <option value="risk-requests">
                  Risk Requests {pendingRiskCount > 0 ? `(${pendingRiskCount})` : ''}
                </option>
                <option value="appointments">
                  Appointments {pendingAppointmentCount > 0 ? `(${pendingAppointmentCount})` : ''}
                </option>
                <option value="builder">Builder</option>
                <option value="popia">POPIA & Indemnity</option>
                <option value="clients">Clients</option>
              </select>
            </div>

            {/* Desktop: Regular tabs */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              <TabsList className="hidden sm:grid w-full grid-cols-6 max-w-3xl mx-auto">
                <TabsTrigger value="statistics" className="relative text-xs">
                  Statistics
                  {pendingSubmissionsCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {pendingSubmissionsCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="risk-requests" className="relative text-xs">
                  Risk Requests
                  {pendingRiskCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {pendingRiskCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="appointments" className="relative text-xs">
                  Appointments
                  {pendingAppointmentCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {pendingAppointmentCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="builder" className="text-xs">Builder</TabsTrigger>
                <TabsTrigger value="popia" className="text-xs">POPIA & Indemnity</TabsTrigger>
                <TabsTrigger value="clients" className="text-xs">Clients</TabsTrigger>
              </TabsList>

              <TabsContent value="statistics" forceMount className={activeTab !== "statistics" ? "hidden" : ""}>
                <CandexStatistics />
              </TabsContent>
              <TabsContent value="risk-requests" forceMount className={activeTab !== "risk-requests" ? "hidden" : ""}>
                <CandexRiskRequests />
              </TabsContent>
              <TabsContent value="appointments" forceMount className={activeTab !== "appointments" ? "hidden" : ""}>
                <PolygraphAppointments />
              </TabsContent>
              <TabsContent value="builder" forceMount className={activeTab !== "builder" ? "hidden" : ""}>
                <CandexBuilder />
              </TabsContent>
              <TabsContent value="popia" forceMount className={activeTab !== "popia" ? "hidden" : ""}>
                <POPIAIndemnityEditor />
              </TabsContent>
              <TabsContent value="clients" forceMount className={activeTab !== "clients" ? "hidden" : ""}>
                <CandexClients />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <CandexClientPortal userId={user?.id || ""} />
        )}
      </main>
    </div>
  );
};

export default CanDexPreScreening;
