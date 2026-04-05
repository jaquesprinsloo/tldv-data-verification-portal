import { Button } from "@/components/ui/button";
import { Play, SkipForward } from "lucide-react";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";

interface IntroVideoScreenProps {
  onComplete: () => void;
  title?: string;
  description?: string;
}

export default function IntroVideoScreen({
  onComplete,
  title = "Introduction to CanDex Pre-Screening",
  description = "Please watch the introduction video before proceeding.",
}: IntroVideoScreenProps) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <img src={preapplicheckLogo} alt="PreAppliCheck" className="w-64 mb-8" />

      {/* Video placeholder */}
      <div className="w-full max-w-2xl aspect-video bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col items-center justify-center mb-8">
        <Play className="h-16 w-16 text-zinc-600 mb-4" />
        <p className="text-zinc-500 text-sm">{title}</p>
        <p className="text-zinc-600 text-xs mt-2">Video coming soon</p>
      </div>

      <p className="text-zinc-400 text-sm text-center mb-6 max-w-md">{description}</p>

      <Button
        onClick={onComplete}
        variant="outline"
        className="border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
      >
        <SkipForward className="h-4 w-4 mr-2" />
        Continue
      </Button>
    </div>
  );
}
