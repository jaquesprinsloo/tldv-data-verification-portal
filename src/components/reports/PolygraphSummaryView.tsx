// Simple pass/fail summary + key findings for a polygraph report.
// Replaces the previous AI 5-category risk profile.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, FileText } from "lucide-react";

interface PolygraphSummaryViewProps {
  report: any;
  examQuestions?: any[];
}

const NO_INDICATORS = [
  "none", "no", "not disclosed", "n/a", "nil", "never",
  "no convictions", "no arrests", "not convicted", "not arrested",
  "no pending", "no bribe", "no cases",
];

const meaningful = (val: any): boolean => {
  if (val === true) return true;
  if (!val) return false;
  const str = String(val).trim().toLowerCase();
  if (!str) return false;
  if (NO_INDICATORS.includes(str)) return false;
  if (str.startsWith("no ") || str.startsWith("not ") || str.startsWith("never ")) return false;
  return true;
};

const collectKeyFindings = (report: any, examQuestions: any[] = []): string[] => {
  const findings: string[] = [];
  if (!report) return findings;

  const law = report.personal_law_encounters || {};
  const disc = report.extracted_disclosure || {};
  const fin = report.financial_circumstances || {};

  const get = (...keys: string[]) => {
    for (const obj of [law, disc]) {
      for (const k of keys) {
        if (obj && obj[k] != null && obj[k] !== "") return obj[k];
      }
    }
    return null;
  };

  const arrests = get("Arrests", "arrests");
  if (meaningful(arrests)) findings.push(`Personal arrest disclosed: ${arrests}`);

  const convictions = get("Convictions", "convictions");
  if (meaningful(convictions)) findings.push(`Personal conviction disclosed: ${convictions}`);

  const pending = get("PendingCases", "pendingCases");
  if (meaningful(pending)) findings.push(`Pending legal case: ${pending}`);

  const bribe = get("Bribe", "bribe", "BribeForArrest", "bribeForArrest");
  if (meaningful(bribe)) findings.push(`Bribe involvement disclosed: ${bribe}`);

  const expungement = (law.Expungement || law.expungement);
  if (meaningful(expungement)) findings.push(`Expungement disclosed: ${expungement}`);

  const blacklisted = fin.Blacklisted ?? fin.blacklisted;
  if (meaningful(blacklisted)) findings.push("Candidate is blacklisted");

  const debts = (fin.Debts || fin.debts || []) as any[];
  if (Array.isArray(debts) && debts.length > 0) {
    findings.push(`${debts.length} active debt${debts.length === 1 ? "" : "s"} disclosed`);
  }
  const arrears = (fin.Arrears || fin.arrears || []) as any[];
  if (Array.isArray(arrears) && arrears.length > 0) {
    findings.push(`${arrears.length} historical debt/arrears entr${arrears.length === 1 ? "y" : "ies"}`);
  }

  const family = Array.isArray(report.family_criminal_history) ? report.family_criminal_history : [];
  const familyIssues = family.filter((m: any) => {
    const hist = (m.CriminalHistory || m.criminalHistory || "").toLowerCase();
    const arrest = (m.ArrestDisclosed || m.arrestDisclosed || "").toLowerCase();
    return (hist && !hist.includes("not aware") && !hist.includes("none") && hist !== "no" && hist !== "n/a") || arrest === "yes";
  });
  if (familyIssues.length > 0) {
    findings.push(`${familyIssues.length} family member(s) with criminal history disclosed`);
  }

  const friends = Array.isArray(report.friend_criminal_history) ? report.friend_criminal_history : [];
  const friendIssues = friends.filter((m: any) => {
    const hist = (m.CriminalHistory || m.criminalHistory || "").toLowerCase();
    const arrest = (m.ArrestDisclosed || m.arrestDisclosed || "").toLowerCase();
    return (hist && !hist.includes("not aware") && !hist.includes("none") && hist !== "no" && hist !== "n/a") || arrest === "yes";
  });
  if (friendIssues.length > 0) {
    findings.push(`${friendIssues.length} close friend(s) with criminal history disclosed`);
  }

  // Detailed criminal admissions branches
  const detailed = disc.DetailedCriminalActivity || (report.extracted_data?.detailedCriminalActivity);
  if (detailed && typeof detailed === "object") {
    const branchLabels: Record<string, string> = {
      TheftAtWork: "Theft at work",
      Fraud: "Fraud",
      Bribery: "Bribery",
      OrganizedCrime: "Organised crime",
      UndetectedCrimes: "Undetected crimes",
      IllegalDrugInvolvement: "Illegal drug involvement",
    };
    for (const [key, label] of Object.entries(branchLabels)) {
      const branch = (detailed as any)[key];
      if (!branch || typeof branch !== "object") continue;
      const hasYes = JSON.stringify(branch).toLowerCase().includes('"yes"');
      if (hasYes) findings.push(`${label} admissions disclosed`);
    }
  }

  // Polygraph exam findings (SR / INC)
  const sr = examQuestions.filter((q: any) => (q.finding || q.Finding || "").toUpperCase() === "SR").length;
  const inc = examQuestions.filter((q: any) => (q.finding || q.Finding || "").toUpperCase() === "INC").length;
  if (sr > 0) findings.push(`${sr} question(s) with significant response (SR)`);
  if (inc > 0) findings.push(`${inc} inconclusive question(s) (INC)`);

  if (meaningful(report.post_exam_admissions)) {
    findings.push(`Post-exam admissions: ${report.post_exam_admissions}`);
  }

  return findings;
};

export const PolygraphSummaryView = ({ report, examQuestions = [] }: PolygraphSummaryViewProps) => {
  const result = (report?.overall_result || "").toString().toLowerCase();
  const passed = result === "passed";
  const failed = result === "failed";
  const inconclusive = result === "inconclusive";

  const headerCfg = passed
    ? { bg: "bg-green-50 border-green-200", text: "text-green-700", Icon: CheckCircle2, label: "PASSED", badge: "bg-green-600" }
    : failed
    ? { bg: "bg-red-50 border-red-200", text: "text-red-700", Icon: XCircle, label: "FAILED", badge: "bg-red-600" }
    : inconclusive
    ? { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", Icon: AlertTriangle, label: "INCONCLUSIVE", badge: "bg-yellow-600" }
    : { bg: "bg-muted/30 border-border", text: "text-muted-foreground", Icon: FileText, label: "PENDING", badge: "bg-muted" };

  const findings = collectKeyFindings(report, examQuestions);
  const HeaderIcon = headerCfg.Icon;

  return (
    <div className="space-y-4">
      <Card className={`border-2 ${headerCfg.bg}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <HeaderIcon className={`h-10 w-10 ${headerCfg.text}`} />
              <div>
                <p className="text-sm text-muted-foreground">Polygraph Result</p>
                <p className="text-2xl font-bold">{headerCfg.label}</p>
              </div>
            </div>
            <Badge className={`${headerCfg.badge} text-white text-base px-4 py-1.5`}>
              {headerCfg.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Key Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notable findings disclosed in this report.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PolygraphSummaryView;