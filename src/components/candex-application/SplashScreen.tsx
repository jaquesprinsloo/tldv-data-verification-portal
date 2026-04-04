import { useEffect, useState } from "react";
import candexLogo from "@/assets/candex-logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("visible"), 100);
    const exitTimer = setTimeout(() => setPhase("exit"), 4000);
    const completeTimer = setTimeout(onComplete, 5000);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      {/* Heartbeat line animation */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`h-[2px] bg-red-600 transition-all duration-1000 ease-out ${
            phase === "enter" ? "w-0 opacity-0" : "w-full opacity-20"
          }`}
        />
      </div>

      <div
        className={`relative z-10 transition-all duration-1000 ease-out ${
          phase === "enter"
            ? "opacity-0 scale-75"
            : phase === "exit"
            ? "opacity-0 scale-110"
            : "opacity-100 scale-100"
        }`}
      >
        <img
          src={candexLogo}
          alt="CanDex Pre-Screening"
          className="w-[500px] max-w-[90vw] drop-shadow-[0_0_40px_rgba(220,38,38,0.3)]"
        />
        {/* Pulsing glow */}
        <div className="absolute inset-0 bg-red-600/10 rounded-full blur-3xl animate-pulse -z-10" />
      </div>

      {/* Skip hint */}
      <button
        onClick={onComplete}
        className="absolute bottom-8 text-white/30 text-xs hover:text-white/60 transition-colors"
      >
        Tap to skip
      </button>
    </div>
  );
}
