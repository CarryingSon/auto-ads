import { useState, useEffect, useRef } from "react";

interface ProgressMessage {
  after: number;
  text: string;
}

interface TypewriterProgressBarProps {
  messages: ProgressMessage[];
  isComplete?: boolean;
  completeMessage?: string;
  estimatedTotal?: number;
  elapsedTime?: number;
}

export function TypewriterProgressBar({
  messages,
  isComplete = false,
  completeMessage = "Done!",
  estimatedTotal = 30,
  elapsedTime,
}: TypewriterProgressBarProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [internalElapsed, setInternalElapsed] = useState(0);
  const targetMessageRef = useRef(messages[0]?.text || "");
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charIndexRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  const usingInternalTimer = elapsedTime === undefined;

  useEffect(() => {
    if (usingInternalTimer && !isComplete) {
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setInternalElapsed(Date.now() - startTimeRef.current);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [usingInternalTimer, isComplete]);

  const elapsed = usingInternalTimer ? internalElapsed : (elapsedTime || 0);
  const elapsedSec = elapsed / 1000;
  const smoothProgress = isComplete ? 100 : Math.min(90, Math.max(0, 90 * (1 - Math.exp(-elapsedSec / (estimatedTotal * 0.4)))));
  const elapsedWholeSecond = Math.floor(elapsedSec);

  const startTypewriter = (text: string) => {
    targetMessageRef.current = text;
    charIndexRef.current = 0;
    setDisplayedText("");
    if (typewriterRef.current) clearInterval(typewriterRef.current);
    typewriterRef.current = setInterval(() => {
      charIndexRef.current += 1;
      const target = targetMessageRef.current;
      if (charIndexRef.current >= target.length) {
        setDisplayedText(target);
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        typewriterRef.current = null;
      } else {
        setDisplayedText(target.slice(0, charIndexRef.current));
      }
    }, 30);
  };

  const mountedRef = useRef(false);

  useEffect(() => {
    let newTarget: string;
    if (isComplete) {
      newTarget = completeMessage;
    } else {
      newTarget = messages[0]?.text || "";
      for (const msg of messages) {
        if (elapsedWholeSecond >= msg.after) newTarget = msg.text;
      }
    }

    if (!mountedRef.current || newTarget !== targetMessageRef.current) {
      mountedRef.current = true;
      startTypewriter(newTarget);
    }
  }, [elapsedWholeSecond, isComplete, messages, completeMessage]);

  useEffect(() => {
    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, []);

  return (
    <div className="bg-white/40 dark:bg-black/30 rounded-xl px-4 py-3 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-md relative overflow-hidden" data-testid="typewriter-progress-bar">
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center space-x-2.5">
          {!isComplete && <div className="animate-spin w-3.5 h-3.5 border-2 border-[#1877F2] border-t-transparent rounded-full" />}
          {isComplete && <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>}
          <span
            className="text-[13px] font-semibold text-slate-800 dark:text-white"
            data-testid="text-progress-status"
          >
            {displayedText}
            {displayedText.length < (targetMessageRef.current?.length || 0) && (
              <span className="inline-block w-[2px] h-3.5 bg-[#1877F2] ml-px animate-pulse align-middle" />
            )}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400" data-testid="text-progress-percent">
          {isComplete ? "100%" : `${Math.round(smoothProgress)}%`}
        </span>
      </div>

      <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full shadow-[0_0_10px_rgba(24,119,242,0.4)]"
          style={{
            width: `${isComplete ? 100 : smoothProgress}%`,
            background: "linear-gradient(90deg, #1877F2, #60A5FA, #1877F2)",
            backgroundSize: "200% 100%",
            animation: isComplete ? "none" : "liquidFlow 2s linear infinite",
            transition: isComplete ? "width 0.5s ease-out" : "width 0.15s linear",
          }}
        />
      </div>
    </div>
  );
}
