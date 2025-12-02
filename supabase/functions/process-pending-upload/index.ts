import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to normalize strings for comparison
function normalizeString(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove special characters
    .trim();
}

// Helper function to extract branch name from full store name
function extractBranchName(storeName: string): string {
  // Remove common prefixes like "Cash Crusaders Stores PTY (LTD) t/a Cash Crusaders"
  const patterns = [
    /cash\s*crusaders?\s*stores?\s*\(?pty\)?\s*\(?ltd\)?\s*t\/a\s*cash\s*crusaders?\s*/gi,
    /cash\s*crusaders?\s*/gi,
    /t\/a\s*/gi,
  ];
  
  let result = storeName;
  for (const pattern of patterns) {
    result = result.replace(pattern, "").trim();
  }
  return result;
}

// Calculate match score between invoice billing info and a store
function calculateMatchScore(
  billingInfo: {
    trading_as_name?: string;
    branch_name?: string;
    mall_name?: string;
    town?: string;
    postal_code?: string;
    full_name?: string;
  },
  store: {
    store_name: string;
    store_code: string;
    town: string | null;
    center_mall_name: string | null;
    postal_code: string | null;
  }
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  const storeBranchName = extractBranchName(store.store_name);
  const normalizedStoreName = normalizeString(store.store_name);
  const normalizedStoreBranch = normalizeString(storeBranchName);
  
  // Check trading_as_name match
  if (billingInfo.trading_as_name) {
    const normalizedTradingAs = normalizeString(billingInfo.trading_as_name);
    const tradingAsBranch = normalizeString(extractBranchName(billingInfo.trading_as_name));
    
    if (normalizedStoreName.includes(normalizedTradingAs) || normalizedTradingAs.includes(normalizedStoreName)) {
      score += 40;
      reasons.push("Trading name matches store name");
    } else if (normalizedStoreBranch === tradingAsBranch) {
      score += 35;
      reasons.push("Branch name matches");
    } else if (normalizedStoreBranch.includes(tradingAsBranch) || tradingAsBranch.includes(normalizedStoreBranch)) {
      score += 25;
      reasons.push("Partial branch name match");
    }
  }
  
  // Check branch_name match
  if (billingInfo.branch_name) {
    const normalizedBranch = normalizeString(billingInfo.branch_name);
    if (normalizedStoreBranch === normalizedBranch) {
      score += 30;
      reasons.push("Branch location matches exactly");
    } else if (normalizedStoreBranch.includes(normalizedBranch) || normalizedBranch.includes(normalizedStoreBranch)) {
      score += 20;
      reasons.push("Branch location partial match");
    }
  }
  
  // Check mall/center name match
  if (billingInfo.mall_name && store.center_mall_name) {
    const normalizedMall = normalizeString(billingInfo.mall_name);
    const normalizedStoreMall = normalizeString(store.center_mall_name);
    if (normalizedMall === normalizedStoreMall) {
      score += 15;
      reasons.push("Mall name matches");
    } else if (normalizedMall.includes(normalizedStoreMall) || normalizedStoreMall.includes(normalizedMall)) {
      score += 10;
      reasons.push("Partial mall name match");
    }
  }
  
  // Check town match
  if (billingInfo.town && store.town) {
    const normalizedTown = normalizeString(billingInfo.town);
    const normalizedStoreTown = normalizeString(store.town);
    if (normalizedTown === normalizedStoreTown) {
      score += 10;
      reasons.push("Town matches");
    } else if (normalizedTown.includes(normalizedStoreTown) || normalizedStoreTown.includes(normalizedTown)) {
      score += 5;
      reasons.push("Partial town match");
    }
  }
  
  // Check postal code match
  if (billingInfo.postal_code && store.postal_code) {
    if (billingInfo.postal_code === store.postal_code) {
      score += 5;
      reasons.push("Postal code matches");
    }
  }
  
  return { score, reasons };
}

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

    // Get all stores for this account with full address details
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select("id, store_name, store_code, town, center_mall_name, postal_code, shop_number, street_name")
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
      postal_code: s.postal_code,
      shop_number: s.shop_number,
      branch: extractBranchName(s.store_name),
    }));

    // Use AI to extract store name from the document
    const systemPrompt = `You are a document analyzer specialized in South African business invoices. Your task is to:
1. Extract the BILLING ADDRESS information from the invoice - this is the store/branch the invoice is for
2. Look for the "t/a" (trading as) name which indicates the specific branch
3. Extract address details like mall name, town, postal code
4. Match to one of the stores in the provided list
5. Extract any other relevant data based on document type

Document type: ${documentType}

Available stores (with branch names extracted):
${JSON.stringify(storeList, null, 2)}

IMPORTANT: The billing address typically appears at the top of invoices. Look for patterns like:
- "Company Name (Pty) Ltd t/a Store Branch Name"
- Shop number, Mall/Center name
- Street address
- Town/City
- Postal code

The branch name is the key identifier - match it to the 'branch' field in the store list.`;

    const userPrompt = `Analyze this document: ${fileName}
File URL: ${fileUrl}

1. First, find the BILLING ADDRESS section (usually "Bill To" or "Invoice To" at the top)
2. Extract the store name after "t/a" or "trading as"
3. Extract the branch/location name (the last part, like "Acornhoek" from "Cash Crusaders Acornhoek")
4. Extract mall name, town, and postal code
5. Match to the most similar store in the list

Respond using the extract_document_info function.`;

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
              description: "Extract document billing information and match to a store",
              parameters: {
                type: "object",
                properties: {
                  billing_info: {
                    type: "object",
                    description: "The billing address information from the document",
                    properties: {
                      full_name: { type: "string", description: "Full company/business name as it appears" },
                      trading_as_name: { type: "string", description: "The name after 't/a' or 'trading as'" },
                      branch_name: { type: "string", description: "Just the branch/location name (e.g., 'Acornhoek')" },
                      mall_name: { type: "string", description: "Mall or shopping center name" },
                      town: { type: "string", description: "Town or city" },
                      postal_code: { type: "string", description: "Postal code" },
                    },
                  },
                  extracted_store_name: {
                    type: "string",
                    description: "The full store name as it appears in the document billing section",
                  },
                  matched_store_id: {
                    type: "string",
                    description: "The UUID of the best matched store from the list, or null if no good match",
                    nullable: true,
                  },
                  confidence_score: {
                    type: "number",
                    description: "Confidence of the match from 0 to 1 (0.8+ for strong match, 0.5-0.8 for partial match)",
                  },
                  match_reasons: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of reasons why the store was matched",
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
                required: ["extracted_store_name", "confidence_score", "billing_info"],
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
      billing_info: {} as Record<string, string>,
      match_reasons: [] as string[],
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

    // If AI didn't provide a match but we have billing info, try to match ourselves
    if (!extractedInfo.matched_store_id && extractedInfo.billing_info && stores && stores.length > 0) {
      let bestMatch = { storeId: null as string | null, score: 0, reasons: [] as string[] };
      
      for (const store of stores) {
        const result = calculateMatchScore(extractedInfo.billing_info, store);
        if (result.score > bestMatch.score) {
          bestMatch = { storeId: store.id, score: result.score, reasons: result.reasons };
        }
      }
      
      // Only use the match if score is reasonable (at least 25 out of 100)
      if (bestMatch.score >= 25) {
        extractedInfo.matched_store_id = bestMatch.storeId;
        extractedInfo.confidence_score = Math.min(bestMatch.score / 100, 0.95);
        extractedInfo.match_reasons = bestMatch.reasons;
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
        extracted_data: {
          ...extractedInfo.extracted_data,
          billing_info: extractedInfo.billing_info,
          match_reasons: extractedInfo.match_reasons,
        },
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
