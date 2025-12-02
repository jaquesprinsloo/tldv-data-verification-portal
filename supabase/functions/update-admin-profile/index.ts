import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, fullName, email } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the requesting user
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Not authenticated");
    }

    // Check if the user is a master admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'master_admin')
      .single();

    if (roleError || !roleData) {
      throw new Error("Not authorized - master admin only");
    }

    // Update auth user email if changed
    if (email) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { full_name: fullName }
      });

      if (authError) {
        console.error("Auth update error:", authError);
        throw authError;
      }
    }

    // Update profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        email: email,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (profileError) {
      console.error("Profile update error:", profileError);
      throw profileError;
    }

    console.log(`Successfully updated profile for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error updating profile:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
