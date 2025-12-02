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
  "vat_amount": number - VAT/tax amount,
  "discount_amount": number - any discount amount (0 if none),
  "total_amount": number - final total amount,
  "polygraph_amount": number - total for polygraph examinations/tests,
  "risk_assessment_amount": number - total for risk assessments/background checks,
  "travel_amount": number - total for travel/transport/mileage,
  "tolls_amount": number - total for toll fees,
  "accommodation_amount": number - total for accommodation/lodging,
  "other_amount": number - any other fees not categorized above,
  "line_items": [
    {
      "description": "string - item description",
      "quantity": number,
      "unit_price": number,
      "amount": number,
      "category": "string - one of: polygraph, risk_assessment, travel, tolls, accommodation, vat, other"
    }
  ]
}

IMPORTANT INSTRUCTIONS:
- Look at the TOP of the invoice for the BILLING ADDRESS or "BILL TO" section - this identifies which store/branch the invoice is for
- The billing address typically has the format: "Company Name t/a Branch Name" followed by address details
- "t/a" means "trading as" - extract the name after "t/a" as the trading_as_name
- Extract the last word/location from the trading name as the branch_name (e.g., "Acornhoek" from "Cash Crusaders Acornhoek")
- All amounts should be numbers (not strings)
- If you can't find a value, use 0 for numbers or empty string for text
- Categorize line items: polygraph examinations, risk assessments, travel/transport, tolls, accommodation, or other
- The currency is South African Rand (ZAR/R)
- Sum up amounts by category into the respective _amount fields`,
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
