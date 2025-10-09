import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckCircle, AlertTriangle, Clock } from "lucide-react";

type FilterType = "all" | "verified" | "flagged" | "pending";

interface StatsOverviewProps {
  onSelectFilter?: (filter: FilterType) => void;
  activeFilter?: FilterType;
}

const StatsOverview = ({ onSelectFilter, activeFilter = "all" }: StatsOverviewProps) => {
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    flagged: 0,
    pending: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const { data: submissions } = await supabase
        .from("submissions")
        .select("status, flagged");

      if (submissions) {
        setStats({
          total: submissions.length,
          verified: submissions.filter(s => s.status === "verified" || s.status === "approved").length,
          flagged: submissions.filter(s => s.flagged).length,
          pending: submissions.filter(s => s.status === "pending").length,
        });
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card onClick={() => onSelectFilter?.('all')} className="cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent>
      </Card>
      
      <Card onClick={() => onSelectFilter?.('verified')} className="cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Verified</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.verified}</div>
        </CardContent>
      </Card>
      
      <Card onClick={() => onSelectFilter?.('flagged')} className="cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Flagged</CardTitle>
          <AlertTriangle className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.flagged}</div>
        </CardContent>
      </Card>
      
      <Card onClick={() => onSelectFilter?.('pending')} className="cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Pending</CardTitle>
          <Clock className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.pending}</div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsOverview;
