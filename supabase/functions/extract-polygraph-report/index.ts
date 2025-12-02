import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Processing polygraph report PDF:', fileName);

    const systemPrompt = `You are an automated risk-analysis system used for pre-employment vetting in South Africa.

You MUST:
1. Read the uploaded PDF containing a polygraph/vetting report.
2. Recognize and extract all sections, even if formatting varies.

REQUIRED SECTIONS TO EXTRACT:
- Candidate Identification (full name, ID number)
- Residential Address
- Contact Details (phone, email)
- Position Applied For & Store
- Suitability Questionnaire responses (health, sleep, medication, conditions)
- Educational History
- Employment History (all employers, job titles, duties, reasons for leaving)
- Family Information & Criminal History
- Friend Information & Criminal History
- Financial Circumstances (bank, debts, arrears, blacklisting)
- Permits & Licensing (passport, driver's license, bribes paid to obtain license)
- Personal Encounters with the Law (arrests, fines, convictions, court appearances)
- Past Criminal Activity (workplace theft, bribery, fraud, syndicates, undetected crimes)
- Drug & Substance Use
- Gambling behaviour
- Polygraph Relevant Questions, Responses, and Findings (SR, INC, NSR)
- Post-Examination Admissions

If a section is blank in the PDF, mark it as "Not disclosed".

STEP 2 — STRUCTURE THE DATA EXACTLY LIKE THIS:

{
  "Candidate": {
    "FullName": "",
    "FirstName": "",
    "LastName": "",
    "IDNumber": "",
    "Email": "",
    "ContactNumber": "",
    "PhysicalAddress": "",
    "PositionAppliedFor": "",
    "StoreLocation": ""
  },
  "Examination": {
    "Date": "",
    "ExaminerName": "",
    "VettingTypes": {
      "PreEmployment": false,
      "PeriodicScreening": false,
      "Specific": false
    }
  },
  "Suitability": {
    "HealthStatus": "",
    "EnoughSleep": null,
    "HospitalizedRecently": null,
    "HospitalizedDetails": "",
    "MedicationTaken": null,
    "MedicationDetails": "",
    "HeartConditions": null,
    "BreathingTrouble": null,
    "PsychologicalDisorders": null,
    "Diabetic": null,
    "RecentDrugUse": null,
    "DrugUseDetails": "",
    "RecentAlcoholUse": null,
    "AlcoholDetails": "",
    "Smoker": null,
    "SmokingDetails": "",
    "Pregnant": null,
    "SuitableForExam": null,
    "SuitabilityComment": ""
  },
  "Disclosure": {
    "WorkplaceTheft": "",
    "BriberyPaid": "",
    "BriberyAccepted": "",
    "DrugUseHistory": "",
    "OrganisedCrimeLinks": "",
    "FamilyCriminalHistory": "",
    "FriendCriminalHistory": "",
    "Arrests": "",
    "Convictions": "",
    "CourtCases": "",
    "FinancialStatus": {
      "ActiveDebt": [],
      "Arrears": [],
      "Blacklisted": "",
      "GamblingImpact": ""
    },
    "DriverLicenseAndBribes": "",
    "OtherNotableAdmissions": ""
  },
  "EducationHistory": [],
  "EmploymentHistory": [],
  "FamilyCriminalHistory": [],
  "FriendCriminalHistory": [],
  "FinancialCircumstances": {
    "BankDetails": "",
    "Debts": [],
    "Arrears": [],
    "Blacklisted": "",
    "GamblingIssues": ""
  },
  "PermitsLicensing": {
    "Passport": "",
    "DriversLicense": "",
    "BribesPaid": ""
  },
  "PersonalLawEncounters": {
    "Arrests": "",
    "Fines": "",
    "Convictions": "",
    "CourtAppearances": ""
  },
  "Admissions": [
    {
      "Category": "",
      "Confirmed": false,
      "TimeWindow": "",
      "Details": {},
      "Notes": ""
    }
  ],
  "ExamQuestions": [
    {
      "QuestionNumber": 0,
      "QuestionText": "",
      "Response": null,
      "Finding": ""
    }
  ],
  "PolygraphResults": {
    "QuestionResults": [],
    "SRQuestions": [],
    "INCQuestions": [],
    "NSRQuestions": []
  },
  "PostExamAdmissions": "",
  "Result": {
    "OverallResult": "",
    "ExaminerNotes": ""
  },
  "RiskAnalysis": {
    "CriminalDishonestyScore": {
      "TheftAdmission": 0,
      "PriorDishonestDismissal": 0,
      "ArrestsLast5Years": 0,
      "Convictions": 0,
      "Total": 0
    },
    "PolygraphIndicatorsScore": {
      "SROnSeriousCrimes": 0,
      "INCOnRelevant": 0,
      "Total": 0
    },
    "FinancialRiskScore": {
      "BadDebtArrears": 0,
      "MultipleDebts": 0,
      "GamblingRelated": 0,
      "Total": 0
    },
    "BriberyCorruptionScore": {
      "PersonalBenefit": 0,
      "MinorBribe": 0,
      "Total": 0
    },
    "OrganisedCrimeScore": {
      "DirectInvolvement": 0,
      "FamilyFriendContact": 0,
      "Total": 0
    },
    "SubstanceUseScore": {
      "RecentActiveAbuse": 0,
      "HistoricalExperimentation": 0,
      "Total": 0
    },
    "JobStabilityScore": {
      "JobHopping": 0,
      "DismissalsAllegations": 0,
      "Total": 0
    },
    "AdministrativeIntegrityScore": {
      "FalseCVClaims": 0,
      "UnpaidFines": 0,
      "Total": 0
    },
    "TotalRiskScore": 0,
    "RiskLevel": "",
    "KeyRiskConcerns": [],
    "RecommendedMitigations": [],
    "NarrativeReport": ""
  }
}

STEP 3 – APPLY THE RISK SCORING SYSTEM

Use the exact scoring model:

A. Criminal / Dishonesty history (max 12):
- Theft admission: +6
- Prior dishonest dismissal: +4
- Arrest(s) last 5 years: +3
- Conviction(s): +6

B. Polygraph Indicators (max 8):
- SR (Significant Reaction) on theft, syndicate, serious crimes, dismissals: +6 each
- INC (Inconclusive) on relevant question: +2
- NSR: +0

C. Financial Risk (max 6):
- Bad debt / arrears > 6 months: +4
- Multiple debts indicating pressure: +2
- Gambling-related missed payments: +2

D. Bribery / Corruption (max 6):
- Paid or received bribe for personal benefit: +6
- Paid minor bribe (traffic fine or license): +3

E. Organised Crime / Criminal Network Links (max 6):
- Direct involvement: +6
- Family/friend involvement with ongoing contact: +3

F. Substance Use (max 4):
- Recent active abuse: +4
- Historical experimentation (>5 yrs): 0–1

G. Job Stability (max 4):
- Job hopping (<1 year average tenure): +2
- Dismissals/resignations under allegations: +2

H. Administrative Integrity (max 4):
- False CV claims: +4
- Multiple unpaid fines showing disregard for rules: +1–2

STEP 4 – COMPUTE TOTAL & OUTPUT RISK LEVEL

Use thresholds:
- 0–7 = LOW RISK
- 8–17 = MEDIUM RISK
- 18–30 = HIGH RISK
- 31+ = UNACCEPTABLE RISK

STEP 5 — GENERATE FINAL REPORT (HUMAN-READABLE)

In NarrativeReport field, write a detailed narrative containing:
1. Summary of Candidate Disclosures
2. Polygraph Analysis Summary
3. Risk Score Breakdown (category by category)
4. Final Risk Rating
5. Key Risk Concerns
6. Recommended Mitigations

STEP 6 – NO HALLUCINATIONS

If the PDF does not include information, say "Not Disclosed."
Never invent data.

Return ONLY the JSON object, no additional text.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: `Please extract all polygraph report data from this PDF document and perform a complete risk analysis. The document is a completed polygraph examination report.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing JSON...');

    // Extract JSON from response (handle markdown code blocks)
    let extractedData;
    try {
      let jsonString = content.trim();
      
      // Remove markdown code blocks more aggressively
      // First, remove ```json or ``` at the start
      jsonString = jsonString.replace(/^```(?:json)?\s*\n?/, '');
      // Then remove ``` at the end
      jsonString = jsonString.replace(/\n?```\s*$/, '');
      
      // If it still doesn't start with {, try to find the JSON object
      if (!jsonString.trim().startsWith('{')) {
        const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonString = jsonObjMatch[0];
        }
      }
      
      jsonString = jsonString.trim();
      
      console.log('Attempting to parse JSON string of length:', jsonString.length);
      console.log('JSON starts with:', jsonString.substring(0, 50));
      console.log('JSON ends with:', jsonString.substring(jsonString.length - 50));
      extractedData = JSON.parse(jsonString);
      console.log('Successfully parsed JSON');
    } catch (parseError) {
      console.error('Failed to parse AI response. Content length:', content.length);
      console.error('Parse error:', parseError instanceof Error ? parseError.message : 'Unknown error');
      // Log first 500 and last 500 chars for debugging
      console.error('Content start:', content.substring(0, 500));
      console.error('Content end:', content.substring(content.length - 500));
      throw new Error('Failed to parse extracted data');
    }

    // Transform the extracted data to match our form structure
    const transformedData = {
      candidate: {
        firstName: extractedData.Candidate?.FirstName || extractedData.Candidate?.FullName?.split(' ')[0] || '',
        lastName: extractedData.Candidate?.LastName || extractedData.Candidate?.FullName?.split(' ').slice(1).join(' ') || '',
        idNumber: extractedData.Candidate?.IDNumber || '',
        email: extractedData.Candidate?.Email || '',
        contactNumber: extractedData.Candidate?.ContactNumber || '',
        physicalAddress: extractedData.Candidate?.PhysicalAddress || '',
        positionApplyingFor: extractedData.Candidate?.PositionAppliedFor || '',
        storeLocation: extractedData.Candidate?.StoreLocation || '',
      },
      examination: {
        date: extractedData.Examination?.Date || new Date().toISOString().split('T')[0],
        examinerName: extractedData.Examination?.ExaminerName || '',
        vettingTypes: extractedData.Examination?.VettingTypes || {},
      },
      suitability: {
        healthStatus: extractedData.Suitability?.HealthStatus || '',
        enoughSleep: extractedData.Suitability?.EnoughSleep,
        hospitalizedRecently: extractedData.Suitability?.HospitalizedRecently,
        hospitalizedDetails: extractedData.Suitability?.HospitalizedDetails || '',
        medicationTaken: extractedData.Suitability?.MedicationTaken,
        medicationDetails: extractedData.Suitability?.MedicationDetails || '',
        heartConditions: extractedData.Suitability?.HeartConditions,
        breathingTrouble: extractedData.Suitability?.BreathingTrouble,
        psychologicalDisorders: extractedData.Suitability?.PsychologicalDisorders,
        diabetic: extractedData.Suitability?.Diabetic,
        recentDrugUse: extractedData.Suitability?.RecentDrugUse,
        drugUseDetails: extractedData.Suitability?.DrugUseDetails || '',
        recentAlcoholUse: extractedData.Suitability?.RecentAlcoholUse,
        alcoholDetails: extractedData.Suitability?.AlcoholDetails || '',
        smoker: extractedData.Suitability?.Smoker,
        smokingDetails: extractedData.Suitability?.SmokingDetails || '',
        pregnant: extractedData.Suitability?.Pregnant,
        suitableForExam: extractedData.Suitability?.SuitableForExam,
        suitabilityComment: extractedData.Suitability?.SuitabilityComment || '',
      },
      admissions: (extractedData.Admissions || []).map((a: any) => ({
        category: a.Category || '',
        confirmed: a.Confirmed || false,
        timeWindow: a.TimeWindow || '',
        details: a.Details || {},
        notes: a.Notes || '',
      })),
      examQuestions: (extractedData.ExamQuestions || []).map((q: any) => ({
        questionNumber: q.QuestionNumber || 0,
        questionText: q.QuestionText || '',
        response: q.Response,
        finding: q.Finding || '',
      })),
      result: {
        overallResult: extractedData.Result?.OverallResult?.toLowerCase() || '',
        examinerNotes: extractedData.Result?.ExaminerNotes || '',
      },
      // Extended data for risk analysis
      disclosure: extractedData.Disclosure || {},
      educationHistory: extractedData.EducationHistory || [],
      employmentHistory: extractedData.EmploymentHistory || [],
      familyCriminalHistory: extractedData.FamilyCriminalHistory || [],
      friendCriminalHistory: extractedData.FriendCriminalHistory || [],
      financialCircumstances: extractedData.FinancialCircumstances || {},
      permitsLicensing: extractedData.PermitsLicensing || {},
      personalLawEncounters: extractedData.PersonalLawEncounters || {},
      polygraphResults: extractedData.PolygraphResults || {},
      postExamAdmissions: extractedData.PostExamAdmissions || '',
      riskAnalysis: extractedData.RiskAnalysis || {},
    };

    console.log('Successfully extracted polygraph report data with risk analysis');
    console.log('Risk Level:', transformedData.riskAnalysis?.RiskLevel);
    console.log('Total Risk Score:', transformedData.riskAnalysis?.TotalRiskScore);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: transformedData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-polygraph-report:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
