import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, ShieldCheck, CheckCircle, XCircle, Clock, AlertTriangle, FileText } from "lucide-react";
import { format, subDays, subMonths, subYears } from "date-fns";
import { toast } from "sonner";

interface StoreStatisticsCardsProps {
  storeId: string;
  canEdit: boolean;
}

type DateFilter = "week" | "month" | "year" | "all";

export const StoreStatisticsCards = ({ storeId, canEdit }: StoreStatisticsCardsProps) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    polygraph: { total: 0, pass: 0, fail: 0, pending: 0, inconclusive: 0, periodic: 0, preEmployment: 0, specific: 0 },
    risk: { total: 0, clear: 0, flagged: 0, pending: 0 },
  });
  const [detailDialog, setDetailDialog] = useState<{ type: "polygraph" | "risk" | null; filter?: string }>({ type: null });
  const [detailData, setDetailData] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case "week":
        return subDays(now, 7);
      case "month":
        return subMonths(now, 1);
      case "year":
        return subYears(now, 1);
      default:
        return null;
    }
  };

  useEffect(() => {
    fetchStats();
  }, [storeId, dateFilter]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const startDate = getDateRange();

      let examsQuery = supabase
        .from("examinations")
        .select("*")
        .eq("store_id", storeId);
      
      let riskQuery = supabase
        .from("risk_assessments")
        .select("*")
        .eq("store_id", storeId);

      if (startDate) {
        examsQuery = examsQuery.gte("examination_date", startDate.toISOString());
        riskQuery = riskQuery.gte("assessment_date", startDate.toISOString());
      }

      const [examsResult, riskResult] = await Promise.all([
        examsQuery,
        riskQuery,
      ]);

      const exams = examsResult.data || [];
      const risks = riskResult.data || [];

      setStats({
        polygraph: {
          total: exams.length,
          pass: exams.filter((e) => e.result === "pass").length,
          fail: exams.filter((e) => e.result === "fail").length,
          pending: exams.filter((e) => e.result === "pending").length,
          inconclusive: exams.filter((e) => e.result === "inconclusive").length,
          periodic: exams.filter((e) => e.examination_type === "periodic_screening").length,
          preEmployment: exams.filter((e) => e.examination_type === "pre_employment").length,
          specific: exams.filter((e) => e.examination_type === "specific").length,
        },
        risk: {
          total: risks.length,
          clear: risks.filter((r) => r.result === "clear").length,
          flagged: risks.filter((r) => r.result === "flagged").length,
          pending: risks.filter((r) => r.result === "pending").length,
        },
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (type: "polygraph" | "risk", filter?: string) => {
    setDetailDialog({ type, filter });
    setLoadingDetail(true);

    try {
      const startDate = getDateRange();

      if (type === "polygraph") {
        let query = supabase
          .from("examinations")
          .select(`
            *,
            employees (employee_number, submissions (first_name, last_name)),
            examiners (name)
          `)
          .eq("store_id", storeId)
          .order("examination_date", { ascending: false });

        if (startDate) {
          query = query.gte("examination_date", startDate.toISOString());
        }

        if (filter && ["pass", "fail", "pending", "inconclusive"].includes(filter)) {
          query = query.eq("result", filter as "pass" | "fail" | "pending" | "inconclusive");
        } else if (filter && ["periodic_screening", "pre_employment", "specific"].includes(filter)) {
          query = query.eq("examination_type", filter as "periodic_screening" | "pre_employment" | "specific");
        }

        const { data, error } = await query;
        if (error) throw error;
        setDetailData(data || []);
      } else {
        let query = supabase
          .from("risk_assessments")
          .select(`
            *,
            employees (employee_number, submissions (first_name, last_name))
          `)
          .eq("store_id", storeId)
          .order("assessment_date", { ascending: false });

        if (startDate) {
          query = query.gte("assessment_date", startDate.toISOString());
        }

        if (filter && ["clear", "flagged", "pending"].includes(filter)) {
          query = query.eq("result", filter as "clear" | "flagged" | "pending");
        }

        const { data, error } = await query;
        if (error) throw error;
        setDetailData(data || []);
      }
    } catch (error) {
      console.error("Error fetching detail:", error);
      toast.error("Failed to load details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const getResultBadge = (result: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      pass: { variant: "default", className: "bg-green-500" },
      clear: { variant: "default", className: "bg-green-500" },
      fail: { variant: "destructive", className: "" },
      flagged: { variant: "destructive", className: "" },
      pending: { variant: "secondary", className: "bg-yellow-500" },
      inconclusive: { variant: "outline", className: "bg-orange-500" },
    };
    const cfg = config[result] || { variant: "secondary" as const, className: "" };
    return <Badge variant={cfg.variant} className={cfg.className}>{result}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Filter */}
      <div className="flex justify-end">
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last month</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Polygraph Statistics */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-green-500" />
          Polygraph Examinations
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:border-primary" onClick={() => openDetail("polygraph")}>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{stats.polygraph.total}</p>
              <p className="text-sm text-muted-foreground">Total Examinations</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-500 border-green-200" onClick={() => openDetail("polygraph", "pass")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.polygraph.pass}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-red-500 border-red-200" onClick={() => openDetail("polygraph", "fail")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.polygraph.fail}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-yellow-500 border-yellow-200" onClick={() => openDetail("polygraph", "pending")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.polygraph.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* By Type */}
        <h4 className="text-sm font-medium mt-4 mb-2 text-muted-foreground">By Examination Type</h4>
        <div className="grid grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:border-primary" onClick={() => openDetail("polygraph", "periodic_screening")}>
            <CardContent className="pt-4">
              <p className="text-xl font-bold">{stats.polygraph.periodic}</p>
              <p className="text-sm text-muted-foreground">Periodic Screening</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary" onClick={() => openDetail("polygraph", "pre_employment")}>
            <CardContent className="pt-4">
              <p className="text-xl font-bold">{stats.polygraph.preEmployment}</p>
              <p className="text-sm text-muted-foreground">Pre-Employment</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary" onClick={() => openDetail("polygraph", "specific")}>
            <CardContent className="pt-4">
              <p className="text-xl font-bold">{stats.polygraph.specific}</p>
              <p className="text-sm text-muted-foreground">Specific</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Risk Assessment Statistics */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-purple-500" />
          Risk Assessments
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:border-primary" onClick={() => openDetail("risk")}>
            <CardContent className="pt-4">
              <p className="text-2xl font-bold">{stats.risk.total}</p>
              <p className="text-sm text-muted-foreground">Total Assessments</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-500 border-green-200" onClick={() => openDetail("risk", "clear")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.risk.clear}</p>
                <p className="text-sm text-muted-foreground">Clear</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-red-500 border-red-200" onClick={() => openDetail("risk", "flagged")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.risk.flagged}</p>
                <p className="text-sm text-muted-foreground">Flagged</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-yellow-500 border-yellow-200" onClick={() => openDetail("risk", "pending")}>
            <CardContent className="pt-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{stats.risk.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialog.type !== null} onOpenChange={(open) => !open && setDetailDialog({ type: null })}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailDialog.type === "polygraph" ? "Polygraph Examinations" : "Risk Assessments"}
              {detailDialog.filter && ` - ${detailDialog.filter.replace(/_/g, " ")}`}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : detailData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No records found</p>
          ) : detailDialog.type === "polygraph" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Examiner</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Admissions</TableHead>
                  <TableHead>Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailData.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell>{format(new Date(exam.examination_date), "PP")}</TableCell>
                    <TableCell>
                      {exam.employees?.submissions?.first_name
                        ? `${exam.employees.submissions.first_name} ${exam.employees.submissions.last_name}`
                        : exam.employees?.employee_number || "-"}
                    </TableCell>
                    <TableCell className="capitalize">{exam.examination_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{exam.examiners?.name || "-"}</TableCell>
                    <TableCell>{getResultBadge(exam.result)}</TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {exam.admission_before_exam && <p>Before: {exam.admission_before_exam}</p>}
                        {exam.admission_after_exam && <p>After: {exam.admission_after_exam}</p>}
                        {!exam.admission_before_exam && !exam.admission_after_exam && "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {exam.report_url ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={exam.report_url} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>ID Verification</TableHead>
                  <TableHead>Criminal Check</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Assessor</TableHead>
                  <TableHead>Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailData.map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell>{format(new Date(assessment.assessment_date), "PP")}</TableCell>
                    <TableCell>
                      {assessment.employees?.submissions?.first_name
                        ? `${assessment.employees.submissions.first_name} ${assessment.employees.submissions.last_name}`
                        : assessment.employees?.employee_number || "-"}
                    </TableCell>
                    <TableCell className="capitalize">{assessment.id_verification_status}</TableCell>
                    <TableCell className="capitalize">{assessment.criminal_check_status}</TableCell>
                    <TableCell>{getResultBadge(assessment.result)}</TableCell>
                    <TableCell>{assessment.assessor_name || "-"}</TableCell>
                    <TableCell>
                      {assessment.report_url ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={assessment.report_url} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
