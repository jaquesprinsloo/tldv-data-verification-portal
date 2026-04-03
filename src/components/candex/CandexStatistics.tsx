import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Send, CheckCircle, Clock, BarChart3, AlertTriangle } from "lucide-react";

const CandexStatistics = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["candex-statistics"],
    queryFn: async () => {
      const [clientsRes, invitationsRes, applicationsRes] = await Promise.all([
        supabase.from("candex_clients").select("id", { count: "exact", head: true }),
        supabase.from("candex_invitations").select("id, status"),
        supabase.from("candex_applications").select("id, status, risk_level"),
      ]);

      const invitations = invitationsRes.data || [];
      const applications = applicationsRes.data || [];

      return {
        totalClients: clientsRes.count || 0,
        totalInvitations: invitations.length,
        pendingInvitations: invitations.filter((i) => i.status === "pending").length,
        sentInvitations: invitations.filter((i) => i.status === "sent").length,
        totalApplications: applications.length,
        completedApplications: applications.filter((a) => a.status === "completed").length,
        inProgressApplications: applications.filter((a) => a.status === "in_progress").length,
        highRisk: applications.filter((a) => a.risk_level === "high").length,
        mediumRisk: applications.filter((a) => a.risk_level === "medium").length,
        lowRisk: applications.filter((a) => a.risk_level === "low").length,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2"><div className="h-4 bg-muted rounded w-1/2" /></CardHeader>
            <CardContent><div className="h-8 bg-muted rounded w-1/3" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    { title: "Total Clients", value: stats?.totalClients || 0, icon: Users, color: "text-blue-500" },
    { title: "Invitations Sent", value: stats?.sentInvitations || 0, icon: Send, color: "text-emerald-500" },
    { title: "Pending Invitations", value: stats?.pendingInvitations || 0, icon: Clock, color: "text-amber-500" },
    { title: "Applications Completed", value: stats?.completedApplications || 0, icon: CheckCircle, color: "text-green-500" },
    { title: "Applications In Progress", value: stats?.inProgressApplications || 0, icon: BarChart3, color: "text-purple-500" },
    { title: "High Risk Flagged", value: stats?.highRisk || 0, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats && (stats.completedApplications > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 text-center p-4 rounded-lg bg-green-500/10">
                <div className="text-2xl font-bold text-green-600">{stats.lowRisk}</div>
                <div className="text-sm text-muted-foreground">Low Risk</div>
              </div>
              <div className="flex-1 text-center p-4 rounded-lg bg-amber-500/10">
                <div className="text-2xl font-bold text-amber-600">{stats.mediumRisk}</div>
                <div className="text-sm text-muted-foreground">Medium Risk</div>
              </div>
              <div className="flex-1 text-center p-4 rounded-lg bg-red-500/10">
                <div className="text-2xl font-bold text-red-600">{stats.highRisk}</div>
                <div className="text-sm text-muted-foreground">High Risk</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CandexStatistics;
