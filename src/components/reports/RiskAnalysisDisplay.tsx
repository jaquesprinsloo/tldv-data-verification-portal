import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadialBarChart, RadialBar, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  ChevronDown, Shield, AlertTriangle, CheckCircle2, XCircle,
  Briefcase, DollarSign, Scale, AlertCircle, Activity,
  Fingerprint, TrendingDown, Ban, Check, X,
} from "lucide-react";

interface RiskAnalysisDisplayProps {
  polygraphReport: any;
  examQuestions: any[];
  riskAnalysis?: any;
}

// ─── Utility Functions ───────────────────────────────────────────────

const parseDurationToMonths = (duration: string | undefined | null): number => {
  if (!duration || typeof duration !== "string") return 0;
  const d = duration.toLowerCase().trim();

  // Handle word numbers with parenthetical digits: "Two (2) years", "eight (8) years"
  // Also handles plain: "2 years 6 months", "1 year"
  // Extract all number occurrences (digit or parenthetical)
  let months = 0;

  // Look for parenthetical numbers first: "(2) years", "(8) months"
  const parenYears = d.match(/\((\d+)\)\s*year/);
  const parenMonths = d.match(/\((\d+)\)\s*month/);
  if (parenYears) months += parseInt(parenYears[1]) * 12;
  if (parenMonths) months += parseInt(parenMonths[1]);
  if (months > 0) return months;

  // Standard: "2 years", "6 months"
  const yearsMatch = d.match(/(\d+)\s*year/);
  const monthsMatch = d.match(/(\d+)\s*month/);
  if (yearsMatch) months += parseInt(yearsMatch[1]) * 12;
  if (monthsMatch) months += parseInt(monthsMatch[1]);
  if (months > 0) return months;

  // Word-based numbers without parenthetical: "two years", "eight years"
  const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
  };
  for (const [word, num] of Object.entries(wordToNum)) {
    const wordYearMatch = d.match(new RegExp(`${word}\\s*\\(?\\d*\\)?\\s*year`));
    if (wordYearMatch) { months += num * 12; break; }
  }
  for (const [word, num] of Object.entries(wordToNum)) {
    const wordMonthMatch = d.match(new RegExp(`${word}\\s*\\(?\\d*\\)?\\s*month`));
    if (wordMonthMatch) { months += num; break; }
  }
  if (months > 0) return months;

  // Date range "2020 - 2022" or "Jan 2020 - Mar 2022"
  const rangeMatch = d.match(/(\d{4})\s*[-–to]+\s*(\d{4})/);
  if (rangeMatch) {
    const diff = (parseInt(rangeMatch[2]) - parseInt(rangeMatch[1])) * 12;
    return diff > 0 ? diff : 12;
  }

  // Just a number (assume months)
  const justNumber = d.match(/^(\d+)$/);
  if (justNumber) return parseInt(justNumber[1]);

  return 0;
};

const parseAmount = (amount: any): number => {
  if (typeof amount === "number") return amount;
  if (!amount || typeof amount !== "string") return 0;
  const cleaned = amount.replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const formatMonths = (m: number): string => {
  if (m <= 0) return "N/A";
  const years = Math.floor(m / 12);
  const months = Math.round(m % 12);
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""}`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""}`;
  return `${years} year${years !== 1 ? "s" : ""} ${months} month${months !== 1 ? "s" : ""}`;
};

const getScoreColor = (score: number, max: number): string => {
  const ratio = max > 0 ? score / max : 0;
  if (ratio === 0) return "text-green-600";
  if (ratio <= 0.33) return "text-yellow-600";
  if (ratio <= 0.66) return "text-orange-600";
  return "text-red-600";
};

const getScoreBg = (score: number, max: number): string => {
  const ratio = max > 0 ? score / max : 0;
  if (ratio === 0) return "bg-green-50 border-green-200";
  if (ratio <= 0.33) return "bg-yellow-50 border-yellow-200";
  if (ratio <= 0.66) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
};

const getBarColor = (months: number): string => {
  if (months >= 36) return "#22c55e";
  if (months >= 24) return "#eab308";
  if (months >= 12) return "#f97316";
  return "#ef4444";
};

const isMeaningful = (value: any): boolean => {
  if (!value) return false;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower !== "" && lower !== "not disclosed" && lower !== "n/a" && lower !== "none" && lower !== "no";
  }
  if (typeof value === "boolean") return value;
  return true;
};

// ─── Score Calculators ───────────────────────────────────────────────

interface EmploymentResult {
  score: number;
  label: string;
  jobs: { company: string; position: string; durationMonths: number; reason: string }[];
  totalMonths: number;
  avgMonths: number;
  mostCommonReason: string;
  hasDisciplinary: boolean;
  disciplinaryDetails: string;
}

