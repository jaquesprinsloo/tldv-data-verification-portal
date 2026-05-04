import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

interface IntroVideoScreenProps {
  onComplete: () => void;
  title?: string;
  description?: string;
  videoUrl?: string | null;
}

export default function IntroVideoScreen({
  onComplete,
  title = "Introduction to PreAppliCheck",
  description,
  videoUrl,
}: IntroVideoScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showOutro, setShowOutro] = useState(false);
  const [started, setStarted] = useState(false);

  // If no video is configured, show the continue prompt immediately.
  useEffect(() => {
    if (!videoUrl) setShowOutro(true);
  }, [videoUrl]);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    v.play()
      .then(() => setStarted(true))
      .catch(() => {
        /* ignore */
      });
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration || !isFinite(v.duration)) return;
    if (!showOutro && v.duration - v.currentTime <= 3) {
      setShowOutro(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="auto"
          controls={false}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
          onContextMenu={(e) => e.preventDefault()}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setShowOutro(true)}
          className={`w-full h-full object-contain transition-opacity duration-1000 ${
            showOutro ? "opacity-0" : "opacity-100"
          }`}
        />
      ) : (
        <div className="text-zinc-600 text-sm">{title}</div>
      )}

      {/* Play button overlay shown until user starts the video */}
      {videoUrl && !started && !showOutro && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Play video"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 hover:bg-black/50 transition-colors"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 text-white shadow-[0_0_40px_rgba(239,68,68,0.7)] animate-pulse">
            <Play className="h-10 w-10 ml-1" fill="currentColor" />
          </span>
        </button>
      )}

      {/* Outro overlay */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center transition-opacity duration-1000 ${
          showOutro ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <h2 className="text-2xl sm:text-4xl font-semibold text-white tracking-wide">
          Click continue, and let's begin
        </h2>
        <Button
          onClick={onComplete}
          size="lg"
          className="bg-red-600 hover:bg-red-700 text-white text-lg px-10 py-6 rounded-full shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse"
        >
          Continue
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
