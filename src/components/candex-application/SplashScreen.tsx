import { useEffect, useState } from "react";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";

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
    <div className="min-h-screen bg-white flex items-center justify-center overflow-hidden">
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
          src={preapplicheckLogo}
          alt="PreAppliCheck"
          className="w-[500px] max-w-[90vw]"
        />
      </div>

      {/* Skip hint */}
      <button
        onClick={onComplete}
        className="absolute bottom-8 text-black/30 text-xs hover:text-black/60 transition-colors"
      >
        Tap to skip
      </button>
    </div>
  );
}
