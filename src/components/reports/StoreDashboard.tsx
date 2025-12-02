import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ClipboardCheck, Receipt, TrendingUp, Users } from "lucide-react";
import { ExaminationStats } from "./ExaminationStats";
import { InvoiceManagement } from "./InvoiceManagement";
import { ExaminerEffectiveness } from "./ExaminerEffectiveness";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

interface Store {
  id: string;
  store_name: string;
  store_code: string;
}

interface StoreDashboardProps {
  store: Store;
  accountName: string;
  onBack: () => void;
  canEdit?: boolean;
}

type DateFilter = "week" | "month" | "year" | "all";

export const StoreDashboard = ({ store, accountName, onBack, canEdit = false }: StoreDashboardProps) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [stats, setStats] = useState({
    totalExaminations: 0,
    periodicScreenings: 0,
    preEmployments: 0,
    specifics: 0,
    totalSpend: 0,
    totalVat: 0,
    totalDiscount: 0
  });
  const [loading, setLoading] = useState(true);

  const getDateRange = (filter: DateFilter) => {
    const now = new Date();
    switch (filter) {
      case "week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: null, end: null };
    }
  };

  useEffect(() => {
    fetchStats();
  }, [store.id, dateFilter]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(dateFilter);

      // Fetch examinations
      let examsQuery = supabase
        .from("examinations")
        .select("*")
        .eq("store_id", store.id);

      if (start && end) {
        examsQuery = examsQuery
          .gte("examination_date", format(start, "yyyy-MM-dd"))
          .lte("examination_date", format(end, "yyyy-MM-dd"));
      }

      const { data: exams, error: examsError } = await examsQuery;
      if (examsError) throw examsError;

      // Fetch invoices
      let invoicesQuery = supabase
        .from("invoices")
        .select("*")
        .eq("store_id", store.id);

      if (start && end) {
        invoicesQuery = invoicesQuery
          .gte("invoice_date", format(start, "yyyy-MM-dd"))
          .lte("invoice_date", format(end, "yyyy-MM-dd"));
      }

      const { data: invoices, error: invoicesError } = await invoicesQuery;
      if (invoicesError) throw invoicesError;

      // Calculate stats
      const periodicScreenings = exams?.filter(e => e.examination_type === "periodic_screening").length || 0;
      const preEmployments = exams?.filter(e => e.examination_type === "pre_employment").length || 0;
      const specifics = exams?.filter(e => e.examination_type === "specific").length || 0;

      const totalSpend = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      const totalVat = invoices?.reduce((sum, inv) => sum + Number(inv.vat_amount || 0), 0) || 0;
      const totalDiscount = invoices?.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0) || 0;

      setStats({
        totalExaminations: exams?.length || 0,
        periodicScreenings,
        preEmployments,
        specifics,
        totalSpend,
        totalVat,
        totalDiscount
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{store.store_name}</h2>
            <p className="text-sm text-muted-foreground">
              {accountName} • Store Code: {store.store_code}
            </p>
          </div>
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Total Examinations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{loading ? "..." : stats.totalExaminations}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Total Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading ? "..." : `R ${stats.totalSpend.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">VAT Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading ? "..." : `R ${stats.totalVat.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {loading ? "..." : `R ${stats.totalDiscount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Examination Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Periodic Screenings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{loading ? "..." : stats.periodicScreenings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pre-Employment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{loading ? "..." : stats.preEmployments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Specific Examinations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{loading ? "..." : stats.specifics}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="examinations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="examinations">Examination Statistics</TabsTrigger>
          <TabsTrigger value="invoices">Invoices & Spending</TabsTrigger>
          <TabsTrigger value="examiners">Examiner Effectiveness</TabsTrigger>
        </TabsList>

        <TabsContent value="examinations">
          <ExaminationStats storeId={store.id} dateFilter={dateFilter} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceManagement storeId={store.id} dateFilter={dateFilter} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="examiners">
          <ExaminerEffectiveness storeId={store.id} dateFilter={dateFilter} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
