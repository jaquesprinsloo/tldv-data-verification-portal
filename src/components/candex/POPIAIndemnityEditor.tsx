import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Save, Upload, Trash2, Volume2, FileText, Loader2 } from "lucide-react";

export default function POPIAIndemnityEditor() {
  const queryClient = useQueryClient();
  const [popiaText, setPopiaText] = useState("");
  const [indemnityText, setIndemnityText] = useState("");
  const [popiaAudioUrl, setPopiaAudioUrl] = useState<string | null>(null);
  const [indemnityAudioUrl, setIndemnityAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const { isLoading } = useQuery({
    queryKey: ["popia-indemnity-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("popia_indemnity_settings" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as any;
    },
    meta: {
      onSettled: (data: any) => {
        if (data) {
          setPopiaText(data.popia_text);
          setIndemnityText(data.indemnity_text);
          setPopiaAudioUrl(data.popia_audio_url);
          setIndemnityAudioUrl(data.indemnity_audio_url);
          setSettingsId(data.id);
        }
      },
    },
  });

  // Use effect-like approach since meta.onSettled may not fire
  const { data: settings } = useQuery({
    queryKey: ["popia-indemnity-settings-init"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("popia_indemnity_settings" as any)
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      if (data && !settingsId) {
        const d = data as any;
        setPopiaText(d.popia_text);
        setIndemnityText(d.indemnity_text);
        setPopiaAudioUrl(d.popia_audio_url);
        setIndemnityAudioUrl(d.indemnity_audio_url);
        setSettingsId(d.id);
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settingsId) throw new Error("No settings record found");
      const { error } = await supabase
        .from("popia_indemnity_settings" as any)
        .update({
          popia_text: popiaText,
          indemnity_text: indemnityText,
          popia_audio_url: popiaAudioUrl,
          indemnity_audio_url: indemnityAudioUrl,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settingsId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["popia-indemnity-settings"] });
      toast.success("POPIA & Indemnity settings saved successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleAudioUpload = async (file: File, type: "popia" | "indemnity") => {
    setUploading(type);
    try {
      const ext = file.name.split(".").pop();
      const path = `popia-indemnity/${type}-audio-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("employee-documents")
        .upload(path, file);
      if (uploadError) throw uploadError;

      // Store the path, and create a signed URL for preview
      const { data: signedData } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(path, 3600);
      const previewUrl = signedData?.signedUrl || path;

      if (type === "popia") setPopiaAudioUrl(previewUrl);
      else setIndemnityAudioUrl(previewUrl);

      toast.success(`${type === "popia" ? "POPIA" : "Indemnity"} audio uploaded`);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">POPIA & Indemnity Documents</h2>
          <p className="text-sm text-muted-foreground">
            Edit the legal documents and upload audio explainers shown to applicants
          </p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="popia" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="popia">
            <FileText className="h-4 w-4 mr-1" /> POPIA Declaration
          </TabsTrigger>
          <TabsTrigger value="indemnity">
            <FileText className="h-4 w-4 mr-1" /> Indemnity & Consent
          </TabsTrigger>
        </TabsList>

        {(["popia", "indemnity"] as const).map((type) => (
          <TabsContent key={type} value={type} className="mt-4 space-y-4">
            {/* Audio section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Audio Explainer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(type === "popia" ? popiaAudioUrl : indemnityAudioUrl) ? (
                  <div className="space-y-2">
                    <audio
                      src={(type === "popia" ? popiaAudioUrl : indemnityAudioUrl)!}
                      controls
                      className="w-full h-10"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => type === "popia" ? setPopiaAudioUrl(null) : setIndemnityAudioUrl(null)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Remove Audio
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Label
                      htmlFor={`${type}-audio`}
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-muted-foreground/40 hover:border-primary transition-colors text-sm"
                    >
                      {uploading === type ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload Audio File
                    </Label>
                    <input
                      id={`${type}-audio`}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAudioUpload(f, type);
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      MP3, WAV, M4A supported
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document text */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Document Text
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={type === "popia" ? popiaText : indemnityText}
                  onChange={(e) => type === "popia" ? setPopiaText(e.target.value) : setIndemnityText(e.target.value)}
                  className="min-h-[400px] font-mono text-sm leading-relaxed"
                  placeholder="Enter document text..."
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
