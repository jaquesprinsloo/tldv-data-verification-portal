import { useEffect, useRef, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Safety fallback in case video never fires `ended`
    const safety = setTimeout(() => {
      setFadeOut(true);
    }, 8000);
    return () => clearTimeout(safety);
  }, []);

  useEffect(() => {
    if (!fadeOut) return;
    const t = setTimeout(onComplete, 900);
    return () => clearTimeout(t);
  }, [fadeOut, onComplete]);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        src="/intro/logo-animation.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={() => setFadeOut(true)}
        className={`w-full h-full object-contain transition-opacity duration-700 ${
          fadeOut ? "opacity-0" : "opacity-100"
        }`}
      />
      <button
        onClick={() => setFadeOut(true)}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/30 text-xs hover:text-white/60 transition-colors"
      >
        Tap to skip
      </button>
    </div>
  );
}
