import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    // Safety fallback in case video never fires `ended`
    const safety = setTimeout(() => {
      setFadeOut(true);
    }, 8000);
    return () => clearTimeout(safety);
  }, [started]);

  // Play with audio once the user has tapped to begin. The gesture unlocks
  // audio for the rest of the session, so the intro video that follows also
  // plays with sound automatically.
  useEffect(() => {
    if (!started) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.volume = 1;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {
        /* ignore — safety timeout will advance */
      });
    });
  }, [started]);

  useEffect(() => {
    if (!fadeOut) return;
    const t = setTimeout(onComplete, 900);
    return () => clearTimeout(t);
  }, [fadeOut, onComplete]);

  if (!started) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-white text-2xl sm:text-4xl font-semibold tracking-wide">
          Welcome to PreAppliCheck
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base max-w-md">
          Tap the button below to begin. Make sure your sound is turned on.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="inline-flex items-center gap-3 rounded-full bg-red-600 hover:bg-red-700 text-white text-lg px-10 py-4 shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse"
        >
          <Volume2 className="h-5 w-5" />
          Tap to Begin
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        src="/intro/logo-animation.mp4"
        playsInline
        preload="auto"
        onEnded={() => setFadeOut(true)}
        className={`w-full h-full object-contain transition-opacity duration-700 ${
          fadeOut ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}
