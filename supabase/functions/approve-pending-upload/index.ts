import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { uploadId, storeId, action, rejectionReason } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const extractedData = pendingUpload.extracted_data || {};

    // Create the actual record based on document type
    if (pendingUpload.document_type === "invoice") {
      const { error } = await supabase.from("invoices").insert({
        store_id: finalStoreId,
        invoice_number: extractedData.invoice_number || `INV-${Date.now()}`,
        invoice_date: extractedData.invoice_date || new Date().toISOString().split("T")[0],
        total_amount: extractedData.total_amount || 0,
        subtotal: extractedData.subtotal || extractedData.total_amount || 0,
        vat_amount: extractedData.vat_amount || 0,
        discount_amount: extractedData.discount_amount || 0,
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
