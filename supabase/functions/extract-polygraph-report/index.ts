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

    const systemPrompt = `You are an expert at extracting structured data from polygraph examination reports. 
    Extract all relevant information and return it as a JSON object with the following structure:
    {
      "candidate": {
        "firstName": string,
        "lastName": string,
        "idNumber": string,
        "email": string or null,
        "contactNumber": string or null,
        "physicalAddress": string or null,
        "positionApplyingFor": string or null
      },
      "examination": {
        "date": string (YYYY-MM-DD format),
        "examinerName": string or null,
        "vettingTypes": {
          "preEmployment": boolean,
          "periodicScreening": boolean,
          "specific": boolean
        }
      },
      "suitability": {
        "enoughSleep": boolean or null,
        "recentAlcoholUse": boolean or null,
        "alcoholDetails": string or null,
        "recentDrugUse": boolean or null,
        "drugUseDetails": string or null,
        "medicationTaken": boolean or null,
        "medicationDetails": string or null,
        "heartConditions": boolean or null,
        "breathingTrouble": boolean or null,
        "pregnant": boolean or null,
        "diabetic": boolean or null,
        "psychologicalDisorders": boolean or null,
        "hospitalizedRecently": boolean or null,
        "hospitalizedDetails": string or null,
        "smoker": boolean or null,
        "smokingDetails": string or null,
        "healthStatus": string or null,
        "suitableForExam": boolean or null,
        "suitabilityComment": string or null
      },
      "admissions": [
        {
          "category": string (one of: "drug_use", "workplace_theft", "fraud", "bribery", "criminal_syndicate", "undetected_crimes", "previous_dismissal", "gambling_issues"),
          "confirmed": boolean,
          "timeWindow": string or null (one of: "within_2_years", "2_5_years", "5_plus_years", "never"),
          "details": object or null (category-specific details),
          "notes": string or null
        }
      ],
      "examQuestions": [
        {
          "questionNumber": number,
          "questionText": string,
          "response": boolean or null,
          "finding": string or null (one of: "SR", "NSR", "INC", "PNC")
        }
      ],
      "result": {
        "overallResult": string or null (one of: "passed", "failed", "inconclusive"),
        "examinerNotes": string or null
      }
    }
    
    For admissions details, use these structures based on category:
    - drug_use: { "substances": ["marijuana", "cocaine", etc.] }
    - workplace_theft: { "valueRange": "under_100" | "100_500" | "500_1000" | "over_1000" }
    - previous_dismissal: { "reason": string }
    
    Extract as much information as possible. If a field is not found or unclear, use null.
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
                text: `Please extract all polygraph report data from this PDF document. The document is a completed polygraph examination report template.`
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
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();
      extractedData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse extracted data');
    }

    console.log('Successfully extracted polygraph report data');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: extractedData 
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
