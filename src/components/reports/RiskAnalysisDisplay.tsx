import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Shield, XCircle, FileText, User, Briefcase, Users, DollarSign, Scale, AlertCircle, Activity } from "lucide-react";

interface RiskAnalysis {
  CriminalDishonestyScore?: {
    TheftAdmission?: number;
    PriorDishonestDismissal?: number;
    ArrestsLast5Years?: number;
    Convictions?: number;
    Total?: number;
  };
  PolygraphIndicatorsScore?: {
    SROnSeriousCrimes?: number;
    INCOnRelevant?: number;
    Total?: number;
  };
  FinancialRiskScore?: {
    BadDebtArrears?: number;
    MultipleDebts?: number;
    GamblingRelated?: number;
    Total?: number;
  };
  BriberyCorruptionScore?: {
    PersonalBenefit?: number;
    MinorBribe?: number;
    Total?: number;
  };
  OrganisedCrimeScore?: {
    DirectInvolvement?: number;
    FamilyFriendContact?: number;
    Total?: number;
  };
  SubstanceUseScore?: {
    RecentActiveAbuse?: number;
    HistoricalExperimentation?: number;
    Total?: number;
  };
  JobStabilityScore?: {
    JobHopping?: number;
    DismissalsAllegations?: number;
    Total?: number;
  };
  AdministrativeIntegrityScore?: {
    FalseCVClaims?: number;
    UnpaidFines?: number;
    Total?: number;
  };
  TotalRiskScore?: number;
  RiskLevel?: string;
  KeyRiskConcerns?: string[];
  RecommendedMitigations?: string[];
  NarrativeReport?: string;
}

interface ExtractedData {
  educationHistory?: any;
  employmentHistory?: any;
  familyCriminalHistory?: any;
  friendCriminalHistory?: any;
  financialCircumstances?: any;
  permitsLicensing?: any;
  personalLawEncounters?: any;
  disclosure?: any;
  examQuestions?: any[];
}

interface RiskAnalysisDisplayProps {
  riskAnalysis: RiskAnalysis;
  extractedData?: ExtractedData;
}

