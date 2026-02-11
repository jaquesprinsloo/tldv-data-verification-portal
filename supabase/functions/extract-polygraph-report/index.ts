import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function uploadPhotoToStorage(photoBase64: string, candidateIdNumber: string, mimeType: string = 'image/png'): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return null;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Convert base64 to Uint8Array
    const binaryString = atob(photoBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Generate unique filename
    const extension = mimeType.split('/')[1] || 'png';
    const fileName = `candidate-photos/${candidateIdNumber}-${Date.now()}.${extension}`;
    
    // Upload to polygraph-reports bucket (public bucket)
    const { error } = await supabase.storage
      .from('polygraph-reports')
      .upload(fileName, bytes, {
        contentType: mimeType,
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading photo to storage:', error);
      return null;
    }
    
    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('polygraph-reports')
      .getPublicUrl(fileName);
    
    console.log('Photo uploaded successfully:', publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error in uploadPhotoToStorage:', error);
    return null;
  }
}

// Extract text content from a Word document (docx is a ZIP containing XML)
async function extractTextFromDocx(docxBase64: string): Promise<string> {
  try {
    // Decode base64 to binary
    const binaryString = atob(docxBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load the docx as a ZIP file
    const zip = await JSZip.loadAsync(bytes);
    
    // Get the main document XML
    const documentXml = await zip.file('word/document.xml')?.async('string');
    
    if (!documentXml) {
      console.error('Could not find word/document.xml in docx');
      return '';
    }
    
    // Extract text content from XML by removing tags and cleaning up
    let text = documentXml
      // Replace paragraph tags with newlines
      .replace(/<\/w:p>/g, '\n')
      // Replace table row endings with newlines
      .replace(/<\/w:tr>/g, '\n')
      // Remove all XML tags
      .replace(/<[^>]+>/g, ' ')
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      // Clean up multiple newlines
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    console.log('Extracted text length from Word document:', text.length);
    return text;
  } catch (error) {
    console.error('Error extracting text from docx:', error);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { docxBase64, pdfBase64, fileName, extractedImages } = await req.json();
    
    // Support both Word documents (docxBase64) and PDFs (pdfBase64) for backwards compatibility
    const isWordDoc = !!docxBase64;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`Processing polygraph report ${isWordDoc ? 'Word document' : 'PDF'}:`, fileName);

    const systemPrompt = `You are an automated risk-analysis system used for pre-employment vetting in South Africa.

You MUST:
1. Read the uploaded document containing a polygraph/vetting report.
2. Recognize and extract all sections, even if formatting varies.

REQUIRED SECTIONS TO EXTRACT:
- Candidate Identification (full name, ID number)
- Residential Address
- Contact Details (phone, email)
- Position Applied For & Store
- Suitability Questionnaire responses (health, sleep, medication, conditions)
- Educational History
- Employment History (all employers, job titles, duties, reasons for leaving)
- Family Information & Criminal History — IMPORTANT: Extract EVERY family member listed in the document (father, mother, siblings, spouse, stepparents, children, etc.). Each member must be a separate entry with Name, Relationship, and CriminalHistory. Do NOT skip any family members.
- Friend Information & Criminal History — Extract EVERY friend listed. Each friend must be a separate entry.
- Financial Circumstances (bank, debts, arrears, blacklisting)
- Permits & Licensing (passport, driver's license, bribes paid to obtain license)
- Personal Encounters with the Law (arrests, fines, convictions, court appearances)
- Past Criminal Activity (workplace theft, bribery, fraud, syndicates, undetected crimes)
- Drug & Substance Use
- Gambling behaviour
- Polygraph Relevant Questions, Responses, and Findings (SR, INC, NSR)
- Post-Examination Admissions

CRITICAL INSTRUCTION FOR DetailedCriminalActivity:
The document typically contains a section listing criminal activity questions grouped by category (Theft at Work, Fraud, Bribery, Organized Crime, Undetected Crimes, Illegal Drug Involvement, General Overview). 
You MUST extract EVERY SINGLE question/item listed under each category. Each question must be a separate entry with the exact question text and whether the candidate answered YES (true) or NO (false).
Do NOT summarize or skip questions. Extract ALL of them verbatim from the document.
If a category has 5 questions, you must return 5 items. If it has 25 questions, return all 25.
The "Answer" field must be true if the candidate confirmed/admitted to the item, and false if they denied it.

If a section is blank in the document, mark it as "Not disclosed".

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
  "EmploymentHistory": [
    {
      "Company": "Name of employer",
      "Position": "Job title or role",
      "Duration": "How long employed e.g. '2 years 6 months' or '1 year'",
      "ReasonForLeaving": "Why the candidate left this job",
      "DisciplinaryConduct": "Any warnings, hearings, dismissals, or disciplinary actions noted. Use 'None' if no disciplinary issues."
    }
  ],
  "FamilyCriminalHistory": [
    {
      "Name": "Full name of family member",
      "Relationship": "e.g. Father, Mother, Brother, Sister, Stepfather, Stepmother, Stepbrother, Stepsister, Spouse, Wife, Husband, Son, Daughter, Uncle, Aunt, Cousin",
      "PhysicalAddress": "Residential address of the family member",
      "EmploymentStatus": "Employed or Unemployed",
      "Employer": "Name of employer if employed",
      "Position": "Job title/position if employed",
      "Duration": "How long employed if applicable",
      "CriminalHistory": "Description of any criminal history, arrests, convictions, or 'Not aware of any criminal history'",
      "ArrestDisclosed": "Yes or No - whether any arrest was disclosed"
    }
  ],
  "FriendCriminalHistory": [
    {
      "Name": "Full name of friend",
      "Relationship": "Close Friend",
      "PhysicalAddress": "Residential address of the friend",
      "EmploymentStatus": "Employed or Unemployed",
      "Employer": "Name of employer if employed",
      "Position": "Job title/position if employed",
      "Duration": "How long employed if applicable",
      "CriminalHistory": "Description of any criminal history, arrests, convictions, or 'Not aware of any criminal history'",
      "ArrestDisclosed": "Yes or No - whether any arrest was disclosed"
    }
  ],
  "NextOfKin": [
    {
      "Name": "Full name of next of kin",
      "Relationship": "Relationship to candidate",
      "ContactNumber": "Phone number of next of kin",
      "PhysicalAddress": "Residential address of next of kin",
      "EmploymentStatus": "Employed or Unemployed",
      "Employer": "Name of employer if employed",
      "Position": "Job title/position if employed"
    }
  ],
  "FinancialCircumstances": {
    "BankDetails": "List of banks and account types e.g. 'ABSA Bank – Cheque Account, Capitec – Savings'",
    "Debts": [
      {
        "Name": "Name of creditor or account e.g. 'Truworths' or 'Vehicle Finance'",
        "Amount": "Monthly payment amount as a number e.g. 800 or 5600",
        "Status": "current or arrears"
      }
    ],
    "Arrears": [
      {
        "Name": "Name of creditor in arrears e.g. 'Rage' or 'Cell C'",
        "Amount": "Amount in arrears as a number e.g. 500 or 5600",
        "Date": "When arrears started e.g. 'January 2023'"
      }
    ],
    "Blacklisted": "Yes or No - whether the candidate is blacklisted",
    "GamblingIssues": "Details of any gambling issues disclosed, or 'None'"
  },
  "PermitsLicensing": {
    "Passport": "",
    "DriversLicense": "",
    "BribesPaid": ""
  },
  "PersonalLawEncounters": {
    "Arrests": "",
    "Bribe": "Whether the candidate paid a bribe related to an arrest or legal matter, or 'No'",
    "Fines": "",
    "Convictions": "",
    "PendingCases": "Any pending court cases or legal matters, or 'No'",
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
  "DetailedCriminalActivity": {
    "TheftAtWork": [
      { "Question": "Extract the exact question text from the document", "Answer": false },
      { "Question": "Extract ALL questions in this category - do not skip any", "Answer": false }
    ],
    "Fraud": [
      { "Question": "Extract every fraud-related question verbatim", "Answer": false }
    ],
    "Bribery": [
      { "Question": "Extract every bribery-related question verbatim", "Answer": false }
    ],
    "OrganizedCrime": [
      { "Question": "Extract every organized crime question verbatim", "Answer": false }
    ],
    "UndetectedCrimes": [
      { "Question": "Extract every undetected crime question verbatim", "Answer": false }
    ],
    "IllegalDrugInvolvement": [
      { "Question": "Extract every drug involvement question verbatim", "Answer": false }
    ],
    "GeneralOverview": [
      { "Question": "Extract every general overview question verbatim", "Answer": false }
    ]
  },
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

IMPORTANT: For consistent, deterministic output:
- Use EXACT wording from the document for disclosures
- Use standardized phrases for KeyRiskConcerns and RecommendedMitigations
- Follow the exact structure below for NarrativeReport

In NarrativeReport field, write a detailed narrative with these EXACT section headers:
1. "CANDIDATE DISCLOSURES:" - List factual disclosures from the document verbatim
2. "POLYGRAPH ANALYSIS:" - State number of questions, SR/INC/NSR counts, and overall result
3. "RISK SCORE BREAKDOWN:" - List each category with its score (e.g., "Criminal/Dishonesty: 0/12")
4. "FINAL RISK RATING:" - State total score and risk level
5. "KEY CONCERNS:" - List specific risk concerns based on findings
6. "RECOMMENDATIONS:" - List mitigation recommendations

For KeyRiskConcerns array, use standardized phrases such as:
- "No significant risk concerns identified"
- "Theft admission disclosed"
- "Prior dismissal for dishonesty"
- "Financial pressure indicators"
- "Substance use history"
- "SR on polygraph question regarding [topic]"
- "INC on polygraph question regarding [topic]"

For RecommendedMitigations array, use standardized phrases such as:
- "No additional mitigations required"
- "Enhanced supervision recommended"
- "Financial wellness program recommended"
- "Reference check with previous employer"
- "Periodic re-screening recommended"
- "Drug/alcohol testing program recommended"

STEP 6 – NO HALLUCINATIONS

If the document does not include information, say "Not Disclosed."
Never invent data.

Return ONLY the JSON object, no additional text.`;

    // Build the AI request based on document type
    let userContent: any[];
    
    if (isWordDoc) {
      // For Word documents, extract text and send as plain text
      const extractedText = await extractTextFromDocx(docxBase64);
      
      if (!extractedText) {
        throw new Error('Failed to extract text from Word document');
      }
      
      userContent = [
        {
          type: 'text',
          text: `Please extract all polygraph report data from the following document text and perform a complete risk analysis. The document is a completed polygraph examination report.\n\n--- DOCUMENT CONTENT ---\n\n${extractedText}`
        }
      ];
    } else {
      // For PDFs, send as base64 image
      userContent = [
        {
          type: 'text',
          text: 'Please extract all polygraph report data from this PDF and perform a complete risk analysis. The document is a completed polygraph examination report.'
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:application/pdf;base64,${pdfBase64}`
          }
        }
      ];
    }

    // Extract data from the document
    // Use temperature: 0 for deterministic, consistent results
    const dataResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: userContent
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0,  // Deterministic output for consistent results
      }),
    });

    if (!dataResponse.ok) {
      const errorText = await dataResponse.text();
      console.error('AI Gateway error:', dataResponse.status, errorText);
      
      if (dataResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (dataResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${dataResponse.status}`);
    }

    const aiData = await dataResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing JSON...');

    let extractedData: any;
    
    if (typeof content === 'object') {
      extractedData = content;
      console.log('Received structured JSON content from AI.');
    } else {
      try {
        let jsonString = content.trim();
        jsonString = jsonString.replace(/^```(?:json)?\s*\n?/, '');
        jsonString = jsonString.replace(/\n?```\s*$/, '');
        
        if (!jsonString.trim().startsWith('{')) {
          const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
          if (jsonObjMatch) {
            jsonString = jsonObjMatch[0];
          }
        }
        
        jsonString = jsonString.trim();
        
        console.log('Attempting to parse JSON string of length:', jsonString.length);
        
        try {
          extractedData = JSON.parse(jsonString);
          console.log('Successfully parsed JSON from string content');
        } catch (firstParseError) {
          // Try to repair truncated JSON by closing open brackets
          console.log('First parse failed, attempting to repair JSON...');
          let repairedJson = jsonString;
          
          // Count open brackets/braces
          let openBraces = 0;
          let openBrackets = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < repairedJson.length; i++) {
            const char = repairedJson[i];
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            if (char === '"') {
              inString = !inString;
              continue;
            }
            if (!inString) {
              if (char === '{') openBraces++;
              else if (char === '}') openBraces--;
              else if (char === '[') openBrackets++;
              else if (char === ']') openBrackets--;
            }
          }
          
          // Close any unclosed strings first
          if (inString) {
            repairedJson += '"';
          }
          
          // Remove trailing comma if present
          repairedJson = repairedJson.replace(/,\s*$/, '');
          
          // Close open brackets and braces
          for (let i = 0; i < openBrackets; i++) {
            repairedJson += ']';
          }
          for (let i = 0; i < openBraces; i++) {
            repairedJson += '}';
          }
          
          console.log('Repaired JSON, attempting parse again...');
          extractedData = JSON.parse(repairedJson);
          console.log('Successfully parsed repaired JSON');
        }
      } catch (parseError) {
        console.error('Failed to parse AI response. Content length:', typeof content === 'string' ? content.length : 'non-string');
        console.error('Parse error:', parseError instanceof Error ? parseError.message : 'Unknown error');
        console.error('Content preview (first 500 chars):', typeof content === 'string' ? content.substring(0, 500) : 'non-string');
        console.error('Content preview (last 500 chars):', typeof content === 'string' ? content.substring(content.length - 500) : 'non-string');
        throw new Error('Failed to parse extracted data');
      }
    }

    // Handle photo from extracted images (Word document) or upload if provided
    let candidatePhotoUrl: string | null = null;
    
    if (extractedImages && extractedImages.length > 0) {
      // Use the first extracted image from the Word document as the candidate photo
      const firstImage = extractedImages[0];
      const candidateIdNumber = extractedData.Candidate?.IDNumber || `unknown-${Date.now()}`;
      candidatePhotoUrl = await uploadPhotoToStorage(firstImage.base64, candidateIdNumber, firstImage.mimeType);
      console.log('Uploaded extracted image from Word document:', candidatePhotoUrl ? 'Success' : 'Failed');
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
      nextOfKin: extractedData.NextOfKin || [],
      financialCircumstances: extractedData.FinancialCircumstances || {},
      permitsLicensing: extractedData.PermitsLicensing || {},
      personalLawEncounters: extractedData.PersonalLawEncounters || {},
      polygraphResults: extractedData.PolygraphResults || {},
      postExamAdmissions: extractedData.PostExamAdmissions || '',
      riskAnalysis: extractedData.RiskAnalysis || {},
      // Add extracted photo URL
      candidatePhotoUrl: candidatePhotoUrl,
    };

    console.log('Successfully extracted polygraph report data with risk analysis');
    console.log('Risk Level:', transformedData.riskAnalysis?.RiskLevel);
    console.log('Total Risk Score:', transformedData.riskAnalysis?.TotalRiskScore);
    console.log('Candidate Photo URL:', candidatePhotoUrl ? 'Extracted' : 'Not found');

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