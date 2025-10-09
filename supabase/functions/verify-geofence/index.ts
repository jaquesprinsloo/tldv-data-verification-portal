import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeofenceRequest {
  address: string;
  latitude: number;
  longitude: number;
}

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, latitude, longitude }: GeofenceRequest = await req.json();

    console.log("Verifying geofence for address:", address);
    console.log("User coordinates:", latitude, longitude);

    // Use Google Maps Geocoding API to convert address to coordinates
    const googleMapsApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    
    if (!googleMapsApiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleMapsApiKey}`;
    
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status !== "OK" || !geocodeData.results?.[0]) {
      console.error("Geocoding failed:", geocodeData.status);
      return new Response(
        JSON.stringify({
          verified: false,
          distance: null,
          error: "Unable to verify address location",
          addressCoordinates: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const addressLocation = geocodeData.results[0].geometry.location;
    const addressLat = addressLocation.lat;
    const addressLng = addressLocation.lng;

    console.log("Address coordinates:", addressLat, addressLng);

    // Calculate distance between user location and address
    const distance = calculateDistance(latitude, longitude, addressLat, addressLng);

    console.log("Distance:", distance, "meters");

    // Geofence threshold: 15 meters
    const GEOFENCE_THRESHOLD = 15;
    const verified = distance <= GEOFENCE_THRESHOLD;
    const flagged = distance > GEOFENCE_THRESHOLD;

    return new Response(
      JSON.stringify({
        verified,
        flagged,
        distance: Math.round(distance),
        threshold: GEOFENCE_THRESHOLD,
        addressCoordinates: {
          lat: addressLat,
          lng: addressLng,
        },
        userCoordinates: {
          lat: latitude,
          lng: longitude,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in geofence verification:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        verified: false,
        distance: null,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
