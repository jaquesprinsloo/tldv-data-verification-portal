import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppInvitationRequest {
  // Generic mode (PreAppliCheck / candex)
  phone?: string;
  message?: string;
  // Employee onboarding mode (legacy)
  phoneNumber?: string;
  employeeNumber?: string;
  firstName?: string;
  lastName?: string;
  token?: string;
  otp?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require admin / master_admin
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("master_admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
      throw new Error("Twilio credentials not configured");
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[a-f0-9]{32}$/.test(token)) {
      throw new Error("Missing invitation");
    }
    // Phone number and message are derived server-side from the stored invitation.
    const { data: inv } = await supabaseAdmin
      .from("candex_invitations")
      .select("candidate_name, candidate_phone, token, status")
      .eq("token", token)
      .maybeSingle();
    if (!inv || !inv.candidate_phone || !["sent", "opened"].includes(inv.status)) {
      throw new Error("Invitation not found");
    }
    const rawPhone: string = String(inv.candidate_phone);
    const portalUrl = `https://portal.tldv.co.za/preapplicheck-apply?token=${inv.token}`;
    const firstName = String(inv.candidate_name || "").trim().split(/\s+/)[0]?.slice(0, 60) || "there";
    const message = body?.reminder === true
      ? `Reminder: You've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}`
      : `Hi ${firstName}, you've been invited to complete a PreAppliCheck. Please click here to begin: ${portalUrl}`;

    // Format phone number for WhatsApp (ensure it has country code)
    let formattedPhone = rawPhone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
    if (!/^\+?\d{9,15}$/.test(formattedPhone)) {
      throw new Error("Invalid phone number");
    }
    if (!formattedPhone.startsWith("+")) {
      // Assume South African number if no country code
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "+27" + formattedPhone.substring(1);
      } else {
        formattedPhone = "+" + formattedPhone;
      }
    }

    const formattedSender = TWILIO_WHATSAPP_NUMBER
      .replace(/^whatsapp:/i, "")
      .replace(/\s+/g, "")
      .replace(/[^\d+]/g, "");

    console.log("Sending WhatsApp invitation");

    // Send WhatsApp message via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append("From", `whatsapp:${formattedSender}`);
    formData.append("To", `whatsapp:${formattedPhone}`);
    formData.append("Body", message);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const twilioResult = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioResult);
      if (twilioResult.code === 63007) {
        throw new Error("Twilio WhatsApp sender is not configured correctly. Use an approved Twilio WhatsApp sender number only, e.g. +14155238886 for sandbox, without the whatsapp: prefix.");
      }
      throw new Error(twilioResult.message || "Failed to send WhatsApp message");
    }

    console.log("WhatsApp message sent successfully:", twilioResult.sid);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageSid: twilioResult.sid,
        message: "WhatsApp invitation sent successfully" 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending WhatsApp invitation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
