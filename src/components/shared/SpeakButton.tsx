import { useEffect, useState, useCallback } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SpeakButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/**
 * Plays the supplied text using the browser SpeechSynthesis API.
 * Click again to stop. Falls back to a toast if TTS is unavailable.
 */
export const SpeakButton = ({ text, label = "Listen", className }: SpeakButtonProps) => {
  const [speaking, setSpeaking] = useState(false);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  // Stop on unmount to avoid runaway audio
  useEffect(() => () => stop(), [stop]);

  const handleClick = () => {
    if (!supported) {
      toast.error("Text-to-speech is not supported in this browser.");
      return;
    }
    if (speaking) {
      stop();
      return;
    }
    if (!text?.trim()) {
      toast.info("Nothing to read.");
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.lang = "en-ZA";
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);

    // Some browsers need a small reset before starting
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleClick}
      className={className}
      aria-label={speaking ? "Stop reading" : `${label} — play audio`}
    >
      {speaking ? (
        <>
          <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
          Stop
        </>
      ) : (
        <>
          <Volume2 className="h-3.5 w-3.5 mr-1.5" />
          {label}
        </>
      )}
    </Button>
  );
};

export default SpeakButton;
