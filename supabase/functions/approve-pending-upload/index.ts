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
    const extractedData: Record<string, any> = pendingUpload.extracted_data || {};

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
