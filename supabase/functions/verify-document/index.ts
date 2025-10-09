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
    const { submissionId, documentUrl, physicalAddress } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Generate signed URL for the document
    const documentPath = documentUrl.split('/').pop();
    const { data: signedUrlData, error: urlError } = await supabase
      .storage
      .from('proof-of-residence')
      .createSignedUrl(documentPath!, 3600);

    if (urlError || !signedUrlData) {
      throw new Error('Failed to get document URL');
    }

    console.log('Analyzing document with AI...');

    // Use Lovable AI to analyze the document
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
            content: 'You are a document verification assistant. Analyze proof of residence documents and extract the address information. Determine if the document is valid and matches the provided address.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Verify this proof of residence document. The submitted address is: "${physicalAddress}". Please check if:
1. The document is a valid proof of residence (utility bill, bank statement, lease agreement, etc.)
2. The document is recent (within last 3 months)
3. The address on the document matches or is similar to: ${physicalAddress}
4. Extract the exact address from the document

Return a JSON response with:
{
  "isValid": boolean,
  "confidence": number (0-1),
  "extractedAddress": string,
  "documentType": string,
  "issueDate": string or null,
  "matchesProvided": boolean,
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
        reason: 'Failed to parse document verification response',
        extractedAddress: '',
        documentType: 'unknown',
        matchesProvided: false
      };
    }

    // Determine verification status
    const status = verificationResult.isValid && verificationResult.matchesProvided && verificationResult.confidence > 0.7
      ? 'verified'
      : 'rejected';

    // Update submission with verification results
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        document_verification_status: status,
        document_verification_details: verificationResult,
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
    console.error('Error in verify-document:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
