import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Call AI to extract invoice data from base64 PDF
async function callAIForExtraction(pdfBase64: string, lovableApiKey: string): Promise<Record<string, unknown> | null> {
  console.log("Calling AI for extraction, base64 length:", pdfBase64.length);
  
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
  "travel_amount": number - total for items containing "Travel" or "Transport" or "Mileage" in description,
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
}

// Download PDF from private Supabase storage and convert to base64
// deno-lint-ignore no-explicit-any
async function downloadPdfFromStorage(fileUrl: string, supabase: any): Promise<string | null> {
  console.log("Attempting to download PDF from storage:", fileUrl);
  
  try {
    // Extract the file path from the URL
    // URL format: https://xxx.supabase.co/storage/v1/object/public/bucket-name/path/to/file.pdf
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split('/storage/v1/object/public/');
    
    if (pathParts.length < 2) {
      console.error("Could not parse storage path from URL");
      return null;
    }
    
    const fullPath = decodeURIComponent(pathParts[1]);
    const bucketName = fullPath.split('/')[0];
    const filePath = fullPath.substring(bucketName.length + 1);
    
    console.log("Bucket:", bucketName, "Path:", filePath);
    
    // Download using Supabase client (works for private buckets)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(filePath);
    
    if (error) {
      console.error("Supabase storage download error:", error.message);
      return null;
    }
    
    if (!data) {
      console.error("No data returned from storage");
      return null;
    }
    
    const arrayBuffer = await data.arrayBuffer();
    console.log("PDF downloaded successfully, size:", arrayBuffer.byteLength, "bytes");
    
    if (arrayBuffer.byteLength === 0) {
      console.error("PDF file is empty");
      return null;
    }
    
    const base64 = encode(arrayBuffer);
    console.log("PDF converted to base64, length:", base64.length);
    return base64;
  } catch (e) {
    console.error("Error downloading from storage:", e);
    return null;
  }
}

// Function to extract invoice data using AI
// deno-lint-ignore no-explicit-any
async function extractInvoiceData(pdfUrl: string, lovableApiKey: string, supabase: any): Promise<Record<string, unknown> | null> {
  try {
    const pdfBase64 = await downloadPdfFromStorage(pdfUrl, supabase);
    
    if (!pdfBase64) {
      console.error("Could not download PDF from storage");
      return null;
    }
    
    return await callAIForExtraction(pdfBase64, lovableApiKey);
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
      // Delete file from pending-documents bucket before rejecting
      if (pendingUpload.file_url) {
        try {
          const urlObj = new URL(pendingUpload.file_url);
          const pathParts = urlObj.pathname.split('/pending-documents/');
          if (pathParts[1]) {
            const filePath = decodeURIComponent(pathParts[1]);
            console.log("Deleting rejected file from storage:", filePath);
            const { error: storageError } = await supabase.storage
              .from("pending-documents")
              .remove([filePath]);
            
            if (storageError) {
              console.error("Error deleting file from storage:", storageError);
              // Continue with rejection even if storage delete fails
            } else {
              console.log("Successfully deleted rejected file from storage");
            }
          }
        } catch (e) {
          console.error("Error parsing file URL for deletion:", e);
          // Continue with rejection even if URL parsing fails
        }
      }

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

      return new Response(JSON.stringify({ success: true, message: "Upload rejected and file deleted" }), {
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
      const invoiceData = await extractInvoiceData(pendingUpload.file_url, lovableApiKey, supabase);
      
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
