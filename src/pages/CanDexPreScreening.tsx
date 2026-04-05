import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Home } from "lucide-react";
import { User } from "@supabase/supabase-js";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";
import preapplicheckShield from "@/assets/preapplicheck-shield.jpg";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import CandexStatistics from "@/components/candex/CandexStatistics";
import CandexBuilder from "@/components/candex/CandexBuilder";
import CandexClients from "@/components/candex/CandexClients";
import CandexClientPortal from "@/components/candex/CandexClientPortal";
import CandexRiskRequests from "@/components/candex/CandexRiskRequests";

const CanDexPreScreening = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);

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
      } catch (error) {
        console.error("Auth error:", error);
        navigate("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

  // Pending risk requests count for badge
  const { data: pendingRiskCount = 0 } = useQuery({
    queryKey: ["candex-pending-risk-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("candex_risk_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"]);
      return count ?? 0;
    },
    enabled: isMasterAdmin,
  });

  // Pending submitted applications count for master admin awareness
  const { data: pendingSubmissionsCount = 0 } = useQuery({
    queryKey: ["candex-pending-submissions-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("candex_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted");
      return count ?? 0;
    },
    enabled: isMasterAdmin,
  });

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
        <div className="flex items-center justify-center mb-6">
          <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-[28rem]" />
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 pb-8">

        {isMasterAdmin ? (
          <Tabs defaultValue="statistics" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 max-w-xl mx-auto">
              <TabsTrigger value="statistics" className="relative">
                Statistics
                {pendingSubmissionsCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                    {pendingSubmissionsCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="risk-requests" className="relative">
                Risk Requests
                {pendingRiskCount > 0 && (
                  <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                    {pendingRiskCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="builder">PreAppliCheck Builder</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
            </TabsList>

            <TabsContent value="statistics">
              <CandexStatistics />
            </TabsContent>

            <TabsContent value="risk-requests">
              <CandexRiskRequests />
            </TabsContent>

            <TabsContent value="builder">
              <CandexBuilder />
            </TabsContent>

            <TabsContent value="clients">
              <CandexClients />
            </TabsContent>
          </Tabs>
        ) : (
          <CandexClientPortal userId={user?.id || ""} />
        )}
      </main>
    </div>
  );
};

export default CanDexPreScreening;
