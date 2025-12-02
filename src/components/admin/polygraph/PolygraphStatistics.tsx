import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Users, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface StatisticsData {
  totalReports: number;
  passedCount: number;
  failedCount: number;
  inconclusiveCount: number;
  admissionsByCategory: { category: string; count: number }[];
  reportsOverTime: { month: string; count: number }[];
  drugTypes: { type: string; count: number }[];
  theftValues: { range: string; count: number }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  drug_use: "Drug Use",
  theft_from_work: "Workplace Theft",
  fraud: "Fraud",
  bribery: "Bribery",
  criminal_syndicate: "Criminal Syndicate",
  undetected_crimes: "Undetected Crimes",
  previous_dismissal: "Previous Dismissal",
  gambling_issues: "Gambling Issues",
};

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

const PolygraphStatistics = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("all");
  const [stats, setStats] = useState<StatisticsData>({
    totalReports: 0,
    passedCount: 0,
    failedCount: 0,
    inconclusiveCount: 0,
    admissionsByCategory: [],
    reportsOverTime: [],
    drugTypes: [],
    theftValues: [],
  });

  useEffect(() => {
    fetchStatistics();
  }, [dateRange]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      // Build date filter
      let dateFilter = null;
      const now = new Date();
      if (dateRange === "30days") {
        dateFilter = new Date(now.setDate(now.getDate() - 30)).toISOString();
      } else if (dateRange === "90days") {
        dateFilter = new Date(now.setDate(now.getDate() - 90)).toISOString();
      } else if (dateRange === "year") {
        dateFilter = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString();
      }

      // Fetch reports
      let reportsQuery = supabase
        .from("polygraph_reports")
        .select("id, overall_result, examination_date, status")
        .eq("status", "completed");

      if (dateFilter) {
        reportsQuery = reportsQuery.gte("examination_date", dateFilter);
      }

      const { data: reports } = await reportsQuery;

      // Fetch admissions
      let admissionsQuery = supabase
        .from("polygraph_admissions")
        .select("category, confirmed, details, time_window, report_id")
        .eq("confirmed", true);

      const { data: admissions } = await admissionsQuery;

      // Calculate statistics
      const totalReports = reports?.length || 0;
      const passedCount = reports?.filter((r) => r.overall_result === "passed").length || 0;
      const failedCount = reports?.filter((r) => r.overall_result === "failed").length || 0;
      const inconclusiveCount = reports?.filter((r) => r.overall_result === "inconclusive").length || 0;

      // Admissions by category
      const categoryMap = new Map<string, number>();
      admissions?.forEach((a) => {
        const current = categoryMap.get(a.category) || 0;
        categoryMap.set(a.category, current + 1);
      });
      const admissionsByCategory = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category: CATEGORY_LABELS[category] || category, count }))
        .sort((a, b) => b.count - a.count);

      // Drug types breakdown
      const drugAdmissions = admissions?.filter((a) => a.category === "drug_use") || [];
      const drugMap = new Map<string, number>();
      drugAdmissions.forEach((a) => {
        const details = a.details as { selectedItems?: string[] };
        details?.selectedItems?.forEach((item: string) => {
          const current = drugMap.get(item) || 0;
          drugMap.set(item, current + 1);
        });
      });
      const drugTypes = Array.from(drugMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Reports over time (last 6 months)
      const monthlyMap = new Map<string, number>();
      reports?.forEach((r) => {
        const date = new Date(r.examination_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const current = monthlyMap.get(monthKey) || 0;
        monthlyMap.set(monthKey, current + 1);
      });
      const reportsOverTime = Array.from(monthlyMap.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-6);

      setStats({
        totalReports,
        passedCount,
        failedCount,
        inconclusiveCount,
        admissionsByCategory,
        reportsOverTime,
        drugTypes,
        theftValues: [],
      });
    } catch (error) {
      console.error("Error fetching statistics:", error);
    } finally {
      setLoading(false);
    }
  };

  const resultData = [
    { name: "Passed", value: stats.passedCount, color: "#22c55e" },
    { name: "Failed", value: stats.failedCount, color: "#ef4444" },
    { name: "Inconclusive", value: stats.inconclusiveCount, color: "#eab308" },
  ].filter((d) => d.value > 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Polygraph Statistics</h2>
          <p className="text-muted-foreground">Analytics from completed polygraph examinations</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="90days">Last 90 Days</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalReports}</p>
                <p className="text-sm text-muted-foreground">Total Reports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.passedCount}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-100">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.failedCount}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-100">
                <AlertTriangle className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.inconclusiveCount}</p>
                <p className="text-sm text-muted-foreground">Inconclusive</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Results Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Examination Results</CardTitle>
            <CardDescription>Distribution of pass/fail/inconclusive results</CardDescription>
          </CardHeader>
          <CardContent>
            {resultData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={resultData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {resultData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admissions by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Admissions by Category</CardTitle>
            <CardDescription>Most common confession categories</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.admissionsByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.admissionsByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="category" type="category" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No admissions data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reports Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Reports Over Time
          </CardTitle>
          <CardDescription>Monthly examination count</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.reportsOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.reportsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drug Types Breakdown */}
      {stats.drugTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Drug Use Breakdown</CardTitle>
            <CardDescription>Types of substances admitted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.drugTypes.map((drug, index) => (
                <Badge key={drug.type} variant="outline" className="text-sm py-1 px-3">
                  {drug.type.replace(/_/g, " ")}: {drug.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PolygraphStatistics;
