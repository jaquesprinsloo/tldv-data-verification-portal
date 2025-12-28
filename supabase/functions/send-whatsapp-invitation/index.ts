import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppInvitationRequest {
  phoneNumber: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  token: string;
  otp: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
      throw new Error("Twilio credentials not configured");
    }

    const { phoneNumber, employeeNumber, firstName, lastName, token, otp }: WhatsAppInvitationRequest = await req.json();

    if (!phoneNumber || !employeeNumber || !firstName || !token || !otp) {
      throw new Error("Missing required fields");
    }

    // Format phone number for WhatsApp (ensure it has country code)
    let formattedPhone = phoneNumber.replace(/\s+/g, "").replace(/[^\d+]/g, "");
    if (!formattedPhone.startsWith("+")) {
      // Assume South African number if no country code
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "+27" + formattedPhone.substring(1);
      } else {
        formattedPhone = "+" + formattedPhone;
      }
    }

    // Build the registration URL
    const baseUrl = SUPABASE_URL?.replace("supabase.co", "lovable.app") || "https://tldv-employee-portal.lovable.app";
    const registrationUrl = `${baseUrl}/employee/register?token=${token}`;

    // Create the WhatsApp message
    const message = `Hello ${firstName} ${lastName}!

You have been approved to join as an employee. Please complete your registration using the following details:

📋 *Employee Number:* ${employeeNumber}
🔑 *OTP Code:* ${otp}

Click here to register: ${registrationUrl}

This invitation is valid for 7 days.

- TLDV Team`;

    console.log(`Sending WhatsApp invitation to ${formattedPhone}`);

    // Send WhatsApp message via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    
    const formData = new URLSearchParams();
    formData.append("From", `whatsapp:${TWILIO_WHATSAPP_NUMBER}`);
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
