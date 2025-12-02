import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { CheckCircle2, XCircle, HelpCircle, Clock } from "lucide-react";

interface ExaminationStatsProps {
  storeId: string;
  dateFilter: "week" | "month" | "year" | "all";
}

interface ExamStats {
  type: string;
  total: number;
  passes: number;
  fails: number;
  inconclusive: number;
  pending: number;
  admissionsBefore: number;
  admissionsAfter: number;
}

interface Examination {
  id: string;
  examination_type: string;
  examination_date: string;
  result: string;
  admission_before_exam: string | null;
  admission_after_exam: string | null;
  examiner?: { name: string } | null;
  employee?: { employee_number: string } | null;
}

export const ExaminationStats = ({ storeId, dateFilter }: ExaminationStatsProps) => {
  const [stats, setStats] = useState<ExamStats[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("all");

  const getDateRange = (filter: string) => {
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
    fetchExaminations();
  }, [storeId, dateFilter]);

  const fetchExaminations = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(dateFilter);

      let query = supabase
        .from("examinations")
        .select(`
          *,
          examiner:examiners(name),
          employee:employees(employee_number)
        `)
        .eq("store_id", storeId)
        .order("examination_date", { ascending: false });

      if (start && end) {
        query = query
          .gte("examination_date", format(start, "yyyy-MM-dd"))
          .lte("examination_date", format(end, "yyyy-MM-dd"));
      }

      const { data, error } = await query;
      if (error) throw error;

      setExaminations(data || []);

      // Calculate stats by type
      const types = ["periodic_screening", "pre_employment", "specific"];
      const calculatedStats = types.map((type) => {
        const typeExams = data?.filter((e) => e.examination_type === type) || [];
        return {
          type,
          total: typeExams.length,
          passes: typeExams.filter((e) => e.result === "pass").length,
          fails: typeExams.filter((e) => e.result === "fail").length,
          inconclusive: typeExams.filter((e) => e.result === "inconclusive").length,
          pending: typeExams.filter((e) => e.result === "pending").length,
          admissionsBefore: typeExams.filter((e) => e.admission_before_exam && e.admission_before_exam.trim() !== "").length,
          admissionsAfter: typeExams.filter((e) => e.admission_after_exam && e.admission_after_exam.trim() !== "").length
        };
      });

      setStats(calculatedStats);
    } catch (error) {
      console.error("Error fetching examinations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case "pass":
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Pass</Badge>;
      case "fail":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Fail</Badge>;
      case "inconclusive":
        return <Badge variant="secondary"><HelpCircle className="h-3 w-3 mr-1" />Inconclusive</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const formatType = (type: string) => {
    return type.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const filteredExaminations = selectedType === "all"
    ? examinations
    : examinations.filter((e) => e.examination_type === selectedType);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards by Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.type}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{formatType(stat.type)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-bold text-lg">{stat.total}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-green-600">Passes</span>
                  <span className="font-medium">{stat.passes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Fails</span>
                  <span className="font-medium">{stat.fails}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Inconclusive</span>
                  <span className="font-medium">{stat.inconclusive}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending</span>
                  <span className="font-medium">{stat.pending}</span>
                </div>
              </div>
              {stat.type === "pre_employment" && (
                <div className="pt-2 border-t mt-2">
                  <p className="text-sm font-medium mb-1">Admissions</p>
                  <div className="flex justify-between text-sm">
                    <span>Before Exam: <span className="font-medium">{stat.admissionsBefore}</span></span>
                    <span>After Exam: <span className="font-medium">{stat.admissionsAfter}</span></span>
                  </div>
                </div>
              )}
              {stat.total > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Pass Rate: <span className="font-bold text-green-600">
                      {((stat.passes / stat.total) * 100).toFixed(1)}%
                    </span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Examination List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Examination Records</CardTitle>
            <Tabs value={selectedType} onValueChange={setSelectedType}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pre_employment">Pre-Employment</TabsTrigger>
                <TabsTrigger value="periodic_screening">Periodic</TabsTrigger>
                <TabsTrigger value="specific">Specific</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredExaminations.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No examinations found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Examiner</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Admission Before</TableHead>
                  <TableHead>Admission After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExaminations.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell>{format(new Date(exam.examination_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{formatType(exam.examination_type)}</TableCell>
                    <TableCell>{exam.employee?.employee_number || "-"}</TableCell>
                    <TableCell>{exam.examiner?.name || "-"}</TableCell>
                    <TableCell>{getResultBadge(exam.result)}</TableCell>
                    <TableCell>
                      {exam.admission_before_exam ? (
                        <Badge variant="outline" className="text-xs">Yes</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      {exam.admission_after_exam ? (
                        <Badge variant="outline" className="text-xs">Yes</Badge>
                      ) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
