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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authenticated admin/master_admin caller
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes('admin') && !roles.includes('master_admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const uploadId = typeof body?.uploadId === 'string' ? body.uploadId : '';
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
      return new Response(JSON.stringify({ error: 'Invalid upload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // The file link comes from the stored upload, never from the request.
    const { data: upload } = await supabase
      .from('pending_polygraph_uploads')
      .select('id, original_file_url, uploaded_by, status')
      .eq('id', uploadId)
      .maybeSingle();
    if (!upload) {
      return new Response(JSON.stringify({ error: 'Upload not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!roles.includes('master_admin') && upload.uploaded_by !== userData.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const fileUrl = upload.original_file_url;

    console.log('Converting document to PDF');

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