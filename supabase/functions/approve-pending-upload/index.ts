import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Function to extract invoice data using AI
async function extractInvoiceData(pdfUrl: string, lovableApiKey: string): Promise<Record<string, unknown> | null> {
  try {
    console.log("Starting PDF download from:", pdfUrl);
    
    // Download the PDF
    const fileResponse = await fetch(pdfUrl);
    if (!fileResponse.ok) {
      console.error("Failed to download PDF. Status:", fileResponse.status, "StatusText:", fileResponse.statusText);
      return null;
    }
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    console.log("PDF downloaded, size:", arrayBuffer.byteLength, "bytes");
    
    if (arrayBuffer.byteLength === 0) {
      console.error("PDF file is empty");
      return null;
    }
    
    // Use Deno's standard base64 encoding
    const { encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const pdfBase64 = encode(arrayBuffer);
    
    console.log("PDF converted to base64, length:", pdfBase64.length);

    // Call AI to extract invoice data
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this invoice PDF and extract the following information. Return ONLY valid JSON with these exact fields:
{
  "invoice_number": "string - the invoice number",
  "invoice_date": "string - date in YYYY-MM-DD format",
  "subtotal": number - subtotal amount before tax (excluding VAT),
  "vat_amount": number - VAT/tax amount (look for "VAT", "VAT 15%", or similar line items),
  "discount_amount": number - any discount amount (0 if none),
  "total_amount": number - final total amount,
  "polygraph_amount": number - total for items containing "Polygraph Examination" or "Polygraph" in description,
  "risk_assessment_amount": number - total for items containing "Risk Assessment" in description,
  "travel_amount": number - total for items containing "Travel" or "Transport" in description,
  "tolls_amount": number - total for items containing "Toll" or "Tolls" in description,
  "venue_amount": number - total for items containing "Venue" in description,
  "accommodation_amount": number - total for items containing "Accommodation" or "Lodging" in description,
  "other_amount": number - any other fees not categorized above,
  "line_items": [
    {
      "description": "string - item description exactly as it appears",
      "quantity": number,
      "unit_price": number,
      "amount": number,
      "category": "string - one of: polygraph, risk_assessment, travel, tolls, venue, accommodation, vat, other"
    }
  ]
}

CRITICAL CATEGORIZATION RULES - Read each line item description carefully:
- If description contains "Polygraph Examination" or "Polygraph" → category is "polygraph", add to polygraph_amount
- If description contains "Risk Assessment" → category is "risk_assessment", add to risk_assessment_amount  
- If description contains "Travel" or "Transport" or "Mileage" → category is "travel", add to travel_amount
- If description contains "Toll" or "Tolls" → category is "tolls", add to tolls_amount
- If description contains "Venue" → category is "venue", add to venue_amount
- If description contains "Accommodation" or "Lodging" → category is "accommodation", add to accommodation_amount
- If description contains "VAT" → category is "vat", this is the vat_amount
- Everything else → category is "other", add to other_amount

IMPORTANT INSTRUCTIONS:
- Read EVERY line item in the invoice and categorize based on the keywords above
- All amounts should be numbers (not strings)
- If you can't find a value, use 0 for numbers
- The currency is South African Rand (ZAR/R)
- Make sure vat_amount is extracted from the VAT line item, NOT included in other totals`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error. Status:", response.status, "Response:", errorText);
      return null;
    }

    const aiResponse = await response.json();
    console.log("AI Response received");
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response:", JSON.stringify(aiResponse));
      return null;
    }

    console.log("AI content:", content.substring(0, 500));

    // Parse the JSON from the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr.trim());
    console.log("Parsed invoice data - polygraph:", parsed.polygraph_amount, "travel:", parsed.travel_amount, "vat:", parsed.vat_amount);
    return parsed;
  } catch (error) {
    console.error("Error extracting invoice data:", error instanceof Error ? error.message : error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { uploadId, storeId, action, rejectionReason } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header to extract user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is master admin
    const { data: isMasterAdmin } = await supabase.rpc("is_master_admin", { _user_id: user.id });
    
    if (!isMasterAdmin) {
      return new Response(JSON.stringify({ error: "Only master admins can approve uploads" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the pending upload
    const { data: pendingUpload, error: fetchError } = await supabase
      .from("pending_document_uploads")
      .select("*")
      .eq("id", uploadId)
      .single();

    if (fetchError || !pendingUpload) {
      return new Response(JSON.stringify({ error: "Pending upload not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reject") {
      // Update status to rejected
      const { error: updateError } = await supabase
        .from("pending_document_uploads")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Rejected by admin",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", uploadId);

      if (updateError) {
        console.error("Error rejecting upload:", updateError);
        return new Response(JSON.stringify({ error: "Failed to reject upload" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "Upload rejected" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approve flow - create the actual record
    const finalStoreId = storeId || pendingUpload.matched_store_id;
    
    if (!finalStoreId) {
      return new Response(JSON.stringify({ error: "Store ID is required for approval" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let createError: Error | null = null;
    let extractedData = pendingUpload.extracted_data || {};

    // Create the actual record based on document type
    if (pendingUpload.document_type === "invoice") {
      // Extract detailed invoice data using AI
      console.log("Extracting invoice data from:", pendingUpload.file_url);
      const invoiceData = await extractInvoiceData(pendingUpload.file_url, lovableApiKey);
      
      if (invoiceData) {
        console.log("Extracted invoice data:", JSON.stringify(invoiceData));
        extractedData = { ...extractedData, ...invoiceData };
      } else {
        console.log("Failed to extract invoice data, using basic data");
      }

      const { error } = await supabase.from("invoices").insert({
        store_id: finalStoreId,
        invoice_number: extractedData.invoice_number || `INV-${Date.now()}`,
        invoice_date: extractedData.invoice_date || new Date().toISOString().split("T")[0],
        total_amount: extractedData.total_amount || 0,
        subtotal: extractedData.subtotal || extractedData.total_amount || 0,
        vat_amount: extractedData.vat_amount || 0,
        discount_amount: extractedData.discount_amount || 0,
        polygraph_amount: extractedData.polygraph_amount || 0,
        risk_assessment_amount: extractedData.risk_assessment_amount || 0,
        travel_amount: extractedData.travel_amount || 0,
        tolls_amount: extractedData.tolls_amount || 0,
        accommodation_amount: extractedData.accommodation_amount || 0,
        other_amount: (extractedData.other_amount || 0) + (extractedData.venue_amount || 0),
        invoice_url: pendingUpload.file_url,
        extracted_data: extractedData,
      });
      if (error) createError = error;
    } else if (pendingUpload.document_type === "polygraph_report") {
      const { error } = await supabase.from("examinations").insert({
        store_id: finalStoreId,
        examination_type: "periodic_screening",
        examination_date: extractedData.examination_date || new Date().toISOString().split("T")[0],
        result: extractedData.result === "pass" ? "pass" : extractedData.result === "fail" ? "fail" : "pending",
        report_url: pendingUpload.file_url,
        notes: `Uploaded from pending review. Examiner: ${extractedData.examiner_name || "Unknown"}`,
      });
      if (error) createError = error;
    } else if (pendingUpload.document_type === "risk_assessment") {
      const { error } = await supabase.from("risk_assessments").insert({
        store_id: finalStoreId,
        assessment_date: extractedData.assessment_date || new Date().toISOString().split("T")[0],
        result: extractedData.result === "clear" ? "clear" : extractedData.result === "flagged" ? "flagged" : "pending",
        report_url: pendingUpload.file_url,
        assessor_name: extractedData.assessor_name || "Unknown",
        notes: "Uploaded from pending review",
      });
      if (error) createError = error;
    }

    if (createError) {
      console.error("Error creating record:", createError);
      return new Response(JSON.stringify({ error: "Failed to create record from upload" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the pending upload status
    const { error: updateError } = await supabase
      .from("pending_document_uploads")
      .update({
        status: "approved",
        matched_store_id: finalStoreId,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    if (updateError) {
      console.error("Error updating pending upload status:", updateError);
    }

    return new Response(JSON.stringify({ success: true, message: "Upload approved and record created" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing approval:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
