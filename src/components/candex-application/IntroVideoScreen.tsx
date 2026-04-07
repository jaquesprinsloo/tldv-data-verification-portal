import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlayCircle, SkipForward, CheckCircle } from "lucide-react";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";

interface IntroVideoScreenProps {
  onComplete: () => void;
  title?: string;
  description?: string;
  videoUrl?: string | null;
}

export default function IntroVideoScreen({
  onComplete,
  title = "Introduction to PreAppliCheck Screening",
  description = "Please watch the introduction video before proceeding.",
  videoUrl,
}: IntroVideoScreenProps) {
  const [videoEnded, setVideoEnded] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src={preapplicheckLogo} alt="PreAppliCheck" className="w-64 mb-8" />

      {videoUrl ? (
        <button
          onClick={() => setShowVideo(true)}
          className="w-full max-w-2xl aspect-video rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white flex flex-col items-center justify-center mb-8 hover:border-red-400 hover:shadow-lg transition-all group cursor-pointer"
        >
          <div className="relative">
            <PlayCircle className="h-20 w-20 text-red-600 group-hover:scale-110 transition-transform" />
            {!videoEnded && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
              </span>
            )}
          </div>
          <p className="text-red-600 font-semibold mt-3 text-lg group-hover:text-red-700">
            {videoEnded ? "Watch Again" : "Tap to Play Video"}
          </p>
          <p className="text-gray-400 text-xs mt-1">{title}</p>
        </button>
      ) : (
        <div className="w-full max-w-2xl aspect-video bg-gray-100 rounded-xl border border-gray-200 flex flex-col items-center justify-center mb-8">
          <PlayCircle className="h-16 w-16 text-gray-400 mb-4" />
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-gray-400 text-xs mt-2">No video uploaded yet</p>
        </div>
      )}

      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="max-w-2xl p-0 bg-black border-none overflow-hidden">
          <div className="aspect-video">
            <video
              src={videoUrl || ""}
              controls
              autoPlay
              className="w-full h-full"
              onEnded={() => { setVideoEnded(true); setShowVideo(false); }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-gray-500 text-sm text-center mb-6 max-w-md">{description}</p>

      <Button
        onClick={onComplete}
        variant="outline"
        className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
      >
        {videoEnded ? (
          <><CheckCircle className="h-4 w-4 mr-2" /> Continue</>
        ) : (
          <><SkipForward className="h-4 w-4 mr-2" /> {videoUrl ? "Skip & Continue" : "Continue"}</>
        )}
      </Button>
    </div>
  );
}
