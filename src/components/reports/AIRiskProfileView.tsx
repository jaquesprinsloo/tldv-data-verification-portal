// PreAppliCheck-style risk profile renderer used when polygraph_reports.risk_analysis
// contains the AI-generated 5-category shape (employment/financial/legal/criminal/integrity
// + totalScore + riskLevel + summary). Mirrors the visual conventions and absolute
// threshold tiers (LOW 0-7, MEDIUM 8-17, HIGH 18-30, VERY HIGH 31+).

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase, DollarSign, Scale, AlertCircle, Fingerprint,
  Shield, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";

interface AIRiskProfileViewProps {
  profile: any;
}

const TIER_CONFIG: Record<
  string,
  { color: string; textColor: string; bgColor: string; Icon: any }
> = {
  LOW: {
    color: "bg-green-500",
    textColor: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    Icon: CheckCircle2,
  },
  MEDIUM: {
    color: "bg-yellow-500",
    textColor: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200",
    Icon: AlertTriangle,
  },
  HIGH: {
    color: "bg-orange-500",
    textColor: "text-orange-700",
    bgColor: "bg-orange-50 border-orange-200",
    Icon: AlertTriangle,
  },
  "VERY HIGH": {
    color: "bg-red-500",
    textColor: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
    Icon: XCircle,
  },
};

const CategoryCard = ({
  icon: Icon,
  title,
  data,
  max,
}: {
  icon: any;
  title: string;
  data: any;
  max: number;
}) => {
  if (!data) return null;
  const score = Number(data.score || 0);
  const ratio = max > 0 ? score / max : 0;
  const tone = ratio === 0
    ? "bg-green-50 border-green-200"
    : ratio <= 0.33
    ? "bg-yellow-50 border-yellow-200"
    : ratio <= 0.66
    ? "bg-orange-50 border-orange-200"
    : "bg-red-50 border-red-200";

  return (
    <Card className={`border-2 ${tone}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </span>
          <Badge variant="outline" className="font-bold">
            {score} / {max}
          </Badge>
        </CardTitle>
        {data.label && (
          <CardDescription className="font-medium">{data.label}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {data.reasoning && (
          <p className="text-sm text-foreground/90 leading-relaxed">
            {data.reasoning}
          </p>
        )}

        {/* Employment job list */}
        {Array.isArray(data.jobs) && data.jobs.length > 0 && (
          <div className="space-y-1.5">
            {data.jobs.map((j: any, i: number) => (
              <div
                key={i}
                className="flex justify-between items-center p-2 rounded bg-background/60 text-xs border"
              >
                <div>
                  <div className="font-medium">{j.company}</div>
                  {j.position && (
                    <div className="text-muted-foreground">{j.position}</div>
                  )}
                </div>
                <div className="text-right">
                  <div>{(Number(j.durationMonths || 0) / 12).toFixed(1)} yrs</div>
                  {j.reason && (
                    <div className="text-muted-foreground">{j.reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Financial accounts */}
        {Array.isArray(data.currentAccounts) && data.currentAccounts.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Current accounts
            </p>
            {data.currentAccounts.map((a: any, i: number) => (
              <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-background/60 border">
                <span>{a.name}</span>
                <span className="font-medium">
                  R{Number(a.amount || 0).toLocaleString()} {a.status ? `· ${a.status}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {Array.isArray(data.historicalDebt) && data.historicalDebt.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Historical debt
            </p>
            {data.historicalDebt.map((d: any, i: number) => (
              <div key={i} className="flex justify-between text-xs p-1.5 rounded bg-background/60 border">
                <span>{d.name}</span>
                <span className="font-medium">R{Number(d.amount || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legal flags */}
        {data.personalArrested !== undefined && (
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {[
              ["Personal arrest", data.personalArrested],
              ["Personal conviction", data.personalConvicted],
              ["Bribe involvement", data.paidBribe],
              ["Pending cases", data.hasPendingCases],
              ["Family/friend issues", data.hasFamilyFriendIssues],
            ].map(([label, val]: any, i) => (
              <div
                key={i}
                className={`p-1.5 rounded border flex justify-between ${
                  val ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                }`}
              >
                <span>{label}</span>
                <span className="font-medium">{val ? "Yes" : "No"}</span>
              </div>
            ))}
          </div>
        )}

        {/* Criminal confirmed items */}
        {Array.isArray(data.confirmedItems) && data.confirmedItems.length > 0 && (
          <ul className="text-xs space-y-1 list-disc list-inside text-foreground/80">
            {data.confirmedItems.map((it: string, i: number) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export const AIRiskProfileView = ({ profile }: AIRiskProfileViewProps) => {
  const total = Number(profile.totalScore || 0);
  const tier = (profile.riskLevel || "LOW").toUpperCase();
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.LOW;
  const TierIcon = cfg.Icon;
  // Max possible: 3+3+5+28+1
  const grandMax = 40;
  const pct = Math.min(100, (total / grandMax) * 100);

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <Card className={`border-2 ${cfg.bgColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <TierIcon className={`h-10 w-10 ${cfg.textColor}`} />
              <div>
                <p className="text-sm text-muted-foreground">
                  Overall Risk Score
                </p>
                <p className="text-3xl font-bold">
                  {total}{" "}
                  <span className="text-lg text-muted-foreground">
                    / {grandMax}
                  </span>
                </p>
              </div>
            </div>
            <Badge className={`${cfg.color} text-white text-lg px-5 py-2`}>
              {tier} RISK
            </Badge>
          </div>
          <Progress value={pct} className="mt-4 h-2" />
          <div className="mt-4 grid grid-cols-5 gap-2">
            {[
              ["Employment", profile.employment?.score, 3],
              ["Financial", profile.financial?.score, 3],
              ["Legal", profile.legal?.score, 5],
              ["Criminal", profile.criminal?.score, 28],
              ["Integrity", profile.integrity?.score, 1],
            ].map(([name, s, m]: any, i) => (
              <div
                key={i}
                className="text-center p-2 rounded-lg bg-background/80 border"
              >
                <p className="text-lg font-bold">
                  {Number(s || 0)}/{m}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase">
                  {name}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary narrative */}
      {profile.summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              Considerations for Employment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
              {profile.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key findings */}
      {Array.isArray(profile.keyFindings) && profile.keyFindings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Key Findings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {profile.keyFindings.map((f: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 5 category cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryCard
          icon={Briefcase}
          title="Employment — Job Stability"
          data={profile.employment}
          max={3}
        />
        <CategoryCard
          icon={DollarSign}
          title="Financial Pressure"
          data={profile.financial}
          max={3}
        />
        <CategoryCard
          icon={Scale}
          title="Legal Encounters"
          data={profile.legal}
          max={5}
        />
        <CategoryCard
          icon={AlertCircle}
          title="Criminal Activity"
          data={profile.criminal}
          max={28}
        />
        <CategoryCard
          icon={Fingerprint}
          title="Integrity (Polygraph)"
          data={profile.integrity}
          max={1}
        />
      </div>
    </div>
  );
};

export default AIRiskProfileView;
