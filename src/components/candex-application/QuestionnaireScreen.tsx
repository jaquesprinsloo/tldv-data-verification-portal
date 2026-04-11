import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, Plus, Trash2, CalendarIcon, PlayCircle, Video, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";
import type { Json } from "@/integrations/supabase/types";

// Shared state for sticky audio player in header
let setGlobalAudio: ((audio: { url: string; label: string } | null) => void) | null = null;

const VideoPlayButton = ({ videoUrl, label }: { videoUrl: string; label: string }) => {
  const [open, setOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const isAudio = /\.(mp3|wav|ogg|aac|m4a|flac|wma)/i.test(videoUrl);

  const handleClick = () => {
    setShowPulse(false);
    if (isAudio && setGlobalAudio) {
      setGlobalAudio({ url: videoUrl, label });
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-600/20 border border-red-600/40 text-red-400 hover:bg-red-600/30 hover:text-red-300 transition-colors text-xs font-medium text-center"
      >
        <PlayCircle className="h-4 w-4" />
        <span>{isAudio ? "Listen" : "Watch Video"}</span>
        {showPulse && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        )}
      </button>

      {!isAudio && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Video className="h-5 w-5 text-red-500" /> {label}
              </DialogTitle>
            </DialogHeader>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video src={videoUrl} controls autoPlay className="w-full h-full" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default function QuestionnaireScreen({ templateId, onComplete }: { templateId: string; onComplete: (answers: Record<string, any>) => void }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Card className="bg-zinc-950 border-zinc-800 text-white max-w-md text-center p-8">
        <CardContent>
          <p>Please contact support to restore the questionnaire template. The file was partially overwritten.</p>
        </CardContent>
      </Card>
    </div>
  );
}
