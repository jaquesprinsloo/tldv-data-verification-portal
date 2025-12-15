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

  // Generate background summary from extracted data with professional summaries
  const generateBackgroundSummary = () => {
    if (!extractedData) return null;

    const sections: { title: string; icon: React.ReactNode; content: string }[] = [];

    // Employment History - focus on job count, dismissals, absconding, disciplinary actions
    const generateEmploymentSummary = () => {
      const employment = extractedData.employmentHistory;
      if (!employment || (Array.isArray(employment) && employment.length === 0)) {
        return "No employment history was disclosed by the candidate.";
      }
      
      const jobs = Array.isArray(employment) ? employment : [employment];
      const jobCount = jobs.length;
      
      const dismissals: string[] = [];
      const absconded: string[] = [];
      const disciplinaryActions: string[] = [];
      
      jobs.forEach((job: any) => {
        const reason = (job.ReasonForLeaving || job.reasonForLeaving || job.Reason || job.reason || '').toLowerCase();
        const company = job.Company || job.company || job.Employer || job.employer || 'an employer';
        
        if (reason.includes('dismiss') || reason.includes('fired') || reason.includes('terminated')) {
          dismissals.push(company);
        }
        if (reason.includes('abscond') || reason.includes('left without notice')) {
          absconded.push(company);
        }
        if (reason.includes('warning') || reason.includes('hearing') || reason.includes('disciplinary')) {
          disciplinaryActions.push(company);
        }
      });
      
      let summary = `The candidate has held ${jobCount} position${jobCount > 1 ? 's' : ''} in their employment history.`;
      
      if (dismissals.length > 0) {
        summary += ` The candidate disclosed being dismissed from ${dismissals.join(', ')}.`;
      }
      if (absconded.length > 0) {
        summary += ` Records indicate the candidate absconded from ${absconded.join(', ')}.`;
      }
      if (disciplinaryActions.length > 0) {
        summary += ` Disciplinary actions were disclosed at ${disciplinaryActions.join(', ')}.`;
      }
      
      if (dismissals.length === 0 && absconded.length === 0 && disciplinaryActions.length === 0) {
        summary += " No dismissals, absconding, or disciplinary actions were disclosed.";
      }
      
      return summary;
    };

    // Family & Friends Background - combined paragraph
    const generateFamilyFriendSummary = () => {
      const family = extractedData.familyCriminalHistory;
      const friends = extractedData.friendCriminalHistory;
      
      const familyList = Array.isArray(family) ? family : (family ? [family] : []);
      const friendList = Array.isArray(friends) ? friends : (friends ? [friends] : []);
      
      const hasFamily = familyList.length > 0;
      const hasFriends = friendList.length > 0;
      
      const familyWithCriminal: string[] = [];
      const friendsWithCriminal: string[] = [];
      
      familyList.forEach((member: any) => {
        const history = (member.CriminalHistory || member.criminalHistory || member.History || member.history || '').toLowerCase();
        const name = member.Name || member.name || 'family member';
        const relationship = member.Relationship || member.relationship || '';
        
        if (history && !history.includes('none') && !history.includes('not disclosed') && !history.includes('n/a') && history.trim() !== '') {
          const historyDetail = member.CriminalHistory || member.criminalHistory || member.History || member.history;
          familyWithCriminal.push(`${name}${relationship ? ` (${relationship})` : ''} - ${historyDetail}`);
        }
      });
      
      friendList.forEach((member: any) => {
        const history = (member.CriminalHistory || member.criminalHistory || member.History || member.history || '').toLowerCase();
        const name = member.Name || member.name || 'friend';
        
        if (history && !history.includes('none') && !history.includes('not disclosed') && !history.includes('n/a') && history.trim() !== '') {
          const historyDetail = member.CriminalHistory || member.criminalHistory || member.History || member.history;
          friendsWithCriminal.push(`${name} - ${historyDetail}`);
        }
      });
      
      let summary = '';
      
      if (hasFamily) {
        summary = "The candidate provided a comprehensive family contact trace. ";
      } else {
        summary = "No family contact information was disclosed. ";
      }
      
      if (familyWithCriminal.length > 0) {
        summary += `The following family members have been arrested or convicted: ${familyWithCriminal.join('; ')}. `;
      } else if (hasFamily) {
        summary += "No criminal history was disclosed for any family members. ";
      }
      
      if (friendsWithCriminal.length > 0) {
        summary += `Friends with criminal history: ${friendsWithCriminal.join('; ')}.`;
      } else if (hasFriends) {
        summary += "No criminal history was disclosed for any associates or friends.";
      } else {
        summary += "No friend or associate information was provided.";
      }
      
      return summary;
    };

    // Financial Circumstances
    const generateFinancialSummary = () => {
      const financial = extractedData.financialCircumstances;
      const disclosure = extractedData.disclosure;
      
      if (!financial && !disclosure) {
        return "No financial circumstances were disclosed by the candidate.";
      }
      
      const debts = financial?.Debts || financial?.debts || [];
      const arrears = financial?.Arrears || financial?.arrears || [];
      const blacklisted = financial?.Blacklisted || financial?.blacklisted || '';
      const gambling = financial?.GamblingIssues || financial?.gamblingIssues || '';
      
      const discFinancial = disclosure?.FinancialStatus || disclosure?.financialStatus;
      const activeDebt = discFinancial?.ActiveDebt || discFinancial?.activeDebt || [];
      const discArrears = discFinancial?.Arrears || discFinancial?.arrears || [];
      const discBlacklisted = discFinancial?.Blacklisted || discFinancial?.blacklisted || '';
      
      const allDebts = [...(Array.isArray(debts) ? debts : []), ...(Array.isArray(activeDebt) ? activeDebt : [])];
      const allArrears = [...(Array.isArray(arrears) ? arrears : []), ...(Array.isArray(discArrears) ? discArrears : [])];
      
      let summary = '';
      
      if (allDebts.length > 0) {
        // Calculate estimated monthly total if amounts are available
        let monthlyTotal = 0;
        allDebts.forEach((debt: any) => {
          const amount = debt.Amount || debt.amount || debt.MonthlyPayment || debt.monthlyPayment;
          if (amount && typeof amount === 'number') monthlyTotal += amount;
          else if (amount && typeof amount === 'string') {
            const parsed = parseFloat(amount.replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsed)) monthlyTotal += parsed;
          }
        });
        
        if (monthlyTotal > 0) {
          summary = `The candidate has financial obligations with an estimated monthly commitment of approximately R${monthlyTotal.toLocaleString()}. `;
        } else {
          summary = `The candidate has ${allDebts.length} active financial obligation${allDebts.length > 1 ? 's' : ''} which are being serviced. `;
        }
      }
      
      if (allArrears.length > 0) {
        summary += `Historical debt was disclosed with ${allArrears.length} account${allArrears.length > 1 ? 's' : ''} in arrears. `;
      }
      
      if (isMeaningful(blacklisted) || isMeaningful(discBlacklisted)) {
        summary += `The candidate indicated being blacklisted. `;
      }
      
      if (isMeaningful(gambling)) {
        summary += `Gambling-related financial impact was disclosed. `;
      }
      
      if (!summary) {
        summary = "No outstanding financial obligations or concerns were disclosed by the candidate.";
      }
      
      return summary.trim();
    };

    // Permits & Licensing
    const generatePermitsSummary = () => {
      const permits = extractedData.permitsLicensing;
      const disclosure = extractedData.disclosure;
      
      if (!permits && !disclosure) {
        return "No information regarding permits or licensing was disclosed.";
      }
      
      const passport = permits?.Passport || permits?.passport || '';
      const driversLicense = permits?.DriversLicense || permits?.driversLicense || permits?.DriverLicense || '';
      const bribesPaid = permits?.BribesPaid || permits?.bribesPaid || '';
      const discLicense = disclosure?.DriverLicenseAndBribes || disclosure?.driverLicenseAndBribes || '';
      
      let summary = '';
      
      // SA Citizenship and passport
      if (isMeaningful(passport)) {
        if (passport.toLowerCase().includes('valid') || passport.toLowerCase().includes('yes')) {
          summary += "The candidate is a South African citizen with a valid passport. ";
        } else if (passport.toLowerCase().includes('no') || passport.toLowerCase().includes('none')) {
          summary += "The candidate confirmed South African citizenship but does not hold a valid passport. ";
        } else {
          summary += `Passport status: ${passport}. `;
        }
      }
      
      // Driver's license
      if (isMeaningful(driversLicense) || isMeaningful(discLicense)) {
        const licenseInfo = driversLicense || discLicense;
        if (licenseInfo.toLowerCase().includes('yes') || licenseInfo.toLowerCase().includes('valid')) {
          summary += "The candidate holds a valid driver's license. ";
        } else if (licenseInfo.toLowerCase().includes('no')) {
          summary += "The candidate does not hold a driver's license. ";
        }
      }
      
      // Bribes for license
      if (isMeaningful(bribesPaid) || (discLicense && discLicense.toLowerCase().includes('bribe'))) {
        const bribeInfo = bribesPaid || discLicense;
        if (bribeInfo.toLowerCase().includes('yes') || bribeInfo.toLowerCase().includes('paid')) {
          summary += "The candidate disclosed paying a bribe to obtain their driver's license. ";
        } else if (!bribeInfo.toLowerCase().includes('no')) {
          summary += `License acquisition: ${bribeInfo}. `;
        }
      }
      
      if (!summary) {
        summary = "The candidate's permit and licensing status was verified with no notable disclosures.";
      }
      
      return summary.trim();
    };

    // Encounters with the Law
    const generateLawEncountersSummary = () => {
      const lawEncounters = extractedData.personalLawEncounters;
      const disclosure = extractedData.disclosure;
      
      const arrests = lawEncounters?.Arrests || lawEncounters?.arrests || disclosure?.Arrests || disclosure?.arrests || '';
      const fines = lawEncounters?.Fines || lawEncounters?.fines || '';
      const convictions = lawEncounters?.Convictions || lawEncounters?.convictions || disclosure?.Convictions || disclosure?.convictions || '';
      const court = lawEncounters?.CourtAppearances || lawEncounters?.courtAppearances || disclosure?.CourtCases || disclosure?.courtCases || '';
      
      const disclosures: string[] = [];
      
      if (isMeaningful(arrests) && !arrests.toLowerCase().includes('none') && !arrests.toLowerCase().includes('no')) {
        disclosures.push(`arrested: ${arrests}`);
      }
      if (isMeaningful(convictions) && !convictions.toLowerCase().includes('none') && !convictions.toLowerCase().includes('no')) {
        disclosures.push(`convicted: ${convictions}`);
      }
      if (isMeaningful(court) && !court.toLowerCase().includes('none') && !court.toLowerCase().includes('no')) {
        disclosures.push(`court appearances: ${court}`);
      }
      if (isMeaningful(fines) && !fines.toLowerCase().includes('none') && !fines.toLowerCase().includes('no')) {
        disclosures.push(`outstanding fines: ${fines}`);
      }
      
      if (disclosures.length > 0) {
        return `The candidate disclosed personal encounters with the law including ${disclosures.join('; ')}.`;
      }
      
      return "The candidate confirmed no personal encounters with the law, including arrests, convictions, or court appearances.";
    };

    // Past Criminal Activity
    const generateCriminalActivitySummary = () => {
      const disclosure = extractedData.disclosure;
      if (!disclosure) {
        return "No disclosures were made regarding past criminal activity.";
      }
      
      const activities: string[] = [];
      
      const workplaceTheft = disclosure.WorkplaceTheft || disclosure.workplaceTheft || '';
      const briberyPaid = disclosure.BriberyPaid || disclosure.briberyPaid || '';
      const briberyAccepted = disclosure.BriberyAccepted || disclosure.briberyAccepted || '';
      const drugUse = disclosure.DrugUseHistory || disclosure.drugUseHistory || '';
      const organisedCrime = disclosure.OrganisedCrimeLinks || disclosure.organisedCrimeLinks || '';
      
      if (isMeaningful(workplaceTheft) && !workplaceTheft.toLowerCase().includes('none') && !workplaceTheft.toLowerCase().includes('no')) {
        activities.push(`workplace theft was disclosed: ${workplaceTheft}`);
      }
      if (isMeaningful(briberyPaid) && !briberyPaid.toLowerCase().includes('none') && !briberyPaid.toLowerCase().includes('no')) {
        activities.push(`bribes paid: ${briberyPaid}`);
      }
      if (isMeaningful(briberyAccepted) && !briberyAccepted.toLowerCase().includes('none') && !briberyAccepted.toLowerCase().includes('no')) {
        activities.push(`bribes accepted: ${briberyAccepted}`);
      }
      if (isMeaningful(drugUse) && !drugUse.toLowerCase().includes('none') && !drugUse.toLowerCase().includes('no')) {
        activities.push(`substance use: ${drugUse}`);
      }
      if (isMeaningful(organisedCrime) && !organisedCrime.toLowerCase().includes('none') && !organisedCrime.toLowerCase().includes('no')) {
        activities.push(`links to organised crime: ${organisedCrime}`);
      }
      
      if (activities.length > 0) {
        return `The candidate made the following disclosures regarding past criminal activity: ${activities.join('; ')}.`;
      }
      
      return "The candidate confirmed no involvement in workplace theft, bribery, substance abuse, or organised crime activities.";
    };

    // General Disclosures - from the general paragraph about CV, gambling, etc.
    const generateGeneralSummary = () => {
      const disclosure = extractedData.disclosure;
      if (!disclosure) return null;
      
      const parts: string[] = [];
      
      const otherAdmissions = disclosure.OtherNotableAdmissions || disclosure.otherNotableAdmissions || '';
      const financialStatus = disclosure.FinancialStatus || disclosure.financialStatus;
      const gamblingImpact = financialStatus?.GamblingImpact || financialStatus?.gamblingImpact || '';
      
      // Focus on CV information, gambling, and missed payments
      if (isMeaningful(otherAdmissions) && !otherAdmissions.toLowerCase().includes('none') && !otherAdmissions.toLowerCase().includes('not disclosed')) {
        parts.push(otherAdmissions);
      }
      
      if (isMeaningful(gamblingImpact) && !gamblingImpact.toLowerCase().includes('none') && !gamblingImpact.toLowerCase().includes('no')) {
        parts.push(`Gambling activities were disclosed with the following impact: ${gamblingImpact}`);
      }
      
      if (parts.length > 0) {
        return `Additional information gathered during the interview: ${parts.join('. ')}.`;
      }
      
      return null;
    };

    // Build sections
    sections.push({ 
      title: 'Employment History', 
      icon: <Briefcase className="h-4 w-4" />, 
      content: generateEmploymentSummary() 
    });

    sections.push({ 
      title: 'Family & Friends Background', 
      icon: <Users className="h-4 w-4" />, 
      content: generateFamilyFriendSummary() 
    });

    sections.push({ 
      title: 'Financial Circumstances', 
      icon: <DollarSign className="h-4 w-4" />, 
      content: generateFinancialSummary() 
    });

    sections.push({ 
      title: 'Permits & Licensing', 
      icon: <Scale className="h-4 w-4" />, 
      content: generatePermitsSummary() 
    });

    sections.push({ 
      title: 'Encounters with the Law', 
      icon: <AlertCircle className="h-4 w-4" />, 
      content: generateLawEncountersSummary() 
    });

    sections.push({ 
      title: 'Past Criminal Activity', 
      icon: <AlertTriangle className="h-4 w-4" />, 
      content: generateCriminalActivitySummary() 
    });

    const generalContent = generateGeneralSummary();
    if (generalContent) {
      sections.push({ 
        title: 'General Disclosures', 
        icon: <User className="h-4 w-4" />, 
        content: generalContent 
      });
    }

    return sections;
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
