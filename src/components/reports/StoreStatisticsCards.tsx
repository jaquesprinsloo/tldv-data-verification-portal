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

      // Query polygraph_reports (from PDF uploads) instead of examinations
      let reportsQuery = supabase
        .from("polygraph_reports")
        .select("*")
        .eq("store_id", storeId);
      
      let riskQuery = supabase
        .from("risk_assessments")
        .select("*")
        .eq("store_id", storeId);

      if (startDate) {
        reportsQuery = reportsQuery.gte("examination_date", startDate.toISOString());
        riskQuery = riskQuery.gte("assessment_date", startDate.toISOString());
      }

      const [reportsResult, riskResult] = await Promise.all([
        reportsQuery,
        riskQuery,
      ]);

      const reports = reportsResult.data || [];
      const risks = riskResult.data || [];

      // Map polygraph report results to stats
      // overall_result can be: passed, failed, inconclusive, or null (pending)
      const getVettingType = (report: any) => {
        const types = report.vetting_types || [];
        if (types.includes("periodic_screening")) return "periodic_screening";
        if (types.includes("pre_employment")) return "pre_employment";
        if (types.includes("specific")) return "specific";
        return "pre_employment"; // default
      };

      setStats({
        polygraph: {
          total: reports.length,
          pass: reports.filter((r) => r.overall_result === "passed").length,
          fail: reports.filter((r) => r.overall_result === "failed").length,
          pending: reports.filter((r) => !r.overall_result || r.status === "draft").length,
          inconclusive: reports.filter((r) => r.overall_result === "inconclusive").length,
          periodic: reports.filter((r) => getVettingType(r) === "periodic_screening").length,
          preEmployment: reports.filter((r) => getVettingType(r) === "pre_employment").length,
          specific: reports.filter((r) => getVettingType(r) === "specific").length,
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
        // Query polygraph_reports instead of examinations
        let query = supabase
          .from("polygraph_reports")
          .select(`
            *,
            examiners (name)
          `)
          .eq("store_id", storeId)
          .order("examination_date", { ascending: false });

        if (startDate) {
          query = query.gte("examination_date", startDate.toISOString());
        }

        // Map filter to polygraph_reports fields
        if (filter === "pass") {
          query = query.eq("overall_result", "passed");
        } else if (filter === "fail") {
          query = query.eq("overall_result", "failed");
        } else if (filter === "inconclusive") {
          query = query.eq("overall_result", "inconclusive");
        } else if (filter === "pending") {
          query = query.or("overall_result.is.null,status.eq.draft");
        }
        // Type filters handled client-side since vetting_types is JSONB

        const { data, error } = await query;
        if (error) throw error;
        
        // Filter by type if needed
        let filtered = data || [];
        if (filter && ["periodic_screening", "pre_employment", "specific"].includes(filter)) {
          filtered = filtered.filter((r: any) => {
            const types = r.vetting_types || [];
            return types.includes(filter);
          });
        }
        
        setDetailData(filtered);
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
                  <TableHead>Candidate</TableHead>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Examiner</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailData.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{format(new Date(report.examination_date), "PP")}</TableCell>
                    <TableCell>{report.first_name} {report.last_name}</TableCell>
                    <TableCell>{report.id_number}</TableCell>
                    <TableCell>{report.examiners?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={
                        report.risk_level === "LOW RISK" ? "default" :
                        report.risk_level === "MEDIUM RISK" ? "secondary" :
                        report.risk_level === "HIGH RISK" ? "destructive" : "outline"
                      } className={
                        report.risk_level === "LOW RISK" ? "bg-green-500" :
                        report.risk_level === "MEDIUM RISK" ? "bg-yellow-500" : ""
                      }>
                        {report.risk_level || "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {report.overall_result 
                        ? getResultBadge(report.overall_result === "passed" ? "pass" : report.overall_result === "failed" ? "fail" : report.overall_result)
                        : <Badge variant="secondary">Pending</Badge>
                      }
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
