import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, ArrowRight } from "lucide-react";

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
  const [needsTap, setNeedsTap] = useState(false);

  // If no video is configured, show the continue prompt immediately.
  useEffect(() => {
    if (!videoUrl) setShowOutro(true);
  }, [videoUrl]);

  // Try to autoplay; if blocked, prompt the user to tap.
  useEffect(() => {
    if (!videoUrl) return;
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = async () => {
      try {
        await v.play();
        setNeedsTap(false);
      } catch {
        setNeedsTap(true);
      }
    };
    void tryPlay();
  }, [videoUrl]);

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
          autoPlay
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setShowOutro(true)}
          className={`w-full h-full object-contain transition-opacity duration-1000 ${
            showOutro ? "opacity-0" : "opacity-100"
          }`}
        />
      ) : (
        <div className="text-zinc-600 text-sm">{title}</div>
      )}

      {/* Tap-to-play overlay if autoplay is blocked */}
      {videoUrl && needsTap && !showOutro && (
        <button
          onClick={() => {
            videoRef.current?.play().then(() => setNeedsTap(false)).catch(() => {});
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white"
        >
          <PlayCircle className="h-20 w-20 text-red-500" />
          <span className="text-sm">Tap to play</span>
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
        {description && (
          <p className="text-zinc-500 text-xs max-w-md">{description}</p>
        )}
      </div>
    </div>
  );
}
