import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, Users, AlertTriangle, CheckCircle2, XCircle, Percent, UserCheck } from "lucide-react";

interface Examiner {
  id: string;
  name: string;
}

interface DisclosureStat {
  category: string;
  label: string;
  count: number;
  percentage: number;
}

interface StatisticsData {
  totalReports: number;
  passedCount: number;
  failedCount: number;
  inconclusiveCount: number;
  passRate: number;
  failRate: number;
  disclosureStats: DisclosureStat[];
  reportsOverTime: { month: string; count: number }[];
  drugTypes: { type: string; count: number; percentage: number }[];
  theftRanges: { range: string; count: number; percentage: number }[];
  riskLevelDistribution: { level: string; count: number; percentage: number }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  drug_use: "Drug Use",
  theft_from_work: "Workplace Theft",
  fraud: "Fraud",
  bribery: "Bribery/Corruption",
  criminal_syndicate: "Criminal Syndicate Links",
  undetected_crimes: "Undetected Crimes",
  previous_dismissal: "Previous Dismissal",
  gambling_issues: "Gambling Issues",
};

const DISCLOSURE_CATEGORIES = [
  { key: "WorkplaceTheft", label: "Workplace Theft" },
  { key: "DrugUseHistory", label: "Drug Use" },
  { key: "BriberyPaid", label: "Bribery Paid" },
  { key: "BriberyAccepted", label: "Bribery Accepted" },
  { key: "OrganisedCrimeLinks", label: "Organised Crime Links" },
  { key: "Arrests", label: "Arrests" },
  { key: "Convictions", label: "Convictions" },
  { key: "FamilyCriminalHistory", label: "Family Criminal History" },
  { key: "FriendCriminalHistory", label: "Friend Criminal History" },
];

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