const calculateEmploymentScore = (report: any): EmploymentResult => {
  const history = report?.employment_history || [];
  const histArr = Array.isArray(history) ? history : [history];
  const last4 = histArr.slice(0, 4);

  const jobs = last4.map((j: any) => ({
    company: j.Company || j.company || j.Employer || j.employer || "Unknown",
    position: j.Position || j.position || j.Role || j.role || j.Title || j.title || "",
    durationMonths: parseDurationToMonths(j.Duration || j.duration || j.Dates || j.dates || j.Period || j.period),
    reason: j.ReasonForLeaving || j.reasonForLeaving || j.Reason || j.reason || "Not stated",
    disciplinary: j.DisciplinaryConduct || j.disciplinaryConduct || j.Disciplinary || j.disciplinary || "",
  }));

  const totalMonths = jobs.reduce((sum: number, j: any) => sum + j.durationMonths, 0);
  const avgMonths = jobs.length > 0 ? totalMonths / jobs.length : 0;

  // Most common reason
  const reasonCounts: Record<string, number> = {};
  jobs.forEach((j: any) => {
    const r = j.reason.toLowerCase().trim();
    if (r && r !== "not stated") reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  });
  const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
  const mostCommonReason = sortedReasons.length > 0 ? sortedReasons[0][0] : "Not available";

  // Check disciplinary conduct from both the DisciplinaryConduct field and reason keywords
  const disciplinaryJobs = jobs.filter((j: any) => {
    const r = j.reason.toLowerCase();
    const d = (j.disciplinary || "").toLowerCase();
    const hasReasonFlag = r.includes("dismiss") || r.includes("fired") || r.includes("hearing") || r.includes("disciplin") || r.includes("warning");
    const hasDisciplinaryField = d && d !== "none" && d !== "not disclosed" && d !== "n/a" && d !== "no" && d.length > 2;
    return hasReasonFlag || hasDisciplinaryField;
  });
  const hasDisciplinary = disciplinaryJobs.length > 0;
  const disciplinaryDetails = hasDisciplinary
    ? disciplinaryJobs.map((d: any) => {
        const parts = [d.company];
        if (d.disciplinary && d.disciplinary.toLowerCase() !== "none") parts.push(d.disciplinary);
        else parts.push(d.reason);
        return parts.join(": ");
      }).join("; ")
    : "None disclosed";

  let score = 0;
  if (avgMonths >= 36) score = 0;
  else if (avgMonths >= 24) score = 1;
  else if (avgMonths >= 12) score = 2;
  else score = 3;

  // Bump score if disciplinary issues
  if (hasDisciplinary && score < 3) score = Math.min(score + 1, 3);

  const labels = ["Stable", "Fairly Stable", "Caution", "Unstable"];

  return { score, label: labels[score], jobs, totalMonths, avgMonths, mostCommonReason, hasDisciplinary, disciplinaryDetails };
};

interface FinancialResult {
  score: number;
  label: string;
  currentAccounts: { name: string; amount: number; status: string }[];
  estimatedMonthly: number;
  historicalDebt: { name: string; amount: number }[];
  totalHistoricalDebt: number;
  avgHistoricalDebt: number;
  blacklisted: boolean;
  creditRating: string;
}

const calculateFinancialScore = (report: any): FinancialResult => {
  const financial = report?.financial_circumstances || {};
  const disclosure = report?.extracted_disclosure || {};
  const discFinancial = disclosure?.FinancialStatus || disclosure?.financialStatus || {};

  // Helper to normalize debt/arrears entries that may be strings like "Truworths R 800.00"
  const normalizeEntries = (arr: any[]): any[] => {
    return arr.map((item: any) => {
      if (typeof item === "string") {
        // Parse strings like "Truworths R 800.00" or "Vehicle Finance R 5 600.00 (January 2023)"
        const match = item.match(/^(.+?)\s+R\s*([\d\s,.]+)/i);
        if (match) {
          return { Name: match[1].trim(), Amount: parseAmount(match[2].replace(/\s/g, "")) };
        }
        return { Name: item, Amount: 0 };
      }
      return item;
    });
  };

  // Use financial_circumstances as primary source; only fall back to disclosure if empty
  const rawDebts = Array.isArray(financial.Debts || financial.debts) ? (financial.Debts || financial.debts) : [];
  const fallbackDebts = rawDebts.length === 0 && Array.isArray(discFinancial.ActiveDebt || discFinancial.activeDebt)
    ? (discFinancial.ActiveDebt || discFinancial.activeDebt) : [];
  const allDebts = normalizeEntries(rawDebts.length > 0 ? rawDebts : fallbackDebts);

  const rawArrears = Array.isArray(financial.Arrears || financial.arrears) ? (financial.Arrears || financial.arrears) : [];
  const fallbackArrears = rawArrears.length === 0 && Array.isArray(discFinancial.Arrears || discFinancial.arrears)
    ? (discFinancial.Arrears || discFinancial.arrears) : [];
  const allArrears = normalizeEntries(rawArrears.length > 0 ? rawArrears : fallbackArrears);

  const blacklistedStr = (financial.Blacklisted || financial.blacklisted || discFinancial.Blacklisted || discFinancial.blacklisted || "").toString().toLowerCase();
  const blacklisted = blacklistedStr.includes("yes") || blacklistedStr.includes("true") || blacklistedStr.includes("blacklisted");

  const currentAccounts = allDebts.map((d: any) => ({
    name: d.Name || d.name || d.Creditor || d.creditor || d.Type || d.type || "Account",
    amount: parseAmount(d.Amount || d.amount || d.MonthlyPayment || d.monthlyPayment),
    status: (d.Status || d.status || "current").toLowerCase(),
  }));

  const estimatedMonthly = currentAccounts.reduce((sum, a) => sum + a.amount, 0);

  const historicalDebt = allArrears.map((a: any) => ({
    name: a.Name || a.name || a.Creditor || a.creditor || a.Type || a.type || "Debt",
    amount: parseAmount(a.Amount || a.amount || a.Balance || a.balance),
  }));

  const totalHistoricalDebt = historicalDebt.reduce((sum, d) => sum + d.amount, 0);
  const avgHistoricalDebt = historicalDebt.length > 0 ? totalHistoricalDebt / historicalDebt.length : 0;

  let score = 0;
  const hasActiveAccounts = allDebts.length > 0;
  const hasHistoricalDebt = allArrears.length > 0;

  if (hasActiveAccounts && hasHistoricalDebt && blacklisted) score = 3;
  else if (hasActiveAccounts && hasHistoricalDebt) score = 2;
  else if (hasActiveAccounts) score = 1;
  // score stays 0 if no monthly accounts

  const labels = ["No Monthly Accounts", "Accounts Paid Up To Date", "Active Accounts & Historical Debt", "Active Accounts, Historical Debt & Blacklisted"];

  let creditRating = "Good";
  if (blacklisted) creditRating = "Very Poor";
  else if (allArrears.length > 2) creditRating = "Poor";
  else if (allArrears.length > 0) creditRating = "Fair";

  return { score, label: labels[score], currentAccounts, estimatedMonthly, historicalDebt, totalHistoricalDebt, avgHistoricalDebt, blacklisted, creditRating };
};

