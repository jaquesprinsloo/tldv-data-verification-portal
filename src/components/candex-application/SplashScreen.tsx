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

  // Try to play with audio; if the browser blocks unmuted autoplay,
  // fall back to a muted autoplay so the logo animation still plays.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {
        /* ignore — safety timeout will advance */
      });
    });
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