const PolygraphStatistics = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("all");
  const [selectedExaminer, setSelectedExaminer] = useState<string>("all");
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [stats, setStats] = useState<StatisticsData>({
    totalReports: 0,
    passedCount: 0,
    failedCount: 0,
    inconclusiveCount: 0,
    passRate: 0,
    failRate: 0,
    disclosureStats: [],
    reportsOverTime: [],
    drugTypes: [],
    theftRanges: [],
    riskLevelDistribution: [],
  });

  useEffect(() => {
    fetchExaminers();
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [dateRange, selectedExaminer]);

  const fetchExaminers = async () => {
    const { data } = await supabase
      .from("examiners")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setExaminers(data || []);
  };

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

      // Fetch reports with disclosure data
      let reportsQuery = supabase
        .from("polygraph_reports")
        .select("id, overall_result, examination_date, status, examiner_id, extracted_disclosure, risk_level")
        .eq("status", "completed");

      if (dateFilter) {
        reportsQuery = reportsQuery.gte("examination_date", dateFilter);
      }

      if (selectedExaminer !== "all") {
        reportsQuery = reportsQuery.eq("examiner_id", selectedExaminer);
      }

      const { data: reports } = await reportsQuery;

      // Calculate basic statistics
      const totalReports = reports?.length || 0;
      const passedCount = reports?.filter((r) => r.overall_result === "passed").length || 0;
      const failedCount = reports?.filter((r) => r.overall_result === "failed").length || 0;
      const inconclusiveCount = reports?.filter((r) => r.overall_result === "inconclusive").length || 0;
      
      const passRate = totalReports > 0 ? (passedCount / totalReports) * 100 : 0;
      const failRate = totalReports > 0 ? (failedCount / totalReports) * 100 : 0;

      // Calculate disclosure statistics from extracted_disclosure
      const disclosureStats: DisclosureStat[] = [];
      
      DISCLOSURE_CATEGORIES.forEach(({ key, label }) => {
        let count = 0;
        reports?.forEach((r) => {
          const disclosure = r.extracted_disclosure as Record<string, any> | null;
          if (disclosure && disclosure[key]) {
            const value = disclosure[key];
            // Check if it's not empty/null/never
            if (value && 
                value !== "Not Disclosed" && 
                value !== "Never" &&
                value !== "None" &&
                !value.toLowerCase?.().includes("never") &&
                !value.toLowerCase?.().includes("not aware") &&
                !value.toLowerCase?.().includes("no ")) {
              count++;
            }
          }
        });
        const percentage = totalReports > 0 ? (count / totalReports) * 100 : 0;
        disclosureStats.push({ category: key, label, count, percentage });
      });

      // Sort by percentage descending
      disclosureStats.sort((a, b) => b.percentage - a.percentage);

      // Drug types breakdown from extracted disclosure
      const drugMap = new Map<string, number>();
      reports?.forEach((r) => {
        const disclosure = r.extracted_disclosure as Record<string, any> | null;
        if (disclosure?.DrugUseHistory) {
          const drugHistory = disclosure.DrugUseHistory;
          // Common drug mentions
          const drugs = ["marijuana", "cannabis", "cocaine", "heroin", "methamphetamine", "meth", "khat", "dagga"];
          drugs.forEach(drug => {
            if (drugHistory.toLowerCase?.().includes(drug)) {
              const current = drugMap.get(drug) || 0;
              drugMap.set(drug, current + 1);
            }
          });
        }
      });
      const drugTypes = Array.from(drugMap.entries())
        .map(([type, count]) => ({ 
          type: type.charAt(0).toUpperCase() + type.slice(1), 
          count,
          percentage: totalReports > 0 ? (count / totalReports) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Risk level distribution
      const riskLevelMap = new Map<string, number>();
      reports?.forEach((r) => {
        if (r.risk_level) {
          const current = riskLevelMap.get(r.risk_level) || 0;
          riskLevelMap.set(r.risk_level, current + 1);
        }
      });
      const riskLevelDistribution = Array.from(riskLevelMap.entries())
        .map(([level, count]) => ({
          level,
          count,
          percentage: totalReports > 0 ? (count / totalReports) * 100 : 0
        }))
        .sort((a, b) => {
          const order = ["LOW", "MEDIUM", "HIGH", "VERY HIGH"];
          return order.indexOf(a.level) - order.indexOf(b.level);
        });

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
        passRate,
        failRate,
        disclosureStats,
        reportsOverTime,
        drugTypes,
        theftRanges: [],
        riskLevelDistribution,
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

  const riskLevelColors: Record<string, string> = {
    "LOW": "#22c55e",
    "MEDIUM": "#eab308",
    "HIGH": "#f97316",
    "VERY HIGH": "#ef4444",
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  const selectedExaminerName = selectedExaminer === "all" 
    ? "All Examiners" 
    : examiners.find(e => e.id === selectedExaminer)?.name || "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Polygraph Statistics</h2>
          <p className="text-muted-foreground">
            {selectedExaminer !== "all" && (
              <span className="text-primary font-medium">{selectedExaminerName} - </span>
            )}
            Analytics from completed polygraph examinations
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedExaminer} onValueChange={setSelectedExaminer}>
            <SelectTrigger className="w-48">
              <UserCheck className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Select Examiner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Examiners</SelectItem>
              {examiners.map((examiner) => (
                <SelectItem key={examiner.id} value={examiner.id}>
                  {examiner.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-sm text-muted-foreground">Passed ({stats.passRate.toFixed(1)}%)</p>
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
                <p className="text-sm text-muted-foreground">Failed ({stats.failRate.toFixed(1)}%)</p>
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

      {/* Disclosure Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Disclosure Trends
          </CardTitle>
          <CardDescription>
            Percentage of candidates who disclosed each category
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.disclosureStats.length > 0 ? (
            <div className="space-y-4">
              {stats.disclosureStats.map((stat) => (
                <div key={stat.category} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{stat.label}</span>
                    <span className="text-muted-foreground">
                      {stat.count} ({stat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress 
                    value={stat.percentage} 
                    className="h-2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              No disclosure data available
            </div>
          )}
        </CardContent>
      </Card>

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
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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

        {/* Risk Level Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Level Distribution</CardTitle>
            <CardDescription>Distribution of risk assessments</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.riskLevelDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.riskLevelDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="level" type="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${value} (${props.payload.percentage.toFixed(1)}%)`,
                      "Count"
                    ]}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stats.riskLevelDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={riskLevelColors[entry.level] || "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No risk level data
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
            <CardDescription>Types of substances disclosed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {stats.drugTypes.map((drug) => (
                <Badge 
                  key={drug.type} 
                  variant="outline" 
                  className="text-sm py-2 px-4"
                >
                  {drug.type}: {drug.count} ({drug.percentage.toFixed(1)}%)
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