const RiskAnalysisDisplay = ({ riskAnalysis, extractedData }: RiskAnalysisDisplayProps) => {
  const getRiskLevelConfig = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'LOW':
        return { color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', icon: CheckCircle2 };
      case 'MEDIUM':
        return { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50', icon: AlertTriangle };
      case 'HIGH':
        return { color: 'bg-orange-500', textColor: 'text-orange-700', bgColor: 'bg-orange-50', icon: AlertTriangle };
      case 'VERY HIGH':
        return { color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle };
      default:
        return { color: 'bg-gray-500', textColor: 'text-gray-700', bgColor: 'bg-gray-50', icon: Shield };
    }
  };

  // Normalize risk level display - map UNACCEPTABLE to VERY HIGH
  const normalizedRiskLevel = (riskAnalysis.RiskLevel || '').toUpperCase().replace('UNACCEPTABLE', 'VERY HIGH');
  const config = getRiskLevelConfig(normalizedRiskLevel);
  const IconComponent = config.icon;

  const scoreCategories = [
    { name: 'Criminal/Dishonesty', score: riskAnalysis.CriminalDishonestyScore?.Total || 0, max: 12 },
    { name: 'Polygraph Indicators', score: riskAnalysis.PolygraphIndicatorsScore?.Total || 0, max: 8 },
    { name: 'Financial Risk', score: riskAnalysis.FinancialRiskScore?.Total || 0, max: 6 },
    { name: 'Bribery/Corruption', score: riskAnalysis.BriberyCorruptionScore?.Total || 0, max: 6 },
    { name: 'Organised Crime', score: riskAnalysis.OrganisedCrimeScore?.Total || 0, max: 6 },
    { name: 'Substance Use', score: riskAnalysis.SubstanceUseScore?.Total || 0, max: 4 },
    { name: 'Job Stability', score: riskAnalysis.JobStabilityScore?.Total || 0, max: 4 },
    { name: 'Administrative Integrity', score: riskAnalysis.AdministrativeIntegrityScore?.Total || 0, max: 4 },
  ];

  // Generate background summary from extracted data
  const generateBackgroundSummary = () => {
    if (!extractedData) return null;

    const sections: { title: string; icon: React.ReactNode; content: string }[] = [];

    // Education History
    if (extractedData.educationHistory) {
      const edu = extractedData.educationHistory;
      let summary = "";
      if (typeof edu === 'string') {
        summary = edu;
      } else if (Array.isArray(edu)) {
        summary = edu.map((e: any) => `${e.institution || e.school || ''} (${e.qualification || e.degree || e.year || ''})`).filter(Boolean).join('; ') || 'No education details disclosed.';
      } else {
        summary = edu.summary || edu.details || 'No education details disclosed.';
      }
      if (summary && summary !== 'Not Disclosed') {
        sections.push({ title: 'Education', icon: <FileText className="h-4 w-4" />, content: summary });
      }
    }

    // Employment History
    if (extractedData.employmentHistory) {
      const emp = extractedData.employmentHistory;
      let summary = "";
      if (typeof emp === 'string') {
        summary = emp;
      } else if (Array.isArray(emp)) {
        summary = emp.map((e: any) => `${e.company || e.employer || ''} - ${e.position || e.role || ''} (${e.period || e.duration || ''})`).filter(Boolean).join('; ') || 'No employment history disclosed.';
      } else {
        summary = emp.summary || emp.details || 'No employment history disclosed.';
      }
      if (summary && summary !== 'Not Disclosed') {
        sections.push({ title: 'Employment History', icon: <Briefcase className="h-4 w-4" />, content: summary });
      }
    }

    // Family & Friend Background
    const familyFriend: string[] = [];
    if (extractedData.familyCriminalHistory) {
      const fam = extractedData.familyCriminalHistory;
      if (typeof fam === 'string' && fam !== 'Not Disclosed') {
        familyFriend.push(`Family: ${fam}`);
      } else if (fam.summary || fam.details) {
        familyFriend.push(`Family: ${fam.summary || fam.details}`);
      }
    }
    if (extractedData.friendCriminalHistory) {
      const fri = extractedData.friendCriminalHistory;
      if (typeof fri === 'string' && fri !== 'Not Disclosed') {
        familyFriend.push(`Friends: ${fri}`);
      } else if (fri.summary || fri.details) {
        familyFriend.push(`Friends: ${fri.summary || fri.details}`);
      }
    }
    if (familyFriend.length > 0) {
      sections.push({ title: 'Family & Friend Background', icon: <Users className="h-4 w-4" />, content: familyFriend.join(' ') });
    }

    // Financial Circumstances
    if (extractedData.financialCircumstances) {
      const fin = extractedData.financialCircumstances;
      let summary = "";
      if (typeof fin === 'string') {
        summary = fin;
      } else {
        const parts: string[] = [];
        if (fin.activeDebt) parts.push(`Active debt: ${fin.activeDebt}`);
        if (fin.arrears) parts.push(`Arrears: ${fin.arrears}`);
        if (fin.blacklisting) parts.push(`Blacklisting: ${fin.blacklisting}`);
        if (fin.gambling) parts.push(`Gambling impact: ${fin.gambling}`);
        if (fin.summary) parts.push(fin.summary);
        summary = parts.join('. ') || 'No financial concerns disclosed.';
      }
      if (summary && summary !== 'Not Disclosed') {
        sections.push({ title: 'Financial Circumstances', icon: <DollarSign className="h-4 w-4" />, content: summary });
      }
    }

    // Permits & Licensing
    if (extractedData.permitsLicensing) {
      const perm = extractedData.permitsLicensing;
      let summary = "";
      if (typeof perm === 'string') {
        summary = perm;
      } else {
        summary = perm.summary || perm.details || JSON.stringify(perm);
      }
      if (summary && summary !== 'Not Disclosed' && summary !== '{}') {
        sections.push({ title: 'Permits & Licensing', icon: <Scale className="h-4 w-4" />, content: summary });
      }
    }

    // Personal Encounters with the Law
    if (extractedData.personalLawEncounters) {
      const law = extractedData.personalLawEncounters;
      let summary = "";
      if (typeof law === 'string') {
        summary = law;
      } else {
        const parts: string[] = [];
        if (law.arrests) parts.push(`Arrests: ${law.arrests}`);
        if (law.convictions) parts.push(`Convictions: ${law.convictions}`);
        if (law.courtCases) parts.push(`Court cases: ${law.courtCases}`);
        if (law.summary) parts.push(law.summary);
        summary = parts.join('. ') || 'No law encounters disclosed.';
      }
      if (summary && summary !== 'Not Disclosed') {
        sections.push({ title: 'Encounters with the Law', icon: <AlertCircle className="h-4 w-4" />, content: summary });
      }
    }

    // Past Criminal Activity (from disclosure)
    if (extractedData.disclosure) {
      const disc = extractedData.disclosure;
      const criminalParts: string[] = [];
      if (disc.workplaceTheft && disc.workplaceTheft !== 'Not Disclosed') {
        criminalParts.push(`Workplace theft: ${disc.workplaceTheft}`);
      }
      if (disc.bribery && disc.bribery !== 'Not Disclosed') {
        criminalParts.push(`Bribery: ${disc.bribery}`);
      }
      if (disc.drugUse && disc.drugUse !== 'Not Disclosed') {
        criminalParts.push(`Drug use history: ${disc.drugUse}`);
      }
      if (disc.organisedCrime && disc.organisedCrime !== 'Not Disclosed') {
        criminalParts.push(`Organised crime links: ${disc.organisedCrime}`);
      }
      if (criminalParts.length > 0) {
        sections.push({ title: 'Past Criminal Activity', icon: <AlertTriangle className="h-4 w-4" />, content: criminalParts.join('. ') });
      }

      // General/Other Admissions
      const generalParts: string[] = [];
      if (disc.otherAdmissions && disc.otherAdmissions !== 'Not Disclosed') {
        generalParts.push(disc.otherAdmissions);
      }
      if (disc.general && disc.general !== 'Not Disclosed') {
        generalParts.push(disc.general);
      }
      if (generalParts.length > 0) {
        sections.push({ title: 'General Disclosures', icon: <User className="h-4 w-4" />, content: generalParts.join('. ') });
      }
    }

    return sections.length > 0 ? sections : null;
  };

  // Generate polygraph analysis summary
  const generatePolygraphAnalysis = () => {
    if (!extractedData?.examQuestions || extractedData.examQuestions.length === 0) return null;

    const questions = extractedData.examQuestions;
    const srCount = questions.filter((q: any) => (q.finding || q.result)?.toUpperCase() === 'SR').length;
    const nsrCount = questions.filter((q: any) => (q.finding || q.result)?.toUpperCase() === 'NSR').length;
    const incCount = questions.filter((q: any) => (q.finding || q.result)?.toUpperCase() === 'INC').length;

    let overallResult = 'Inconclusive';
    if (srCount > 0) overallResult = 'Failed';
    else if (incCount === 0 && nsrCount === questions.length) overallResult = 'Passed';

    return {
      totalQuestions: questions.length,
      srCount,
      nsrCount,
      incCount,
      overallResult,
      questions
    };
  };

  const backgroundSections = generateBackgroundSummary();
  const polygraphAnalysis = generatePolygraphAnalysis();

  return (
    <div className="space-y-6">
      {/* Report Breakdown Header */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Report Breakdown
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of the polygraph examination report
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Background Information Summary */}
      {backgroundSections && backgroundSections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Background Information</CardTitle>
            <CardDescription>Key points extracted from the candidate's disclosed information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {backgroundSections.map((section, index) => (
              <div key={index} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-primary">{section.icon}</span>
                  <h4 className="font-medium text-sm">{section.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground pl-6">{section.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Polygraph Analysis */}
      {polygraphAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Polygraph Analysis
            </CardTitle>
            <CardDescription>Examination results and findings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{polygraphAnalysis.totalQuestions}</p>
                <p className="text-xs text-muted-foreground">Total Questions</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50">
                <p className="text-2xl font-bold text-green-700">{polygraphAnalysis.nsrCount}</p>
                <p className="text-xs text-green-600">NSR (No Reaction)</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-red-700">{polygraphAnalysis.srCount}</p>
                <p className="text-xs text-red-600">SR (Significant)</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-50">
                <p className="text-2xl font-bold text-yellow-700">{polygraphAnalysis.incCount}</p>
                <p className="text-xs text-yellow-600">INC (Inconclusive)</p>
              </div>
            </div>
            <div className="flex items-center justify-center pt-2">
              <Badge 
                className={`text-sm px-4 py-1 ${
                  polygraphAnalysis.overallResult === 'Passed' ? 'bg-green-500' :
                  polygraphAnalysis.overallResult === 'Failed' ? 'bg-red-500' : 'bg-yellow-500'
                } text-white`}
              >
                Overall Result: {polygraphAnalysis.overallResult}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk Score Breakdown</CardTitle>
          <CardDescription>Category-by-category scoring analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary Badge */}
          <div className={`flex items-center justify-between p-4 rounded-lg ${config.bgColor}`}>
            <div className="flex items-center gap-3">
              <IconComponent className={`h-8 w-8 ${config.textColor}`} />
              <div>
                <p className="font-medium">Total Risk Score</p>
                <p className="text-2xl font-bold">{riskAnalysis.TotalRiskScore || 0} / 50</p>
              </div>
            </div>
            <Badge className={`${config.color} text-white text-lg px-4 py-2`}>
              {normalizedRiskLevel || 'N/A'}
            </Badge>
          </div>

          <Progress 
            value={(riskAnalysis.TotalRiskScore || 0) / 50 * 100} 
            className="h-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0-7 LOW</span>
            <span>8-17 MEDIUM</span>
            <span>18-30 HIGH</span>
            <span>31+ VERY HIGH</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            {scoreCategories.map((category) => (
              <div key={category.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{category.name}</span>
                  <span className="font-medium">{category.score} / {category.max}</span>
                </div>
                <Progress 
                  value={(category.score / category.max) * 100} 
                  className="h-2"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Risk Concerns */}
      {riskAnalysis.KeyRiskConcerns && riskAnalysis.KeyRiskConcerns.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 text-lg">
              <AlertTriangle className="h-5 w-5" />
              Key Concerns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {riskAnalysis.KeyRiskConcerns.map((concern, index) => (
                <li key={index} className="text-sm">{concern}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recommended Mitigations */}
      {riskAnalysis.RecommendedMitigations && riskAnalysis.RecommendedMitigations.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700 text-lg">
              <Shield className="h-5 w-5" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {riskAnalysis.RecommendedMitigations.map((mitigation, index) => (
                <li key={index} className="text-sm">{mitigation}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RiskAnalysisDisplay;
