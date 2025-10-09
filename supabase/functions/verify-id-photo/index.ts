import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submissionId, idPhotoUrl, firstName, lastName, idNumber } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Generate signed URL for the ID photo
    const idPhotoPath = idPhotoUrl.split('/').pop();
    const { data: signedUrlData, error: urlError } = await supabase
      .storage
      .from('employee-ids')
      .createSignedUrl(idPhotoPath!, 3600);

    if (urlError || !signedUrlData) {
      throw new Error('Failed to get ID photo URL');
    }

    console.log('Analyzing ID photo with AI...');

    // Use Lovable AI to analyze the ID photo
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an ID document verification assistant. Analyze ID documents and extract personal information accurately.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Verify this ID document. The submitted information is:
- First Name: ${firstName}
- Last Name: ${lastName}  
- ID Number: ${idNumber}

Please check if:
1. The document is a valid South African ID document
2. The ID is not expired
3. The names on the ID match the submitted names (${firstName} ${lastName})
4. The ID number on the document matches: ${idNumber}
5. Extract all visible information from the ID

Return a JSON response with:
{
  "isValid": boolean,
  "confidence": number (0-1),
  "extractedFirstName": string,
  "extractedLastName": string,
  "extractedIdNumber": string,
  "dateOfBirth": string or null,
  "expiryDate": string or null,
  "isExpired": boolean,
  "namesMatch": boolean,
  "idNumberMatches": boolean,
  "reason": string (explanation of verification result)
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: signedUrlData.signedUrl
                }
              }
            ]
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI verification failed');
    }

    const aiData = await aiResponse.json();
    const aiMessage = aiData.choices[0].message.content;
    
    console.log('AI response:', aiMessage);

    // Parse AI response
    let verificationResult;
    try {
      // Extract JSON from the response
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        verificationResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiMessage);
      verificationResult = {
        isValid: false,
        confidence: 0,
        reason: 'Failed to parse ID verification response',
        extractedFirstName: '',
        extractedLastName: '',
        extractedIdNumber: '',
        namesMatch: false,
        idNumberMatches: false,
        isExpired: true
      };
    }

    // Determine verification status
    const status = verificationResult.isValid && 
                   verificationResult.namesMatch && 
                   verificationResult.idNumberMatches && 
                   !verificationResult.isExpired &&
                   verificationResult.confidence > 0.7
      ? 'verified'
      : 'rejected';

    // Update submission with verification results
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        id_verification_status: status,
        id_verification_details: verificationResult,
      })
      .eq('id', submissionId);

    if (updateError) {
      console.error('Error updating submission:', updateError);
      throw new Error('Failed to update verification status');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status,
        details: verificationResult 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-id-photo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
