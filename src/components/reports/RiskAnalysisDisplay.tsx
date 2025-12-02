import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Shield, XCircle } from "lucide-react";

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

interface RiskAnalysisDisplayProps {
  riskAnalysis: RiskAnalysis;
}

const RiskAnalysisDisplay = ({ riskAnalysis }: RiskAnalysisDisplayProps) => {
  const getRiskLevelConfig = (level: string) => {
    switch (level?.toUpperCase()) {
      case 'LOW':
        return { color: 'bg-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', icon: CheckCircle2 };
      case 'MEDIUM':
        return { color: 'bg-yellow-500', textColor: 'text-yellow-700', bgColor: 'bg-yellow-50', icon: AlertTriangle };
      case 'HIGH':
        return { color: 'bg-orange-500', textColor: 'text-orange-700', bgColor: 'bg-orange-50', icon: AlertTriangle };
      case 'UNACCEPTABLE':
        return { color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle };
      default:
        return { color: 'bg-gray-500', textColor: 'text-gray-700', bgColor: 'bg-gray-50', icon: Shield };
    }
  };

  const config = getRiskLevelConfig(riskAnalysis.RiskLevel || '');
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

  return (
    <div className="space-y-6">
      {/* Risk Level Summary */}
      <Card className={config.bgColor}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <IconComponent className={`h-6 w-6 ${config.textColor}`} />
              Risk Assessment Summary
            </CardTitle>
            <Badge className={`${config.color} text-white text-lg px-4 py-1`}>
              {riskAnalysis.RiskLevel || 'N/A'}
            </Badge>
          </div>
          <CardDescription>
            Total Risk Score: <span className="font-bold text-lg">{riskAnalysis.TotalRiskScore || 0}</span> / 50
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress 
            value={(riskAnalysis.TotalRiskScore || 0) / 50 * 100} 
            className="h-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0-7 LOW</span>
            <span>8-17 MEDIUM</span>
            <span>18-30 HIGH</span>
            <span>31+ UNACCEPTABLE</span>
          </div>
        </CardContent>
      </Card>

      {/* Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Score Breakdown</CardTitle>
          <CardDescription>Category-by-category scoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              Key Risk Concerns
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
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Shield className="h-5 w-5" />
              Recommended Mitigations
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

      {/* Narrative Report */}
      {riskAnalysis.NarrativeReport && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Analysis Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-sm">{riskAnalysis.NarrativeReport}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RiskAnalysisDisplay;