interface LawResult {
  score: number;
  label: string;
  personalArrested: boolean;
  personalConvicted: boolean;
  personalExpungement: boolean;
  personalDetails: string;
  familyIssues: { name: string; relationship: string; details: string }[];
  friendIssues: { name: string; details: string }[];
}

const calculateLawScore = (report: any): LawResult => {
  const law = report?.personal_law_encounters || {};
  const disclosure = report?.extracted_disclosure || {};
  const family = Array.isArray(report?.family_criminal_history) ? report.family_criminal_history : [];
  const friends = Array.isArray(report?.friend_criminal_history) ? report.friend_criminal_history : [];

  const arrests = (law.Arrests || law.arrests || disclosure.Arrests || disclosure.arrests || "").toString().toLowerCase();
  const convictions = (law.Convictions || law.convictions || disclosure.Convictions || disclosure.convictions || "").toString().toLowerCase();
  const expungement = (law.Expungement || law.expungement || "").toString().toLowerCase();
  const bribe = (law.Bribe || law.bribe || disclosure.BribeForArrest || disclosure.bribeForArrest || "").toString().toLowerCase();
  const pendingCases = (law.PendingCases || law.pendingCases || disclosure.PendingCases || disclosure.pendingCases || "").toString().toLowerCase();

  const noIndicators = ["none", "no", "not disclosed", "n/a", "nil", "no convictions", "no arrests", "not convicted", "not arrested", "no pending", "no bribe", "no cases", "never"];
  const isLawMeaningful = (val: string) => {
    if (!isMeaningful(val)) return false;
    return !noIndicators.some(indicator => val === indicator || val.startsWith("no ") || val.startsWith("not ") || val.startsWith("never "));
  };

  const personalArrested = isLawMeaningful(arrests);
  const personalConvicted = isLawMeaningful(convictions);
  const personalExpungement = isLawMeaningful(expungement);
  const paidBribe = isLawMeaningful(bribe);
  const hasPendingCases = isLawMeaningful(pendingCases);

  const personalDetails = [
    personalArrested ? `Arrests: ${law.Arrests || law.arrests || disclosure.Arrests || disclosure.arrests}` : null,
    paidBribe ? `Bribe: ${law.Bribe || law.bribe || disclosure.BribeForArrest || disclosure.bribeForArrest}` : null,
    personalConvicted ? `Convictions: ${law.Convictions || law.convictions || disclosure.Convictions || disclosure.convictions}` : null,
    hasPendingCases ? `Pending Cases: ${law.PendingCases || law.pendingCases || disclosure.PendingCases || disclosure.pendingCases}` : null,
    personalExpungement ? `Expungement: ${law.Expungement || law.expungement}` : null,
  ].filter(Boolean).join("; ") || "None disclosed";

  const familyIssues = family
    .filter((m: any) => {
      const hist = (m.CriminalHistory || m.criminalHistory || "").toLowerCase();
      const arrest = (m.ArrestDisclosed || m.arrestDisclosed || "").toLowerCase();
      return (hist && !hist.includes("not aware") && !hist.includes("none") && !hist.includes("n/a") && hist !== "no")
        || arrest === "yes";
    })
    .map((m: any) => ({
      name: m.Name || m.name || "Unknown",
      relationship: m.Relationship || m.relationship || "Family",
      details: m.CriminalHistory || m.criminalHistory || "Arrest disclosed",
    }));

  const friendIssues = friends
    .filter((m: any) => {
      const hist = (m.CriminalHistory || m.criminalHistory || "").toLowerCase();
      const arrest = (m.ArrestDisclosed || m.arrestDisclosed || "").toLowerCase();
      return (hist && !hist.includes("not aware") && !hist.includes("none") && !hist.includes("n/a") && hist !== "no")
        || arrest === "yes";
    })
    .map((m: any) => ({
      name: m.Name || m.name || "Unknown",
      details: m.CriminalHistory || m.criminalHistory || "Arrest disclosed",
    }));

  const hasFamilyFriendIssues = familyIssues.length > 0 || friendIssues.length > 0;

  // New scoring: 1 point each for personal arrest, bribe, convicted, pending cases, family/friend issues (max 5)
  let score = 0;
  if (personalArrested) score += 1;
  if (paidBribe) score += 1;
  if (personalConvicted) score += 1;
  if (hasPendingCases) score += 1;
  if (hasFamilyFriendIssues) score += 1;

  const label = score === 0 ? "No Encounters" : `${score}/5 Factors Present`;

  return { score, label, personalArrested, personalConvicted, personalExpungement, personalDetails, familyIssues, friendIssues };
};

