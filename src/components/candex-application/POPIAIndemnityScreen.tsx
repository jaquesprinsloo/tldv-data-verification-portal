import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, FileText, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";

interface POPIAIndemnityScreenProps {
  onComplete: (deviceData: DeviceData) => void;
}

export interface DeviceData {
  ipAddress: string;
  gpsLatitude: number;
  gpsLongitude: number;
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  timestamp: string;
}

const FALLBACK_POPIA = "POPIA DECLARATION\n\nPlease contact the administrator – the POPIA document has not been configured yet.";
const FALLBACK_INDEMNITY = "INDEMNITY & CONSENT\n\nPlease contact the administrator – the Indemnity document has not been configured yet.";

export default function POPIAIndemnityScreen({ onComplete }: POPIAIndemnityScreenProps) {
  const [popiaAccepted, setPopiaAccepted] = useState(false);
  const [indemnityAccepted, setIndemnityAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["popia-indemnity-settings-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("popia_indemnity_settings" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) return null;
      return data as any;
    },
  });

  // Generate signed URLs for audio files from private bucket
  const getSignedAudioUrl = async (storedUrl: string | null): Promise<string | null> => {
    if (!storedUrl) return null;
    // If it's already a signed URL, return as-is
    if (storedUrl.includes('/sign/')) return storedUrl;
    // Extract the path from a public URL or use as path directly
    const pathMatch = storedUrl.match(/\/object\/(?:public|sign)\/employee-documents\/(.+?)(?:\?|$)/);
    const path = pathMatch ? pathMatch[1] : storedUrl.replace(/^\//, '');
    if (!path || !path.startsWith('popia-indemnity/')) return storedUrl;
    const { data } = await supabase.storage.from("employee-documents").createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const { data: popiaAudioUrl } = useQuery({
    queryKey: ["popia-audio-signed", settings?.popia_audio_url],
    queryFn: () => getSignedAudioUrl(settings?.popia_audio_url),
    enabled: !!settings?.popia_audio_url,
  });

  const { data: indemnityAudioUrl } = useQuery({
    queryKey: ["indemnity-audio-signed", settings?.indemnity_audio_url],
    queryFn: () => getSignedAudioUrl(settings?.indemnity_audio_url),
    enabled: !!settings?.indemnity_audio_url,
  });

  const popiaText = settings?.popia_text || FALLBACK_POPIA;
  const indemnityText = settings?.indemnity_text || FALLBACK_INDEMNITY;

  const getIPAddress = async (): Promise<string> => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return data.ip;
    } catch {
      return "unknown";
    }
  };

  const getGPS = (): Promise<{ lat: number; lng: number }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 0, lng: 0 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: 0, lng: 0 }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const handleAccept = async () => {
    if (!popiaAccepted || !indemnityAccepted) {
      toast.error("Please accept both the POPIA Declaration and the Indemnity Consent.");
      return;
    }
    setLoading(true);
    try {
      const [ip, gps] = await Promise.all([getIPAddress(), getGPS()]);
      const deviceData: DeviceData = {
        ipAddress: ip,
        gpsLatitude: gps.lat,
        gpsLongitude: gps.lng,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString(),
      };
      onComplete(deviceData);
    } catch {
      toast.error("Failed to collect device data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const AudioPlayer = ({ url, label }: { url: string; label: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/80 border border-zinc-700 mb-3">
      <button
        onClick={() => setPlayingAudio(playingAudio === label ? null : label)}
        className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
      >
        <div className="relative">
          <Volume2 className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        </div>
        <span className="text-sm font-medium">Listen to {label}</span>
      </button>
      {playingAudio === label && (
        <audio src={url} controls autoPlay className="flex-1 h-8" onEnded={() => setPlayingAudio(null)} />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-8" />
        </div>
      </div>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Card className="bg-zinc-950 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Shield className="h-5 w-5 text-red-500" />
              POPIA Declaration & Indemnity Consent
            </CardTitle>
            <p className="text-sm text-zinc-400">
              Please read both documents carefully and accept the terms to proceed.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="popia" className="w-full">
              <TabsList className="w-full bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="popia" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <FileText className="h-4 w-4 mr-1" /> POPIA Declaration
                </TabsTrigger>
                <TabsTrigger value="indemnity" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white">
                  <FileText className="h-4 w-4 mr-1" /> Indemnity & Consent
                </TabsTrigger>
              </TabsList>

              <TabsContent value="popia" className="mt-4 space-y-4">
                {popiaAudioUrl && <AudioPlayer url={popiaAudioUrl} label="POPIA Declaration" />}
                <ScrollArea className="h-[350px] w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{popiaText}</div>
                </ScrollArea>
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <Checkbox
                    id="popia"
                    checked={popiaAccepted}
                    onCheckedChange={(c) => setPopiaAccepted(c as boolean)}
                    disabled={loading}
                    className="mt-0.5 border-zinc-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <label htmlFor="popia" className="text-sm text-zinc-300 cursor-pointer">
                    I have read, understood, and agree to the POPIA Declaration.
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="indemnity" className="mt-4 space-y-4">
                {indemnityAudioUrl && <AudioPlayer url={indemnityAudioUrl} label="Indemnity & Consent" />}
                <ScrollArea className="h-[350px] w-full rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{indemnityText}</div>
                </ScrollArea>
                <div className="flex items-start space-x-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <Checkbox
                    id="indemnity"
                    checked={indemnityAccepted}
                    onCheckedChange={(c) => setIndemnityAccepted(c as boolean)}
                    disabled={loading}
                    className="mt-0.5 border-zinc-600 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <label htmlFor="indemnity" className="text-sm text-zinc-300 cursor-pointer">
                    I have read, understood, and agree to the Indemnity & Consent terms.
                  </label>
                </div>
              </TabsContent>
            </Tabs>

            {/* Electronic signature notice */}
            <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-sm">
              <p className="font-semibold text-red-400 mb-1">Electronic Signature Notice</p>
              <p className="text-zinc-400">
                By clicking "Accept & Continue" below, your IP address, GPS coordinates, device information,
                and the current timestamp will be recorded as your electronic signature.
              </p>
            </div>

            {/* Status indicators */}
            <div className="flex gap-4 text-xs text-zinc-500">
              <span className={popiaAccepted ? "text-green-500" : ""}>
                ● POPIA {popiaAccepted ? "Accepted" : "Pending"}
              </span>
              <span className={indemnityAccepted ? "text-green-500" : ""}>
                ● Indemnity {indemnityAccepted ? "Accepted" : "Pending"}
              </span>
            </div>

            <Button
              onClick={handleAccept}
              disabled={!popiaAccepted || !indemnityAccepted || loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Collecting device data...
                </>
              ) : (
                "Accept & Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
