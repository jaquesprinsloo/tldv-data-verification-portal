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
...
            <CardTitle className="text-white text-center">{currentSec.title}</CardTitle>
...
                <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 space-y-2 text-center">
                  <p className="text-[11px] font-medium text-red-400 uppercase tracking-wider">
                    🎧 Audio & Video Explainers — Listen before completing this section
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {mediaItems.map((item, idx) => (
                      <VideoPlayButton key={idx} videoUrl={item.url} label={item.label} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tables */}
            {sectionTables.map(renderTable)}

            {/* Questions */}
            {sectionQuestions.map(renderQuestion)}

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              {currentSection > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentSection((p) => p - 1)}
                  className="border-zinc-700 text-zinc-400 hover:text-white"
                >
                  Previous
                </Button>
              )}
              <div className="flex-1" />
              {currentSection < sections.length - 1 ? (
                <Button
                  onClick={() => setCurrentSection((p) => p + 1)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Next Section
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle className="mr-2 h-4 w-4" /> Complete PreAppliCheck Process</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section navigation dots */}
        <div className="flex justify-center gap-2 mt-6">
          {sections.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSection(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                idx === currentSection ? "bg-red-600" : idx < currentSection ? "bg-red-900" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