interface CriminalBranch {
  name: string;
  maxScore: number;
  items: { question: string; confirmed: boolean }[];
  score: number;
}

interface CriminalResult {
  branches: CriminalBranch[];
  grandTotal: number;
  maxGrandTotal: number;
}

const calculateCriminalActivityScore = (report: any): CriminalResult => {
  const riskAnalysis = report?.risk_analysis || {};
  const disclosure = report?.extracted_disclosure || {};
  const detailedActivity = report?.extracted_disclosure?.DetailedCriminalActivity
    || riskAnalysis?.DetailedCriminalActivity || null;

  // If we have detailed extraction data, use it
  if (detailedActivity) {
    const branchDefs: { key: string; name: string; maxScore: number }[] = [
      { key: "TheftAtWork", name: "Theft at Work", maxScore: 5 },
      { key: "Fraud", name: "Fraud", maxScore: 17 },
      { key: "Bribery", name: "Bribery", maxScore: 8 },
      { key: "OrganizedCrime", name: "Organized Crime", maxScore: 13 },
      { key: "UndetectedCrimes", name: "Undetected Crimes", maxScore: 16 },
      { key: "IllegalDrugInvolvement", name: "Illegal Drug Involvement", maxScore: 25 },
      { key: "GeneralOverview", name: "General Overview", maxScore: 4 },
    ];

    const branches = branchDefs.map(def => {
      const items = (detailedActivity[def.key] || []).map((item: any) => ({
        question: item.Question || item.question || "",
        confirmed: item.Answer === true || item.answer === true,
      }));
      const score = items.filter((i: any) => i.confirmed).length;
      return { name: def.name, maxScore: def.maxScore, items, score };
    });

    const grandTotal = branches.reduce((s, b) => s + b.score, 0);
    const maxGrandTotal = branches.reduce((s, b) => s + b.maxScore, 0);

    return { branches, grandTotal, maxGrandTotal };
  }

  // Fallback: derive from admissions array + disclosure data
  const branches: CriminalBranch[] = [];
  const admissions: any[] = report?.extracted_disclosure?.admissions 
    || report?.extracted_data?.admissions || [];

  // Helper: get admission items for a category, counting each detail key as a separate confirmation
  const getAdmissionItems = (categoryMatch: string): { question: string; confirmed: boolean }[] => {
    const items: { question: string; confirmed: boolean }[] = [];
    admissions.forEach((adm: any) => {
      const cat = (adm.category || "").toLowerCase();
      if (!cat.includes(categoryMatch.toLowerCase())) return;
      const isConfirmed = adm.confirmed === true;
      const details = adm.details || {};
      const detailKeys = Object.keys(details);
      if (detailKeys.length > 0) {
        detailKeys.forEach(key => {
          const val = details[key];
          if (isMeaningful(String(val || ""))) {
            items.push({ question: `${key}: ${val}`, confirmed: isConfirmed });
          }
        });
      } else if (isConfirmed) {
        items.push({ question: `${adm.category} confirmed`, confirmed: true });
      }
    });
    return items;
  };

  // Theft at Work
  const theftItems = getAdmissionItems("theft");
  if (theftItems.length === 0) {
    const theft = disclosure.WorkplaceTheft || disclosure.workplaceTheft || "";
    if (isMeaningful(theft)) {
      // Split by sentence boundaries (period followed by space and uppercase letter) to avoid splitting decimals like "R 100.00"
      const parts = theft.split(/\.(?=\s+[A-Z])/).map((p: string) => p.trim().replace(/\.$/, '').trim()).filter((p: string) => p.length > 3);
      if (parts.length > 0) {
        parts.forEach((p: string) => theftItems.push({ question: p, confirmed: true }));
      } else {
        theftItems.push({ question: theft, confirmed: true });
      }
    }
    if (theftItems.length === 0) theftItems.push({ question: "No workplace theft disclosed", confirmed: false });
  }
  branches.push({ name: "Theft at Work", maxScore: 5, items: theftItems, score: theftItems.filter(i => i.confirmed).length });

  // Fraud
  const fraudItems = getAdmissionItems("fraud");
  if (fraudItems.length === 0) {
    const otherAdmissions = disclosure.OtherNotableAdmissions || disclosure.otherNotableAdmissions || "";
    if (isMeaningful(otherAdmissions) && otherAdmissions.toLowerCase().includes("fraud")) {
      fraudItems.push({ question: `Fraud disclosed: ${otherAdmissions}`, confirmed: true });
    }
    if (fraudItems.length === 0) fraudItems.push({ question: "No fraud disclosed", confirmed: false });
  }
  branches.push({ name: "Fraud", maxScore: 17, items: fraudItems, score: fraudItems.filter(i => i.confirmed).length });

  // Bribery
  const briberyItems = getAdmissionItems("bribery");
  if (briberyItems.length === 0) {
    const briberyPaid = disclosure.BriberyPaid || disclosure.briberyPaid || "";
    const briberyAccepted = disclosure.BriberyAccepted || disclosure.briberyAccepted || "";
    if (isMeaningful(briberyPaid)) briberyItems.push({ question: `Bribery paid: ${briberyPaid}`, confirmed: true });
    if (isMeaningful(briberyAccepted)) briberyItems.push({ question: `Bribery accepted: ${briberyAccepted}`, confirmed: true });
    if (briberyItems.length === 0) briberyItems.push({ question: "No bribery disclosed", confirmed: false });
  }
  branches.push({ name: "Bribery", maxScore: 8, items: briberyItems, score: briberyItems.filter(i => i.confirmed).length });

  // Organized Crime
  const orgItems = getAdmissionItems("organized").concat(getAdmissionItems("organised"));
  if (orgItems.length === 0) {
    const orgCrime = disclosure.OrganisedCrimeLinks || disclosure.organisedCrimeLinks || "";
    if (isMeaningful(orgCrime)) orgItems.push({ question: `Organized crime links: ${orgCrime}`, confirmed: true });
    if (orgItems.length === 0) orgItems.push({ question: "No organized crime links disclosed", confirmed: false });
  }
  branches.push({ name: "Organized Crime", maxScore: 13, items: orgItems, score: orgItems.filter(i => i.confirmed).length });

  // Undetected Crimes
  const undetectedItems = getAdmissionItems("undetected");
  if (undetectedItems.length === 0) undetectedItems.push({ question: "No undetected crimes disclosed", confirmed: false });
  branches.push({ name: "Undetected Crimes", maxScore: 16, items: undetectedItems, score: undetectedItems.filter(i => i.confirmed).length });

  // Illegal Drug Involvement
  const drugItems = getAdmissionItems("drug");
  if (drugItems.length === 0) {
    const drugUse = disclosure.DrugUseHistory || disclosure.drugUseHistory || "";
    if (isMeaningful(drugUse)) drugItems.push({ question: `Drug use disclosed: ${drugUse}`, confirmed: true });
    if (drugItems.length === 0) drugItems.push({ question: "No drug involvement disclosed", confirmed: false });
  }
  branches.push({ name: "Illegal Drug Involvement", maxScore: 25, items: drugItems, score: drugItems.filter(i => i.confirmed).length });

  // General Overview
  const generalItems = getAdmissionItems("general");
  if (generalItems.length === 0) generalItems.push({ question: "No general items disclosed", confirmed: false });
  branches.push({ name: "General Overview", maxScore: 4, items: generalItems, score: generalItems.filter(i => i.confirmed).length });

  const grandTotal = branches.reduce((s, b) => s + b.score, 0);
  const maxGrandTotal = branches.reduce((s, b) => s + b.maxScore, 0);

  return { branches, grandTotal, maxGrandTotal };
};

