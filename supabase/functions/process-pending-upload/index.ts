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
    const { fileUrl, accountId, documentType, fileName } = await req.json();
    
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

    // Get all stores for this account
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("id, store_name, store_code, town, center_mall_name")
      .eq("account_id", accountId);

    if (storesError) {
      console.error("Error fetching stores:", storesError);
      return new Response(JSON.stringify({ error: "Failed to fetch stores" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storeList = (stores || []).map(s => ({
      id: s.id,
      name: s.store_name,
      code: s.store_code,
      town: s.town,
      mall: s.center_mall_name,
    }));

    // Use AI to extract store name from the document
    const systemPrompt = `You are a document analyzer. Your task is to:
1. Extract the store/branch name from the uploaded document (invoice, report, etc.)
2. Match it to one of the stores in the provided list
3. Extract any other relevant data based on document type

Document type: ${documentType}

Available stores:
${JSON.stringify(storeList, null, 2)}

Respond using the extract_document_info function.`;

    const userPrompt = `Analyze this document: ${fileName}
File URL: ${fileUrl}

Extract the store name and match it to one of the available stores. Also extract any relevant data like:
- For invoices: invoice number, date, amounts
- For polygraph reports: examination date, result, examiner name
- For risk assessments: assessment date, result, assessor name

If you cannot determine the store, set matched_store_id to null.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_info",
              description: "Extract document information and match to a store",
              parameters: {
                type: "object",
                properties: {
                  extracted_store_name: {
                    type: "string",
                    description: "The store name as it appears in the document",
                  },
                  matched_store_id: {
                    type: "string",
                    description: "The UUID of the matched store from the list, or null if no match",
                    nullable: true,
                  },
                  confidence_score: {
                    type: "number",
                    description: "Confidence of the match from 0 to 1",
                  },
                  extracted_data: {
                    type: "object",
                    description: "Any additional extracted data based on document type",
                    properties: {
                      invoice_number: { type: "string" },
                      invoice_date: { type: "string" },
                      total_amount: { type: "number" },
                      examination_date: { type: "string" },
                      result: { type: "string" },
                      examiner_name: { type: "string" },
                      assessment_date: { type: "string" },
                      assessor_name: { type: "string" },
                    },
                  },
                },
                required: ["extracted_store_name", "confidence_score"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_document_info" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      // Still create the record but without AI extraction
      const { data: pendingUpload, error: insertError } = await supabase
        .from("pending_document_uploads")
        .insert({
          account_id: accountId,
          document_type: documentType,
          file_url: fileUrl,
          file_name: fileName,
          uploaded_by: user.id,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting pending upload:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create pending upload" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        data: pendingUpload,
        message: "Document uploaded but AI extraction failed. Manual store assignment required." 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse));

    let extractedInfo = {
      extracted_store_name: null as string | null,
      matched_store_id: null as string | null,
      confidence_score: 0,
      extracted_data: {} as Record<string, unknown>,
    };

    // Parse the tool call response
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        extractedInfo = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Error parsing AI response:", e);
      }
    }

    // Create the pending upload record
    const { data: pendingUpload, error: insertError } = await supabase
      .from("pending_document_uploads")
      .insert({
        account_id: accountId,
        document_type: documentType,
        file_url: fileUrl,
        file_name: fileName,
        extracted_store_name: extractedInfo.extracted_store_name,
        matched_store_id: extractedInfo.matched_store_id,
        confidence_score: extractedInfo.confidence_score,
        extracted_data: extractedInfo.extracted_data,
        uploaded_by: user.id,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting pending upload:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create pending upload" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: pendingUpload }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing upload:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
