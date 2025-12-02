import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "No PDF data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Gemini for PDF analysis since it handles multimodal well
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
  "billing_info": {
    "full_name": "string - the full company/business name as it appears (e.g., 'Cash Crusaders Stores (Pty) Ltd t/a Cash Crusaders Acornhoek')",
    "trading_as_name": "string - the 'trading as' or 't/a' name if present (e.g., 'Cash Crusaders Acornhoek'). This is usually after 't/a' or 'trading as'",
    "branch_name": "string - just the branch/location name without company prefix (e.g., 'Acornhoek' from 'Cash Crusaders Acornhoek')",
    "shop_number": "string - shop/unit number if present (e.g., 'Shop 9')",
    "mall_name": "string - mall or shopping center name if present (e.g., 'Acornhoek Mall')",
    "street_address": "string - street address (e.g., 'R40 & Green Valley Road, Greenvalley')",
    "town": "string - town or city name (e.g., 'Acornhoek')",
    "postal_code": "string - postal code (e.g., '1360')",
    "vat_number": "string - VAT registration number if present"
  },
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
- Look at the TOP of the invoice for the BILLING ADDRESS or "BILL TO" section
- Read EVERY line item in the invoice and categorize based on the keywords above
- All amounts should be numbers (not strings)
- If you can't find a value, use 0 for numbers or empty string for text
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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze invoice" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON from the response
    let extractedData;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      extractedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse invoice data", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Extract invoice error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
