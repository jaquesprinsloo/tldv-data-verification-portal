import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting reminder email process...");

    // Get employees whose renewal is due within 30 days and haven't submitted recently
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: employees, error } = await supabase
      .from("employees")
      .select("*, submissions!inner(*)")
      .lt("next_renewal_date", thirtyDaysFromNow.toISOString())
      .order("next_renewal_date", { ascending: true });

    if (error) {
      console.error("Error fetching employees:", error);
      throw error;
    }

    console.log(`Found ${employees?.length || 0} employees needing reminders`);

    const emailPromises = employees?.map(async (employee: any) => {
      const daysUntilDue = Math.ceil(
        (new Date(employee.next_renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      // Get the most recent submission to get employee details
      const latestSubmission = employee.submissions[0];

      const urgencyLevel = daysUntilDue <= 7 ? "URGENT" : "REMINDER";
      
      return resend.emails.send({
        from: "TLDV <onboarding@resend.dev>",
        to: [latestSubmission?.email || ""],
        subject: `${urgencyLevel}: TLDV Verification Renewal Due`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #272727; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #BC000A; padding: 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-family: 'Poppins', sans-serif; }
                .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
                .urgent { background-color: #EE0115; color: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .button { 
                  background-color: #EE0115; 
                  color: white; 
                  padding: 12px 30px; 
                  text-decoration: none; 
                  border-radius: 5px; 
                  display: inline-block;
                  margin: 20px 0;
                }
                .footer { text-align: center; margin-top: 30px; color: #60615C; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>TLDV - True Lie Detectors & Vetting</h1>
                </div>
                <div class="content">
                  ${daysUntilDue <= 7 ? '<div class="urgent"><strong>⚠️ URGENT REMINDER</strong></div>' : ''}
                  <h2>Verification Renewal Required</h2>
                  <p>Dear ${latestSubmission?.first_name || "Employee"},</p>
                  <p>This is a ${daysUntilDue <= 7 ? 'URGENT ' : ''}reminder that your TLDV verification is due for renewal.</p>
                  <p><strong>Days until due: ${daysUntilDue}</strong></p>
                  <p>Employee Number: <strong>${employee.employee_number}</strong></p>
                  <p>Renewal Due Date: <strong>${new Date(employee.next_renewal_date).toLocaleDateString()}</strong></p>
                  <p>Please use your unique link to submit your updated verification details as soon as possible.</p>
                  <a href="${supabaseUrl.replace('https://', 'https://6e52349a-5d62-46e3-b921-2d922d50b72e.lovableproject.com')}/employee/${employee.unique_link_token}" class="button">Submit Verification Now</a>
                  <p>If you have any questions, please contact your administrator immediately.</p>
                </div>
                <div class="footer">
                  <p>&copy; ${new Date().getFullYear()} TLDV - True Lie Detectors & Vetting. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      });
    }) || [];

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    console.log(`Reminder emails sent: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successful, 
        failed,
        message: `Sent ${successful} reminder emails` 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in reminder email function:", error);
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
