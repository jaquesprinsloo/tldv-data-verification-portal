import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  ClipboardCheck, 
  ShieldCheck, 
  DollarSign, 
  TrendingUp,
  Car,
  Bed,
  MapPin,
  Receipt
} from "lucide-react";
import { format } from "date-fns";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface Account {
  id: string;
  name: string;
  code: string;
}

interface AccountDashboardProps {
  account: Account;
  onBack: () => void;
  onViewStores: () => void;
  canEdit: boolean;
}

interface AggregatedStats {
  totalStores: number;
  totalEmployees: number;
  totalPolygraphExams: number;
  totalRiskAssessments: number;
  totalSpend: number;
  polygraphAmount: number;
  riskAssessmentAmount: number;
  travelAmount: number;
  tollsAmount: number;
  accommodationAmount: number;
  otherAmount: number;
}

interface StoreStats {
  id: string;
  store_name: string;
  employees_count: number;
  examinations_count: number;
  risk_assessments_count: number;
  total_spend: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  store_name: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export const AccountDashboard = ({ account, onBack, onViewStores, canEdit }: AccountDashboardProps) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AggregatedStats>({
    totalStores: 0,
    totalEmployees: 0,
    totalPolygraphExams: 0,
    totalRiskAssessments: 0,
    totalSpend: 0,
    polygraphAmount: 0,
    riskAssessmentAmount: 0,
    travelAmount: 0,
    tollsAmount: 0,
    accommodationAmount: 0,
    otherAmount: 0,
  });
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [account.id]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Get all stores for this account
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("account_id", account.id);

      if (storesError) throw storesError;

      if (!stores || stores.length === 0) {
        setLoading(false);
        return;
      }

      const storeIds = stores.map(s => s.id);

      // Fetch all data in parallel
      const [employeesResult, examsResult, riskResult, invoicesResult] = await Promise.all([
        supabase
          .from("employees")
          .select("store_id", { count: "exact" })
          .in("store_id", storeIds),
        supabase
          .from("examinations")
          .select("store_id", { count: "exact" })
          .in("store_id", storeIds),
        supabase
          .from("risk_assessments")
          .select("store_id", { count: "exact" })
          .in("store_id", storeIds),
        supabase
          .from("invoices")
          .select("*")
          .in("store_id", storeIds)
          .order("invoice_date", { ascending: false }),
      ]);

      // Calculate totals
      const invoices = invoicesResult.data || [];
      const aggregated: AggregatedStats = {
        totalStores: stores.length,
        totalEmployees: employeesResult.count || 0,
        totalPolygraphExams: examsResult.count || 0,
        totalRiskAssessments: riskResult.count || 0,
        totalSpend: invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
        polygraphAmount: invoices.reduce((sum, inv) => sum + (inv.polygraph_amount || 0), 0),
        riskAssessmentAmount: invoices.reduce((sum, inv) => sum + (inv.risk_assessment_amount || 0), 0),
        travelAmount: invoices.reduce((sum, inv) => sum + (inv.travel_amount || 0), 0),
        tollsAmount: invoices.reduce((sum, inv) => sum + (inv.tolls_amount || 0), 0),
        accommodationAmount: invoices.reduce((sum, inv) => sum + (inv.accommodation_amount || 0), 0),
        otherAmount: invoices.reduce((sum, inv) => sum + (inv.other_amount || 0), 0),
      };
      setStats(aggregated);

