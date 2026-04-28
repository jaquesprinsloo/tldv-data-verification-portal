import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, FileText, Volume2, Camera, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";

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
  selfieUrl?: string | null;
}

const FALLBACK_POPIA = "POPIA DECLARATION\n\nPlease contact the administrator – the POPIA document has not been configured yet.";
const FALLBACK_INDEMNITY = "INDEMNITY & CONSENT\n\nPlease contact the administrator – the Indemnity document has not been configured yet.";

const extractStoredAudioPath = (storedUrl: string | null): string | null => {
  if (!storedUrl) return null;

  const pathMatch = storedUrl.match(/\/object\/(?:public|sign)\/employee-documents\/(.+?)(?:\?|$)/);
  const extractedPath = pathMatch ? decodeURIComponent(pathMatch[1]) : storedUrl.replace(/^\//, "");

  return extractedPath.startsWith("popia-indemnity/") ? extractedPath : null;
};

export default function POPIAIndemnityScreen({ onComplete }: POPIAIndemnityScreenProps) {
  const [popiaAccepted, setPopiaAccepted] = useState(false);
  const [indemnityAccepted, setIndemnityAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const getSignedAudioUrl = async (storedUrl: string | null): Promise<string | null> => {
    const path = extractStoredAudioPath(storedUrl);
    if (!path) return null;

    const { data, error } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(path, 3600);

    if (error) {
      console.error("Failed to create signed POPIA audio URL:", error);
      return null;
    }

    return data?.signedUrl ?? null;
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

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setSelfieDataUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 0);
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError(
        "Camera access was denied or unavailable. You can upload a photo of yourself instead."
      );
    }
  }, []);

  const captureSelfie = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror so the saved image matches what the user sees
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setSelfieDataUrl(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const handleSelfieUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image is too large. Maximum size is 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSelfieDataUrl(reader.result as string);
    reader.onerror = () => toast.error("Failed to read image.");
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const retakeSelfie = useCallback(() => {
    setSelfieDataUrl(null);
    setCameraError(null);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const uploadSelfie = async (): Promise<string | null> => {
    if (!selfieDataUrl) return null;
    const blob = dataUrlToBlob(selfieDataUrl);
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("candex-selfies")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) {
      console.error("Selfie upload failed:", error);
      throw new Error("Failed to upload selfie");
    }
    const { data } = supabase.storage.from("candex-selfies").getPublicUrl(path);
    return data.publicUrl;
  };

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
    if (!selfieDataUrl) {
      toast.error("Please take or upload a selfie to verify your identity.");
      return;
    }
    setLoading(true);
    try {
      const [ip, gps, selfieUrl] = await Promise.all([
        getIPAddress(),
        getGPS(),
        uploadSelfie(),
      ]);
      const deviceData: DeviceData = {
        ipAddress: ip,
        gpsLatitude: gps.lat,
        gpsLongitude: gps.lng,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString(),
        selfieUrl,
      };
      onComplete(deviceData);
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAudio = useCallback((label: string, url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    if (playingAudio === label) {
      setPlayingAudio(null);
      return;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingAudio(label);

    audio.onended = () => {
      setPlayingAudio(null);
      audioRef.current = null;
    };

    audio.onerror = () => {
      setPlayingAudio(null);
      audioRef.current = null;
      toast.error("Failed to play audio");
    };

    audio.play().catch(() => {
      setPlayingAudio(null);
      toast.error("Playback failed");
    });
  }, [playingAudio]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const AudioPlayer = ({ url, label }: { url: string; label: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/80 border border-zinc-700 mb-3">
      <button
        onClick={() => handlePlayAudio(label, url)}
        className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
      >
        <div className="relative">
          <Volume2 className="h-5 w-5" />
          {playingAudio !== label && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
        </div>
        <span className="text-sm font-medium">
          {playingAudio === label ? "Playing..." : `Listen to ${label}`}
        </span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black">
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
                <TabsTrigger value="popia" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white text-xs sm:text-sm">
                  <FileText className="h-4 w-4 mr-1 shrink-0" /> POPIA
                </TabsTrigger>
                <TabsTrigger value="indemnity" className="flex-1 data-[state=active]:bg-red-600 data-[state=active]:text-white text-xs sm:text-sm">
                  <FileText className="h-4 w-4 mr-1 shrink-0" /> Indemnity & Consent
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
                    I have read, listened and understood the POPIA Declaration and hereby{" "}
                    <span className="font-bold text-red-500 underline">Accept</span> this declaration.
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
                    I have read, listened and understood the Indemnity & Consent terms and hereby{" "}
                    <span className="font-bold text-red-500 underline">Accept</span> these terms.
                  </label>
                </div>
              </TabsContent>
            </Tabs>

            <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-sm">
              <p className="font-semibold text-red-400 mb-1">Electronic Signature Notice</p>
              <p className="text-zinc-400">
                By clicking "Accept & Continue" below, your IP address, GPS coordinates, device information,
                a verification selfie, and the current timestamp will be recorded as your electronic signature.
              </p>
            </div>

            {/* ── SELFIE VERIFICATION ── */}
            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-red-500" />
                <p className="font-semibold text-white text-sm">
                  Identity Verification Selfie <span className="text-red-500">*</span>
                </p>
                <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-600/40">
                  Required
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                You must take a clear photo of your face, or upload a recent photo of yourself, in order to
                continue. This is used to verify the identity of the person completing this application.
              </p>

              {selfieDataUrl ? (
                <div className="space-y-3">
                  <img
                    src={selfieDataUrl}
                    alt="Verification selfie preview"
                    className="rounded-lg border border-zinc-700 w-full max-w-xs mx-auto"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={retakeSelfie}
                    disabled={loading}
                    className="w-full border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" /> Retake / Replace Photo
                  </Button>
                </div>
              ) : cameraOn ? (
                <div className="space-y-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="rounded-lg border border-zinc-700 w-full max-w-xs mx-auto"
                    style={{ transform: "scaleX(-1)" }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={captureSelfie}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Camera className="h-4 w-4 mr-2" /> Capture
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={stopCamera}
                      className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      type="button"
                      onClick={startCamera}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Camera className="h-4 w-4 mr-2" /> Take Selfie
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    >
                      <Upload className="h-4 w-4 mr-2" /> Upload Photo
                    </Button>
                  </div>
                  {cameraError && (
                    <p className="text-xs text-red-400">{cameraError}</p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleSelfieUpload}
                className="hidden"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex gap-4 text-xs text-zinc-500">
              <span className={popiaAccepted ? "text-green-500" : ""}>
                ● POPIA {popiaAccepted ? "Accepted" : "Pending"}
              </span>
              <span className={indemnityAccepted ? "text-green-500" : ""}>
                ● Indemnity {indemnityAccepted ? "Accepted" : "Pending"}
              </span>
              <span className={selfieDataUrl ? "text-green-500" : ""}>
                ● Selfie {selfieDataUrl ? "Captured" : "Pending"}
              </span>
            </div>

            <Button
              onClick={handleAccept}
              disabled={!popiaAccepted || !indemnityAccepted || !selfieDataUrl || loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting verification...
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
