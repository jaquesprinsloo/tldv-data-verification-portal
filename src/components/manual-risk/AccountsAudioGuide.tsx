import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import accountsGuideAudio from "@/assets/accounts-guide.m4a.asset.json";
import {
  ACCOUNTS_GUIDE_DEMO_CUES,
  ACCOUNTS_GUIDE_DURATION,
  ACCOUNTS_GUIDE_STEPS,
  getActiveAccountsDemoAction,
  getActiveAccountsGuideStep,
  type AccountsDemoAction,
  type AccountsGuideTarget,
} from "./accountsGuideSteps";

export type { AccountsDemoAction, AccountsGuideTarget };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AccountsAudioGuide({
  open,
  onClose,
  onActiveTargetChange,
  onDemoActionChange,
}: {
  open: boolean;
  onClose: () => void;
  onActiveTargetChange: (target: AccountsGuideTarget | null) => void;
  onDemoActionChange: (action: AccountsDemoAction | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(ACCOUNTS_GUIDE_DURATION);
  const [ended, setEnded] = useState(false);

  const activeStep = open ? getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, currentTime) : null;
  const activeDemoAction = open
    ? getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, currentTime)
    : null;
  const activeIndex = activeStep
    ? ACCOUNTS_GUIDE_STEPS.findIndex((s) => s.target === activeStep.target)
    : -1;

  useEffect(() => {
    onActiveTargetChange(open && !ended ? activeStep?.target ?? null : null);
  }, [open, ended, activeStep?.target, onActiveTargetChange]);

  useEffect(() => {
    onDemoActionChange(open && !ended ? activeDemoAction : null);
  }, [open, ended, activeDemoAction, onDemoActionChange]);

  useEffect(() => {
    if (!open || ended || !activeStep || activeStep.target.startsWith("demo-")) return;
    const el = document.querySelector<HTMLElement>(`[data-guide-target="${activeStep.target}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [open, ended, activeStep?.target]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (open) {
      setEnded(false);
      audio.currentTime = 0;
      setCurrentTime(0);
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => setIsPlaying(false));
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
      setEnded(false);
    }
  }, [open]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ended) {
      audio.currentTime = 0;
      setCurrentTime(0);
      setEnded(false);
      void audio.play();
      return;
    }
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const jumpToStep = (index: number) => {
    const step = ACCOUNTS_GUIDE_STEPS[index];
    const audio = audioRef.current;
    if (!step || !audio) return;
    setEnded(false);
    audio.currentTime = step.start;
    setCurrentTime(step.start);
    if (audio.paused) void audio.play();
  };

  const handleScrub = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    setEnded(false);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  if (!open) return null;

  const safeDuration = duration > 0 ? duration : ACCOUNTS_GUIDE_DURATION;

  return (
    <div
      role="region"
      aria-label="Accounts audio guide player"
      data-guide-player="true"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-primary/40 bg-zinc-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur"
    >
      <audio
        ref={audioRef}
        src={accountsGuideAudio.url}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setEnded(true);
          onActiveTargetChange(null);
          onDemoActionChange(null);
          onClose();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center justify-between gap-2 sm:order-2 sm:flex-1 sm:min-w-0 sm:block">
          <div className="flex items-center justify-between gap-2 text-xs min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium text-white min-w-0">
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">
                {ended ? "Guide complete" : activeStep?.label ?? "Accounts guide"}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-zinc-400 tabular-nums">
              {formatTime(currentTime)} / {formatTime(safeDuration)}
            </span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close accounts guide"
            onClick={onClose}
            className="h-8 w-8 shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-white sm:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
          <input
            type="range"
            aria-label="Accounts guide playback progress"
            min={0}
            max={safeDuration}
            step={0.1}
            value={Math.min(currentTime, safeDuration)}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="mt-1.5 hidden sm:block h-1.5 w-full cursor-pointer accent-primary"
          />
        </div>

        <div className="flex items-center gap-2 sm:order-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Previous section"
              disabled={activeIndex <= 0}
              onClick={() => jumpToStep(Math.max(0, activeIndex - 1))}
              className="h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              aria-label={ended ? "Replay guide" : isPlaying ? "Pause guide" : "Play guide"}
              onClick={togglePlay}
              className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {ended ? (
                <RotateCcw className="h-4 w-4" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Next section"
              disabled={activeIndex < 0 || activeIndex >= ACCOUNTS_GUIDE_STEPS.length - 1}
              onClick={() => jumpToStep(Math.min(ACCOUNTS_GUIDE_STEPS.length - 1, activeIndex + 1))}
              className="h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <input
            type="range"
            aria-label="Accounts guide playback progress"
            min={0}
            max={safeDuration}
            step={0.1}
            value={Math.min(currentTime, safeDuration)}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="sm:hidden h-1.5 flex-1 cursor-pointer accent-primary"
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close accounts guide"
          onClick={onClose}
          className="hidden sm:inline-flex sm:order-3 h-9 w-9 shrink-0 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}