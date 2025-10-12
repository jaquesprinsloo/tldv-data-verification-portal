import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestNotification {
  request_id: string;
  sender_name: string;
  request_type: string;
  subject: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { request_id, sender_name, request_type, subject, message }: RequestNotification = await req.json();

    console.log("Processing request notification:", { request_id, sender_name, request_type });

    // Get master admin email
    const { data: masterAdminEmail, error: emailError } = await supabase
      .rpc("get_master_admin_email");

    if (emailError || !masterAdminEmail) {
      console.error("Error getting master admin email:", emailError);
      throw new Error("Could not find master admin email");
    }

    console.log("Sending notification to:", masterAdminEmail);

    const GMAIL_EMAIL = Deno.env.get("GMAIL_EMAIL");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
      throw new Error("Gmail credentials not configured");
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_EMAIL,
          password: GMAIL_APP_PASSWORD,
        },
      },
    });

    const requestTypeFormatted = request_type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #000; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #000; border: 2px solid #dc2626; border-radius: 10px; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 20px; }
            .content { background-color: #1a1a1a; padding: 20px; border-radius: 8px; border: 1px solid #dc2626; color: #fff; }
            .info-box { background-color: #7f1d1d; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0; color: #fff; }
            .button { display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">New Request Received</h1>
              <p style="margin: 5px 0 0 0;">TLDV Management Portal</p>
            </div>
            <div class="content">
              <div class="info-box">
                <p style="margin: 0;"><strong>From:</strong> ${sender_name}</p>
                <p style="margin: 5px 0 0 0;"><strong>Request Type:</strong> ${requestTypeFormatted}</p>
              </div>
              <h2 style="color: #dc2626; margin-top: 20px;">${subject}</h2>
              <p style="white-space: pre-wrap; margin: 15px 0;">${message}</p>
              <div style="text-align: center; margin: 20px 0;">
                <p style="color: #9ca3af;">Please log in to the Master Profile portal to respond to this request.</p>
              </div>
            </div>
            <div class="footer">
              <p>© TLDV Management Portal - Confidential</p>
            </div>
          </div>
        </body>
      </html>
    `;

    await client.send({
      from: GMAIL_EMAIL,
      to: masterAdminEmail,
      subject: `New Request: ${subject}`,
      content: "auto",
      html: htmlContent,
    });

    await client.close();

    console.log("Email sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-request-notification:", error);
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
