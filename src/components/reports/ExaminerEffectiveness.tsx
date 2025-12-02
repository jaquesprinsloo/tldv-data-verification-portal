import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Plus, UserCheck, TrendingUp, Award, Lock } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

interface ExaminerEffectivenessProps {
  storeId: string;
  dateFilter: "week" | "month" | "year" | "all";
  canEdit?: boolean;
}

interface Examiner {
  id: string;
  name: string;
  email: string | null;
  is_active: boolean;
}

interface ExaminerStats {
  examiner: Examiner;
  totalExams: number;
  passes: number;
  fails: number;
  admissionsBefore: number;
  admissionsAfter: number;
  passRate: number;
  admissionRate: number;
}

export const ExaminerEffectiveness = ({ storeId, dateFilter, canEdit = false }: ExaminerEffectivenessProps) => {
  const [examinerStats, setExaminerStats] = useState<ExaminerStats[]>([]);
  const [examiners, setExaminers] = useState<Examiner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newExaminer, setNewExaminer] = useState({ name: "", email: "", phone: "" });

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
    fetchData();
  }, [storeId, dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch examiners
      const { data: examinersData, error: examinersError } = await supabase
        .from("examiners")
        .select("*")
        .order("name");

      if (examinersError) throw examinersError;
      setExaminers(examinersData || []);

      // Fetch examinations for this store
      const { start, end } = getDateRange(dateFilter);

      let query = supabase
        .from("examinations")
        .select("*")
        .eq("store_id", storeId);

      if (start && end) {
        query = query
          .gte("examination_date", format(start, "yyyy-MM-dd"))
          .lte("examination_date", format(end, "yyyy-MM-dd"));
      }

      const { data: examsData, error: examsError } = await query;
      if (examsError) throw examsError;

      // Calculate stats for each examiner
      const stats: ExaminerStats[] = (examinersData || []).map((examiner) => {
        const examinerExams = (examsData || []).filter((e) => e.examiner_id === examiner.id);
        const totalExams = examinerExams.length;
        const passes = examinerExams.filter((e) => e.result === "pass").length;
        const fails = examinerExams.filter((e) => e.result === "fail").length;
        const admissionsBefore = examinerExams.filter((e) => e.admission_before_exam && e.admission_before_exam.trim() !== "").length;
        const admissionsAfter = examinerExams.filter((e) => e.admission_after_exam && e.admission_after_exam.trim() !== "").length;

        return {
          examiner,
          totalExams,
          passes,
          fails,
          admissionsBefore,
          admissionsAfter,
          passRate: totalExams > 0 ? (passes / totalExams) * 100 : 0,
          admissionRate: totalExams > 0 ? ((admissionsBefore + admissionsAfter) / totalExams) * 100 : 0
        };
      }).filter((s) => s.totalExams > 0);

      // Sort by total exams
      stats.sort((a, b) => b.totalExams - a.totalExams);
      setExaminerStats(stats);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load examiner data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExaminer = async () => {
    if (!newExaminer.name) {
      toast.error("Name is required");
      return;
    }

    try {
      const { error } = await supabase.from("examiners").insert([newExaminer]);
      if (error) throw error;

      toast.success("Examiner created successfully");
      setDialogOpen(false);
      setNewExaminer({ name: "", email: "", phone: "" });
      fetchData();
    } catch (error: any) {
      console.error("Error creating examiner:", error);
      toast.error(error.message || "Failed to create examiner");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Performers */}
      {examinerStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {examinerStats.slice(0, 3).map((stat, index) => (
            <Card key={stat.examiner.id} className={index === 0 ? "border-yellow-500 border-2" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {index === 0 && <Award className="h-5 w-5 text-yellow-500" />}
                  {stat.examiner.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Examinations</span>
                  <span className="font-bold">{stat.totalExams}</span>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Pass Rate</span>
                    <span className="font-medium text-green-600">{stat.passRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={stat.passRate} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Admission Rate</span>
                    <span className="font-medium text-blue-600">{stat.admissionRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={stat.admissionRate} className="h-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Examiners Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Examiner Statistics
            </CardTitle>
            {canEdit ? (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Examiner
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Examiner</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        value={newExaminer.name}
                        onChange={(e) => setNewExaminer({ ...newExaminer, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newExaminer.email}
                        onChange={(e) => setNewExaminer({ ...newExaminer, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={newExaminer.phone}
                        onChange={(e) => setNewExaminer({ ...newExaminer, phone: e.target.value })}
                      />
                    </div>
                    <Button onClick={handleCreateExaminer} className="w-full">
                      Create Examiner
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                View Only
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {examinerStats.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No examination data for examiners in this period</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Examiner</TableHead>
                  <TableHead className="text-center">Total Exams</TableHead>
                  <TableHead className="text-center">Passes</TableHead>
                  <TableHead className="text-center">Fails</TableHead>
                  <TableHead className="text-center">Pass Rate</TableHead>
                  <TableHead className="text-center">Admissions Before</TableHead>
                  <TableHead className="text-center">Admissions After</TableHead>
                  <TableHead className="text-center">Admission Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examinerStats.map((stat) => (
                  <TableRow key={stat.examiner.id}>
                    <TableCell className="font-medium">
                      {stat.examiner.name}
                      {!stat.examiner.is_active && (
                        <Badge variant="secondary" className="ml-2">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{stat.totalExams}</TableCell>
                    <TableCell className="text-center text-green-600">{stat.passes}</TableCell>
                    <TableCell className="text-center text-red-600">{stat.fails}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={stat.passRate >= 70 ? "default" : "secondary"}>
                        {stat.passRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{stat.admissionsBefore}</TableCell>
                    <TableCell className="text-center">{stat.admissionsAfter}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">
                        {stat.admissionRate.toFixed(1)}%
                      </Badge>
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
