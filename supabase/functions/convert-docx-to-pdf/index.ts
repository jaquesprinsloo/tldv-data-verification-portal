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
    const { docxBase64, fileName } = await req.json();
    
    if (!docxBase64) {
      throw new Error('No document provided');
    }

    console.log('Converting Word document to PDF:', fileName);

    // For now, we'll return an indication that conversion is not available
    // The frontend will fall back to storing the Word document
    // In production, you would integrate with a conversion service like CloudConvert or LibreOffice
    
    // Option 1: Use CloudConvert API (requires CLOUDCONVERT_API_KEY secret)
    // Option 2: Use a self-hosted LibreOffice service
    // Option 3: Generate a PDF from the extracted data using a PDF library
    
    console.log('PDF conversion service not configured - Word document will be stored as-is');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'PDF conversion not configured',
        message: 'Word document will be stored directly. PDF conversion can be enabled with a conversion service.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in convert-docx-to-pdf:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});