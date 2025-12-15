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

  // Helper to format array or object into readable string
  const formatValue = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      if (value.length === 0) return '';
      return value.map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
          const parts: string[] = [];
          // Handle education objects
          if (item.Institution || item.institution || item.School || item.school) {
            parts.push(item.Institution || item.institution || item.School || item.school);
          }
          if (item.Qualification || item.qualification || item.Degree || item.degree) {
            parts.push(item.Qualification || item.qualification || item.Degree || item.degree);
          }
          if (item.Year || item.year || item.Period || item.period) {
            parts.push(`(${item.Year || item.year || item.Period || item.period})`);
          }
          // Handle employment objects
          if (item.Company || item.company || item.Employer || item.employer) {
            parts.push(item.Company || item.company || item.Employer || item.employer);
          }
          if (item.Position || item.position || item.Role || item.role || item.Title || item.title) {
            parts.push(`- ${item.Position || item.position || item.Role || item.role || item.Title || item.title}`);
          }
          if (item.Duration || item.duration || item.Dates || item.dates) {
            parts.push(`(${item.Duration || item.duration || item.Dates || item.dates})`);
          }
          if (item.Reason || item.reason || item.ReasonForLeaving || item.reasonForLeaving) {
            parts.push(`Reason: ${item.Reason || item.reason || item.ReasonForLeaving || item.reasonForLeaving}`);
          }
          // Handle family/friend objects
          if (item.Name || item.name) parts.push(item.Name || item.name);
          if (item.Relationship || item.relationship) parts.push(`(${item.Relationship || item.relationship})`);
          if (item.CriminalHistory || item.criminalHistory || item.History || item.history) {
            parts.push(item.CriminalHistory || item.criminalHistory || item.History || item.history);
          }
          if (parts.length === 0) {
            return Object.entries(item)
              .filter(([_, v]) => v && v !== 'Not Disclosed' && v !== 'N/A')
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
          }
          return parts.filter(Boolean).join(' ');
        }
        return String(item);
      }).filter(Boolean).join('; ');
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .filter(([_, v]) => v && v !== 'Not Disclosed' && v !== 'N/A' && v !== '' && !(Array.isArray(v) && v.length === 0));
      if (entries.length === 0) return '';
      return entries.map(([k, v]) => {
        const formattedKey = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        const formattedValue = formatValue(v);
        return formattedValue ? `${formattedKey}: ${formattedValue}` : null;
      }).filter(Boolean).join('. ');
    }
    return String(value);
  };

  // Check if value is meaningful (not empty, not "Not Disclosed", etc.)
  const isMeaningful = (value: any): boolean => {
    if (!value) return false;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower !== '' && lower !== 'not disclosed' && lower !== 'n/a' && lower !== 'none' && lower !== '{}' && lower !== '[]';
    }
    if (Array.isArray(value)) return value.length > 0 && value.some(isMeaningful);
    if (typeof value === 'object') return Object.values(value).some(isMeaningful);
    return true;
  };

  // Generate background summary from extracted data
  const generateBackgroundSummary = () => {
    if (!extractedData) return null;

    const sections: { title: string; icon: React.ReactNode; content: string }[] = [];

    // Education History
    if (isMeaningful(extractedData.educationHistory)) {
      const content = formatValue(extractedData.educationHistory);
      if (content) {
        sections.push({ title: 'Education', icon: <FileText className="h-4 w-4" />, content });
      }
    }

    // Employment History
    if (isMeaningful(extractedData.employmentHistory)) {
      const content = formatValue(extractedData.employmentHistory);
      if (content) {
        sections.push({ title: 'Employment History', icon: <Briefcase className="h-4 w-4" />, content });
      }
    }

    // Family Criminal History
    if (isMeaningful(extractedData.familyCriminalHistory)) {
      const content = formatValue(extractedData.familyCriminalHistory);
      if (content) {
        sections.push({ title: 'Family Background', icon: <Users className="h-4 w-4" />, content });
      }
    }

    // Friend Criminal History  
    if (isMeaningful(extractedData.friendCriminalHistory)) {
      const content = formatValue(extractedData.friendCriminalHistory);
      if (content) {
        sections.push({ title: 'Friend Background', icon: <Users className="h-4 w-4" />, content });
      }
    }

    // Financial Circumstances
    if (isMeaningful(extractedData.financialCircumstances)) {
      const content = formatValue(extractedData.financialCircumstances);
      if (content) {
        sections.push({ title: 'Financial Circumstances', icon: <DollarSign className="h-4 w-4" />, content });
      }
    }

    // Permits & Licensing
    if (isMeaningful(extractedData.permitsLicensing)) {
      const content = formatValue(extractedData.permitsLicensing);
      if (content) {
        sections.push({ title: 'Permits & Licensing', icon: <Scale className="h-4 w-4" />, content });
      }
    }

    // Personal Encounters with the Law
    if (isMeaningful(extractedData.personalLawEncounters)) {
      const content = formatValue(extractedData.personalLawEncounters);
      if (content) {
        sections.push({ title: 'Encounters with the Law', icon: <AlertCircle className="h-4 w-4" />, content });
      }
    }

    // Past Criminal Activity (from disclosure)
    if (extractedData.disclosure) {
      const disc = extractedData.disclosure;
      const criminalParts: string[] = [];
      
      // Handle both PascalCase and camelCase keys
      const workplaceTheft = disc.WorkplaceTheft || disc.workplaceTheft;
      const briberyPaid = disc.BriberyPaid || disc.briberyPaid;
      const briberyAccepted = disc.BriberyAccepted || disc.briberyAccepted;
      const drugUse = disc.DrugUseHistory || disc.drugUseHistory || disc.drugUse;
      const organisedCrime = disc.OrganisedCrimeLinks || disc.organisedCrimeLinks || disc.organisedCrime;
      const arrests = disc.Arrests || disc.arrests;
      const convictions = disc.Convictions || disc.convictions;
      const courtCases = disc.CourtCases || disc.courtCases;
      
      if (isMeaningful(workplaceTheft)) criminalParts.push(`Workplace theft: ${workplaceTheft}`);
      if (isMeaningful(briberyPaid)) criminalParts.push(`Bribery paid: ${briberyPaid}`);
      if (isMeaningful(briberyAccepted)) criminalParts.push(`Bribery accepted: ${briberyAccepted}`);
      if (isMeaningful(drugUse)) criminalParts.push(`Drug use: ${drugUse}`);
      if (isMeaningful(organisedCrime)) criminalParts.push(`Organised crime: ${organisedCrime}`);
      if (isMeaningful(arrests)) criminalParts.push(`Arrests: ${arrests}`);
      if (isMeaningful(convictions)) criminalParts.push(`Convictions: ${convictions}`);
      if (isMeaningful(courtCases)) criminalParts.push(`Court cases: ${courtCases}`);
      
      if (criminalParts.length > 0) {
        sections.push({ title: 'Past Criminal Activity', icon: <AlertTriangle className="h-4 w-4" />, content: criminalParts.join('. ') });
      }

      // General/Other Disclosures
      const generalParts: string[] = [];
      const otherAdmissions = disc.OtherNotableAdmissions || disc.otherNotableAdmissions || disc.otherAdmissions;
      const driverLicense = disc.DriverLicenseAndBribes || disc.driverLicenseAndBribes;
      const financialStatus = disc.FinancialStatus || disc.financialStatus;
      const familyCriminal = disc.FamilyCriminalHistory || disc.familyCriminalHistory;
      const friendCriminal = disc.FriendCriminalHistory || disc.friendCriminalHistory;
      
      if (isMeaningful(otherAdmissions)) generalParts.push(`Other admissions: ${otherAdmissions}`);
      if (isMeaningful(driverLicense)) generalParts.push(`Driver's license: ${driverLicense}`);
      if (isMeaningful(financialStatus)) generalParts.push(`Financial: ${formatValue(financialStatus)}`);
      if (isMeaningful(familyCriminal)) generalParts.push(`Family: ${familyCriminal}`);
      if (isMeaningful(friendCriminal)) generalParts.push(`Friends: ${friendCriminal}`);
      
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
