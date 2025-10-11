import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_EMAIL = Deno.env.get("GMAIL_EMAIL")!;
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;

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

    // Fetch employees who need reminders:
    // - 5 months (150 days) after last submission (1 month before 6-month renewal)
    // - Last reminder was more than 7 days ago (or never sent)
    // - Employment status is 'active'
    const oneHundredFiftyDaysAgo = new Date();
    oneHundredFiftyDaysAgo.setDate(oneHundredFiftyDaysAgo.getDate() - 150);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: employees, error } = await supabase
      .from("employees")
      .select(`
        id, 
        employee_number, 
        last_submission_date,
        last_reminder_sent,
        employment_status,
        submissions!inner(email)
      `)
      .eq("employment_status", "active")
      .lte("last_submission_date", oneHundredFiftyDaysAgo.toISOString())
      .or(`last_reminder_sent.is.null,last_reminder_sent.lte.${sevenDaysAgo.toISOString()}`);

    if (error) {
      console.error("Error fetching employees:", error);
      throw error;
    }

    console.log(`Found ${employees?.length || 0} employees needing reminders`);

    let successCount = 0;
    let failureCount = 0;

    for (const employee of employees || []) {
      try {
        const submission = employee.submissions?.[0];
        
        if (!submission?.email) {
          console.log(`No email found for employee ${employee.employee_number}`);
          failureCount++;
          continue;
        }

        // Calculate months since last submission
        const monthsSinceSubmission = Math.floor(
          (Date.now() - new Date(employee.last_submission_date).getTime()) /
            (1000 * 60 * 60 * 24 * 30)
        );

        // Generate renewal request link
        const renewalRequestLink = `${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/verify-email?action=renewal-request&employeeId=${employee.id}`;

        // Send reminder email using Gmail SMTP
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #272727; max-width: 600px; margin: 0 auto; }
    .container { padding: 20px; }
    .header { background-color: #BC000A; padding: 20px; text-align: center; }
    .header h1 { color: white; margin: 0; font-family: 'Poppins', sans-serif; }
    .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
    .button { background-color: #EE0115; color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; font-weight: bold; }
    .info-box { background-color: #fff; padding: 15px; border-left: 4px solid #EE0115; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #60615C; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Employee Verification Portal</h1>
    </div>
    <div class="content">
      <h2>Verification Renewal Reminder</h2>
      <p>Dear Employee,</p>
      <p>It has been <strong>${monthsSinceSubmission} month(s)</strong> since your last verification submission.</p>
      
      <div class="info-box">
        <p style="margin: 5px 0;"><strong>Employee Number:</strong> ${employee.employee_number}</p>
        <p style="margin: 5px 0;"><strong>Last Submission:</strong> ${new Date(employee.last_submission_date).toLocaleDateString()}</p>
        <p style="margin: 5px 0;"><strong>Renewal Due:</strong> Every 6 months</p>
      </div>

      <p>As per company policy, verification submissions must be renewed every 6 months to maintain your active status.</p>
      
      <div style="margin: 30px 0; padding: 20px; background-color: #fff; border-radius: 5px; border: 2px solid #EE0115;">
        <p style="margin: 0 0 15px 0; font-size: 16px;"><strong>Need a New Invitation Link?</strong></p>
        <p style="margin: 0 0 15px 0;">Click the button below to request a renewal invitation from the admin team:</p>
        <center>
          <a href="${renewalRequestLink}" class="button">Request Renewal Invitation</a>
        </center>
        <p style="margin: 15px 0 0 0; font-size: 12px; color: #666;">
          This will notify the admin team, who will send you a new invitation link for submission.
        </p>
      </div>

      <p><strong>Important:</strong> Weekly reminders are sent starting 1 month before your renewal is due until your verification is renewed.</p>

      <p>If you have any questions, please contact the HR department.</p>

      <p>Best regards,<br>The Employee Verification Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Employee Verification Portal. All rights reserved.</p>
      <p>You are receiving this email because you are an employee requiring periodic verification.</p>
    </div>
  </div>
</body>
</html>
        `;

        // Initialize Gmail SMTP client
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

        await client.send({
          from: GMAIL_EMAIL,
          to: submission.email,
          subject: "Verification Renewal Reminder - Action Required",
          content: "auto",
          html: emailHtml,
        });

        await client.close();

        const emailError = null; // No error if we reach here

        if (emailError) {
          console.error(`Failed to send email to ${submission.email}:`, emailError);
          failureCount++;
        } else {
          console.log(`Reminder sent to ${submission.email}`);
          
          // Update last_reminder_sent timestamp
          await supabase
            .from("employees")
            .update({ last_reminder_sent: new Date().toISOString() })
            .eq("id", employee.id);
          
          successCount++;
        }
      } catch (employeeError) {
        console.error(`Error processing employee ${employee.employee_number}:`, employeeError);
        failureCount++;
      }
    }

    console.log(`Reminder emails: ${successCount} successful, ${failureCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        failed: failureCount,
        message: `Sent ${successCount} reminder emails` 
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