      // Calculate per-store stats
      const storeStatsData: StoreStats[] = await Promise.all(
        stores.map(async (store) => {
          const [empRes, examRes, riskRes, invRes] = await Promise.all([
            supabase.from("employees").select("*", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("examinations").select("*", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("risk_assessments").select("*", { count: "exact", head: true }).eq("store_id", store.id),
            supabase.from("invoices").select("total_amount").eq("store_id", store.id),
          ]);

          return {
            id: store.id,
            store_name: store.store_name,
            employees_count: empRes.count || 0,
            examinations_count: examRes.count || 0,
            risk_assessments_count: riskRes.count || 0,
            total_spend: (invRes.data || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
          };
        })
      );
      setStoreStats(storeStatsData.sort((a, b) => b.total_spend - a.total_spend));

      // Recent invoices with store names
      const recentInvoicesData = invoices.slice(0, 10).map(inv => {
        const store = stores.find(s => s.id === inv.store_id);
        return {
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          total_amount: inv.total_amount,
          store_name: store?.store_name || "Unknown",
        };
      });
      setRecentInvoices(recentInvoicesData);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const expenseBreakdown = [
    { name: "Polygraph Exams", value: stats.polygraphAmount, icon: ClipboardCheck },
    { name: "Risk Assessments", value: stats.riskAssessmentAmount, icon: ShieldCheck },
    { name: "Travel", value: stats.travelAmount, icon: Car },
    { name: "Tolls", value: stats.tollsAmount, icon: MapPin },
    { name: "Accommodation", value: stats.accommodationAmount, icon: Bed },
    { name: "Other", value: stats.otherAmount, icon: Receipt },
  ].filter(item => item.value > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              {account.name}
            </h2>
            <p className="text-sm text-muted-foreground">Account Code: {account.code}</p>
          </div>
        </div>
        <Button onClick={onViewStores}>
          <Building2 className="h-4 w-4 mr-2" />
          View Sub-Accounts ({stats.totalStores})
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Sub-Accounts</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalStores}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Employees</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Polygraph Exams</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalPolygraphExams}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Risk Assessments</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalRiskAssessments}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Total Spend</span>
            </div>
            <p className="text-2xl font-bold text-primary">R {stats.totalSpend.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Expense Breakdown</TabsTrigger>
          <TabsTrigger value="stores">By Sub-Account</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Expense Breakdown Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Expense Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {expenseBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={expenseBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {expenseBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    No expense data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Invoices */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                {recentInvoices.length > 0 ? (
                  <div className="space-y-2">
                    {recentInvoices.slice(0, 5).map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">{invoice.store_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">R {invoice.total_amount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(invoice.invoice_date), "PP")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    No invoices recorded
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: "Polygraph Exams", value: stats.polygraphAmount, icon: ClipboardCheck, color: "text-purple-500" },
              { label: "Risk Assessments", value: stats.riskAssessmentAmount, icon: ShieldCheck, color: "text-orange-500" },
              { label: "Travel", value: stats.travelAmount, icon: Car, color: "text-blue-500" },
              { label: "Tolls", value: stats.tollsAmount, icon: MapPin, color: "text-green-500" },
              { label: "Accommodation", value: stats.accommodationAmount, icon: Bed, color: "text-pink-500" },
              { label: "Other", value: stats.otherAmount, icon: Receipt, color: "text-gray-500" },
            ].map((item, idx) => (
              <Card key={idx}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <p className="text-2xl font-bold">R {item.value.toLocaleString()}</p>
                  {stats.totalSpend > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {((item.value / stats.totalSpend) * 100).toFixed(1)}% of total
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Expense Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={expenseBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stores" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sub-Account Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {storeStats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sub-Account</TableHead>
                      <TableHead className="text-center">Employees</TableHead>
                      <TableHead className="text-center">Polygraph</TableHead>
                      <TableHead className="text-center">Risk Assessments</TableHead>
                      <TableHead className="text-right">Total Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeStats.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">{store.store_name}</TableCell>
                        <TableCell className="text-center">{store.employees_count}</TableCell>
                        <TableCell className="text-center">{store.examinations_count}</TableCell>
                        <TableCell className="text-center">{store.risk_assessments_count}</TableCell>
                        <TableCell className="text-right font-medium">
                          R {store.total_spend.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No sub-accounts found
                </div>
              )}
            </CardContent>
          </Card>

          {/* Spend by Store Bar Chart */}
          {storeStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Spend by Sub-Account</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={storeStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="store_name" width={150} />
                    <Tooltip formatter={(value: number) => `R ${value.toLocaleString()}`} />
                    <Bar dataKey="total_spend" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
