import { useState, useEffect } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const tips = [
  "You can upload up to 10 videos at once from a single Google Drive folder.",
  "Videos are matched to ad copy by their number - Video 1 matches Ad 1 in your DOCX.",
  "Name your video files with numbers (1.mp4, 2.mp4) for automatic matching.",
  "Each subfolder in your Drive becomes a separate Ad Set in Meta.",
  "Use the sync button to refresh your Meta Ads data from the live API.",
  "Your DOCX file should have sections labeled 'Ad 1', 'Ad 2', etc.",
  "The AI can help parse your DOCX if the format is non-standard.",
  "You can override default settings for individual Ad Sets.",
  "Connect both Google Drive and Meta to unlock all features.",
  "Campaigns are synced automatically every hour.",
];

interface DidYouKnowProps {
  className?: string;
  variant?: "inline" | "floating";
  tip?: string;
}

export function DidYouKnow({ className = "", variant = "inline", tip }: DidYouKnowProps) {
  const [currentTip, setCurrentTip] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!tip) {
      const randomIndex = Math.floor(Math.random() * tips.length);
      setCurrentTip(randomIndex);
    }
  }, [tip]);

  const nextTip = () => {
    setCurrentTip((prev) => (prev + 1) % tips.length);
  };

  const displayTip = tip || tips[currentTip];

  if (dismissed) return null;

  if (variant === "floating") {
    return (
      <div 
        className={`fixed bottom-4 right-4 max-w-sm bg-card border rounded-md p-4 shadow-lg z-50 ${className}`}
        data-testid="did-you-know-floating"
      >
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground mb-1">Did you know?</p>
            <p className="text-sm text-muted-foreground">{displayTip}</p>
            {!tip && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-0 h-auto mt-2 text-xs underline"
                onClick={nextTip}
                data-testid="button-next-tip"
              >
                Show another tip
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={() => setDismissed(true)}
            data-testid="button-dismiss-tip"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`flex items-center gap-2 p-3 bg-muted/50 rounded-md ${className}`}
      data-testid="did-you-know-inline"
    >
      <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0" />
      <p className="text-sm text-muted-foreground flex-1">{displayTip}</p>
      {!tip && (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={nextTip}
          data-testid="button-next-tip-inline"
        >
          Next tip
        </Button>
      )}
    </div>
  );
}

interface DidYouKnowTooltipProps {
  children: React.ReactNode;
  tip?: string;
}

export function DidYouKnowTooltip({ children, tip }: DidYouKnowTooltipProps) {
  const displayTip = tip || tips[Math.floor(Math.random() * tips.length)];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" data-testid="tooltip-did-you-know">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-xs mb-1">Did you know?</p>
            <p className="text-xs">{displayTip}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function DidYouKnowIcon({ tip }: { tip?: string }) {
  const displayTip = tip || tips[Math.floor(Math.random() * tips.length)];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          data-testid="button-did-you-know-icon"
        >
          <Lightbulb className="h-4 w-4 text-amber-500" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs" data-testid="tooltip-did-you-know-icon">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-xs mb-1">Did you know?</p>
            <p className="text-xs">{displayTip}</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { tips };