interface IntegrityResult {
  score: number;
  result: string;
  totalQuestions: number;
  srCount: number;
  nsrCount: number;
  incCount: number;
}

const calculateIntegrityScore = (examQuestions: any[]): IntegrityResult => {
  const questions = examQuestions || [];
  const srCount = questions.filter((q: any) => (q.finding || "").toUpperCase() === "SR").length;
  const nsrCount = questions.filter((q: any) => (q.finding || "").toUpperCase() === "NSR").length;
  const incCount = questions.filter((q: any) => (q.finding || "").toUpperCase() === "INC").length;

  const hasSR = srCount > 0;
  const result = hasSR ? "Failed" : (incCount > 0 ? "Inconclusive" : "Passed");
  const score = hasSR ? 1 : 0;

  return { score, result, totalQuestions: questions.length, srCount, nsrCount, incCount };
};

// ─── Score Badge Component ───────────────────────────────────────────

const ScoreBadge = ({ score, max, label }: { score: number; max: number; label: string }) => {
  const ratio = max > 0 ? score / max : 0;
  let bg = "bg-green-500";
  if (ratio > 0.66) bg = "bg-red-500";
  else if (ratio > 0.33) bg = "bg-orange-500";
  else if (ratio > 0) bg = "bg-yellow-500";

  return (
    <div className="flex items-center gap-3">
      <Badge className={`${bg} text-white text-sm px-3 py-1`}>{score}/{max}</Badge>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
};

// ─── Branch Dropdown Component ───────────────────────────────────────

const BranchDropdown = ({ branch }: { branch: CriminalBranch }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasConfirmed = branch.score > 0;
  const confirmedItems = branch.items.filter(item => item.confirmed);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className={`flex items-center justify-between w-full p-3 rounded-lg border transition-colors ${hasConfirmed ? "bg-red-50/50 border-red-200 hover:bg-red-50" : "bg-muted/30 border-border hover:bg-muted/50"}`}>
        <div className="flex items-center gap-3">
          {hasConfirmed ? (
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          ) : (
            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{branch.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={hasConfirmed ? "destructive" : "secondary"} className="text-xs px-2 py-0.5">
            {branch.score}/{branch.maxScore}
          </Badge>
          {hasConfirmed && (
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          )}
        </div>
      </CollapsibleTrigger>
      {hasConfirmed && (
        <CollapsibleContent className="mt-1">
          <div className="ml-7 border-l-2 border-red-200 pl-3 space-y-1 py-1">
            {confirmedItems.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 py-1.5 text-sm">
                <span className="text-red-500 font-medium text-xs mt-0.5">YES</span>
                <span className="text-foreground">{item.question}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

// ─── Main Component ──────────────────────────────────────────────────

const RiskAnalysisDisplay = ({ polygraphReport, examQuestions, riskAnalysis }: RiskAnalysisDisplayProps) => {
  const employment = calculateEmploymentScore(polygraphReport);
  const financial = calculateFinancialScore(polygraphReport);
  const law = calculateLawScore(polygraphReport);
  const criminal = calculateCriminalActivityScore(polygraphReport);
  const integrity = calculateIntegrityScore(examQuestions);

  // Grand total
  const categoryTotal = employment.score + financial.score + law.score + integrity.score;
  const categoryMax = 3 + 3 + 5 + 1;
  const grandTotal = categoryTotal + criminal.grandTotal;
  const grandMax = categoryMax + criminal.maxGrandTotal;

  // Risk level based on percentage
  const pct = grandMax > 0 ? (grandTotal / grandMax) * 100 : 0;
  let riskLevel = "LOW RISK";
  let riskConfig = { color: "bg-green-500", textColor: "text-green-700", bgColor: "bg-green-50 border-green-200", Icon: CheckCircle2 };
  if (pct >= 50) {
    riskLevel = "VERY HIGH RISK";
    riskConfig = { color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50 border-red-200", Icon: XCircle };
  } else if (pct >= 25) {
    riskLevel = "HIGH RISK";
    riskConfig = { color: "bg-orange-500", textColor: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", Icon: AlertTriangle };
  } else if (pct >= 10) {
    riskLevel = "MEDIUM RISK";
    riskConfig = { color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50 border-yellow-200", Icon: AlertTriangle };
  }

  // Key concerns
  const concerns: string[] = [];
  if (employment.score >= 2) concerns.push(`Job instability: ${employment.label} (avg tenure ${formatMonths(employment.avgMonths)})`);
  if (employment.hasDisciplinary) concerns.push(`Disciplinary conduct noted: ${employment.disciplinaryDetails}`);
  if (financial.score >= 2) concerns.push(`Financial pressure: ${financial.label}`);
  if (financial.blacklisted) concerns.push("Candidate is blacklisted");
  if (law.personalArrested) concerns.push("Personal arrest disclosed");
  if (law.personalConvicted) concerns.push("Personal conviction disclosed");
  if (law.familyIssues.length > 0) concerns.push(`${law.familyIssues.length} family member(s) with criminal history`);
  if (criminal.grandTotal > 0) {
    criminal.branches.filter(b => b.score > 0).forEach(b => {
      concerns.push(`${b.name}: ${b.score} confirmation(s)`);
    });
  }
  if (integrity.score > 0) concerns.push(`Polygraph result: ${integrity.result}`);

  // Recommendations (vetting options only, not rehabilitation)
  const recommendations: string[] = [];
  if (employment.score >= 2) recommendations.push("Employment verification and reference checks recommended");
  if (financial.score >= 2) recommendations.push("Credit and financial background check recommended");
  if (financial.blacklisted) recommendations.push("In-depth credit bureau verification recommended");
  if (law.score >= 2) recommendations.push("Criminal record verification recommended");
  if (criminal.grandTotal > 5) recommendations.push("Periodic polygraph re-screening recommended");
  if (integrity.score > 0) recommendations.push("Follow-up polygraph examination recommended");
  if (concerns.length === 0) recommendations.push("No additional vetting required");

  // Chart data for employment
  const employmentChartData = employment.jobs.map((j, i) => ({
    name: j.company.length > 15 ? j.company.substring(0, 15) + "…" : j.company,
    duration: j.durationMonths,
    fill: getBarColor(j.durationMonths),
  }));

  // Chart data for financial
  const financialChartData = financial.currentAccounts
    .filter(a => a.amount > 0)
    .map(a => ({
      name: a.name.length > 12 ? a.name.substring(0, 12) + "…" : a.name,
      amount: a.amount,
    }));

  // Radar chart data for criminal activity (normalized to percentage for consistent axes)
  const criminalRadarData = criminal.branches.map(b => ({
    branch: b.name.replace("Illegal Drug Involvement", "Drug Involvement").replace("General Overview", "General"),
    pct: b.maxScore > 0 ? Math.round((b.score / b.maxScore) * 100) : 0,
    score: b.score,
    max: b.maxScore,
    fullMark: 100,
  }));

  // Category summary for law encounters chart
  const lawChartData = [
    { name: "Personal", value: (law.personalArrested || law.personalConvicted || law.personalExpungement) ? 1 : 0, fill: law.personalArrested ? "#ef4444" : "#22c55e" },
    { name: "Family", value: law.familyIssues.length > 0 ? 1 : 0, fill: law.familyIssues.length > 0 ? "#f97316" : "#22c55e" },
    { name: "Friends", value: law.friendIssues.length > 0 ? 1 : 0, fill: law.friendIssues.length > 0 ? "#f97316" : "#22c55e" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Overall Risk Summary ── */}
      <Card className={`border-2 ${riskConfig.bgColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <riskConfig.Icon className={`h-10 w-10 ${riskConfig.textColor}`} />
              <div>
                <p className="text-sm text-muted-foreground">Overall Risk Score</p>
                <p className="text-3xl font-bold">{grandTotal} <span className="text-lg text-muted-foreground">/ {grandMax}</span></p>
              </div>
            </div>
            <Badge className={`${riskConfig.color} text-white text-lg px-5 py-2`}>
              {riskLevel}
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            <div className="text-center p-2 rounded-lg bg-background/80 border">
              <p className="text-lg font-bold">{employment.score}/3</p>
              <p className="text-[10px] text-muted-foreground uppercase">Employment</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/80 border">
              <p className="text-lg font-bold">{financial.score}/3</p>
              <p className="text-[10px] text-muted-foreground uppercase">Financial</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/80 border">
              <p className="text-lg font-bold">{law.score}/5</p>
              <p className="text-[10px] text-muted-foreground uppercase">Law</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/80 border">
              <p className="text-lg font-bold">{criminal.grandTotal}/{criminal.maxGrandTotal}</p>
              <p className="text-[10px] text-muted-foreground uppercase">Criminal</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-background/80 border">
              <p className="text-lg font-bold">{integrity.score}/1</p>
              <p className="text-[10px] text-muted-foreground uppercase">Integrity</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 1. Employment (Job Stability) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Employment — Job Stability
            </div>
            <ScoreBadge score={employment.score} max={3} label={employment.label} />
          </CardTitle>
          <CardDescription>Last {employment.jobs.length} position{employment.jobs.length !== 1 ? "s" : ""} analyzed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-xl font-bold">{formatMonths(employment.totalMonths)}</p>
              <p className="text-xs text-muted-foreground">Total Duration</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className={`text-xl font-bold ${getScoreColor(employment.score, 3)}`}>{formatMonths(employment.avgMonths)}</p>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm font-medium capitalize">{employment.mostCommonReason}</p>
              <p className="text-xs text-muted-foreground">Common Reason</p>
            </div>
          </div>

          {/* Job duration chart */}
          {employmentChartData.length > 0 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employmentChartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatMonths(v)} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [formatMonths(value), "Duration"]} />
                  <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                    {employmentChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Disciplinary conduct */}
          <div className={`p-3 rounded-lg border ${employment.hasDisciplinary ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <div className="flex items-center gap-2">
              {employment.hasDisciplinary ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <span className="text-sm font-medium">
                Disciplinary Conduct: {employment.hasDisciplinary ? "Issues Noted" : "None Disclosed"}
              </span>
            </div>
            {employment.hasDisciplinary && (
              <p className="text-xs text-muted-foreground mt-1 ml-6">{employment.disciplinaryDetails}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Financial Circumstances ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Financial Circumstances
            </div>
            <ScoreBadge score={financial.score} max={3} label={financial.label} />
          </CardTitle>
          <CardDescription>Financial pressure assessment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Monthly obligations */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-xl font-bold">R{financial.estimatedMonthly.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Est. Monthly Payment</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-xl font-bold">{financial.currentAccounts.length}</p>
              <p className="text-xs text-muted-foreground">Active Accounts</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-xl font-bold">R{financial.totalHistoricalDebt.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Historical Debt</p>
            </div>
            <div className={`text-center p-3 rounded-lg border ${financial.blacklisted ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <p className={`text-xl font-bold ${financial.blacklisted ? "text-red-600" : "text-green-600"}`}>
                {financial.blacklisted ? "Yes" : "No"}
              </p>
              <p className="text-xs text-muted-foreground">Blacklisted</p>
            </div>
          </div>

          {/* Current accounts chart */}
          {financialChartData.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Monthly Account Payments</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialChartData} margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `R${v}`} />
                    <Tooltip formatter={(value: number) => [`R${value.toLocaleString()}`, "Monthly"]} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Historical debt */}
          {financial.historicalDebt.length > 0 && (
            <div className="p-3 rounded-lg border bg-orange-50 border-orange-200">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-orange-600" />
                Historical Unpaid Debt
              </p>
              <div className="text-sm">
                <div>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">R{financial.totalHistoricalDebt.toLocaleString()}</span>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {financial.historicalDebt.map((d, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>{d.name}</span>
                    <span className="font-medium">R{d.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit rating */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Credit Obligation Rating:</span>
            <Badge variant={financial.creditRating === "Good" ? "default" : financial.creditRating === "Fair" ? "secondary" : "destructive"}>
              {financial.creditRating}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Law Encounters ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Encounters with the Law
            </div>
            <ScoreBadge score={law.score} max={5} label={law.label} />
          </CardTitle>
          <CardDescription>Personal, family, and friend encounters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual indicators */}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lawChartData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(v) => v === 0 ? "Clear" : "Flagged"} />
                <Tooltip formatter={(value: number) => [value === 0 ? "No encounters" : "Encounters noted", "Status"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {lawChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Personal details */}
          <div className={`p-3 rounded-lg border ${law.personalArrested || law.personalConvicted ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
            <p className="text-sm font-medium mb-1">Personal</p>
            <p className="text-xs text-muted-foreground">{law.personalDetails}</p>
          </div>

          {/* Family issues */}
          {law.familyIssues.length > 0 && (
            <div className="p-3 rounded-lg border bg-orange-50 border-orange-200">
              <p className="text-sm font-medium mb-2">Family Members with Criminal History</p>
              {law.familyIssues.map((f, i) => (
                <div key={i} className="text-xs mb-1">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted-foreground"> ({f.relationship})</span>
                  <span>: {f.details}</span>
                </div>
              ))}
            </div>
          )}

          {/* Friend issues */}
          {law.friendIssues.length > 0 && (
            <div className="p-3 rounded-lg border bg-orange-50 border-orange-200">
              <p className="text-sm font-medium mb-2">Friends/Associates with Criminal History</p>
              {law.friendIssues.map((f, i) => (
                <div key={i} className="text-xs mb-1">
                  <span className="font-medium">{f.name}</span>
                  <span>: {f.details}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 4. Criminal Activity ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Criminal Activity
            </div>
            <div className="flex items-center gap-3">
              <Badge className={`${criminal.grandTotal > 0 ? "bg-red-500" : "bg-green-500"} text-white text-sm px-3 py-1`}>
                {criminal.grandTotal}/{criminal.maxGrandTotal}
              </Badge>
              <span className="text-sm text-muted-foreground">Grand Total</span>
            </div>
          </CardTitle>
          <CardDescription>
            {criminal.branches.filter(b => b.score > 0).length} of 7 branches flagged
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Radar chart */}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={criminalRadarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="branch" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Confirmed %" dataKey="pct" stroke="#ef4444" fill="#ef4444" fillOpacity={0.35} dot={{ r: 3, fill: "#ef4444" }} />
                <Tooltip content={({ payload, label }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-2.5 text-sm">
                      <p className="font-medium mb-1">{d?.branch}</p>
                      <p className="text-red-600">Confirmed: {d?.score} / {d?.max}</p>
                      <p className="text-muted-foreground">{d?.pct}% flagged</p>
                    </div>
                  );
                }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Flagged branches first, then clean ones */}
          <div className="space-y-2">
            {criminal.branches.filter(b => b.score > 0).map((branch, idx) => (
              <BranchDropdown key={`flagged-${idx}`} branch={branch} />
            ))}
            {criminal.branches.filter(b => b.score === 0).map((branch, idx) => (
              <BranchDropdown key={`clean-${idx}`} branch={branch} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Integrity (Polygraph) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              Integrity — Polygraph Result
            </div>
            <ScoreBadge score={integrity.score} max={1} label={integrity.result} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50 border">
              <p className="text-2xl font-bold">{integrity.totalQuestions}</p>
              <p className="text-xs text-muted-foreground">Questions</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-2xl font-bold text-green-700">{integrity.nsrCount}</p>
              <p className="text-xs text-green-600">NSR</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-2xl font-bold text-red-700">{integrity.srCount}</p>
              <p className="text-xs text-red-600">SR</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-2xl font-bold text-yellow-700">{integrity.incCount}</p>
              <p className="text-xs text-yellow-600">INC</p>
            </div>
          </div>
          <div className="flex items-center justify-center mt-4">
            <Badge className={`text-sm px-4 py-1 ${
              integrity.result === "Passed" ? "bg-green-500" :
              integrity.result === "Failed" ? "bg-red-500" : "bg-yellow-500"
            } text-white`}>
              Overall: {integrity.result}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Key Concerns ── */}
      {concerns.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 text-lg">
              <AlertTriangle className="h-5 w-5" />
              Key Concerns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {concerns.map((c, i) => (
                <li key={i} className="text-sm">{c}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 text-lg">
              <Shield className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {recommendations.map((r, i) => (
                <li key={i} className="text-sm">{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RiskAnalysisDisplay;
