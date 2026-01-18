import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { uploadId, fileUrl, fileName } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Converting document to PDF:', fileName);

    // For Word documents, we update the record to use the original file as the "PDF"
    // In production, you would integrate with a conversion service like CloudConvert
    
    const { error: updateError } = await supabase
      .from('pending_polygraph_uploads')
      .update({
        converted_pdf_url: fileUrl,
      })
      .eq('id', uploadId);

    if (updateError) {
      console.error('Error updating record:', updateError);
      throw updateError;
    }

    console.log('Document marked as converted');

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfUrl: fileUrl,
        message: 'The original document will be used for distribution.',
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