import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, SkipForward, CheckCircle } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src={preapplicheckLogo} alt="PreAppliCheck" className="w-64 mb-8" />

      {videoUrl ? (
        <div className="w-full max-w-2xl aspect-video rounded-xl border border-gray-200 overflow-hidden mb-8">
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full h-full"
            onEnded={() => setVideoEnded(true)}
          />
        </div>
      ) : (
        <div className="w-full max-w-2xl aspect-video bg-gray-100 rounded-xl border border-gray-200 flex flex-col items-center justify-center mb-8">
          <Play className="h-16 w-16 text-gray-400 mb-4" />
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-gray-400 text-xs mt-2">No video uploaded yet</p>
        </div>
      )}

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
