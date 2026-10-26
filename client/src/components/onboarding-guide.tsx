import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { CircleHelp, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Bump the version when the setup flow changes enough that everyone should
// see the guide again.
const SEEN_KEY = "onboarding-seen-v1";

interface OnboardingContextValue {
  openGuide: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}

function hasSeenGuide() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markGuideSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode or blocked storage: the guide just shows again next time.
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasSeenGuide()) return;
    // Let the dashboard paint first so the guide opens over a settled page.
    const timer = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) markGuideSeen();
  }, []);

  const openGuide = useCallback(() => setOpen(true), []);

  return (
    <OnboardingContext.Provider value={{ openGuide }}>
      {children}
      <OnboardingGuide open={open} onOpenChange={handleOpenChange} />
    </OnboardingContext.Provider>
  );
}

export function HelpButton() {
  const { openGuide } = useOnboarding();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={openGuide}
      aria-label="Open the getting started guide"
      title="How it works"
      data-testid="button-onboarding-help"
    >
      <CircleHelp className="h-5 w-5" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  points?: string[];
  tint: string;
  stageClassName?: string;
  Visual: (props: { active: boolean }) => JSX.Element;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    eyebrow: "Welcome to Auto Ads",
    title: "From a Drive folder to live ads.",
    body: "Organize your creatives in Google Drive, paste one link, and Auto Ads builds every ad set for you. This short guide shows how to set up the folder so everything is detected correctly.",
    tint: "from-indigo-500/15 via-sky-400/10 to-transparent",
    Visual: WelcomeVisual,
  },
  {
    id: "structure",
    eyebrow: "Step 1 · Folder structure",
    title: "One folder per campaign.",
    body: "Inside it, create a subfolder for every ad set. The creatives go in the subfolders, and the ad copy document sits next to them in the main folder.",
    points: [
      "Every DCT subfolder becomes one ad set",
      "Images and videos go inside the DCT subfolders",
      "One ad copy document in the main folder",
    ],
    tint: "from-sky-500/15 via-indigo-400/10 to-transparent",
    Visual: StructureVisual,
  },
  {
    id: "naming",
    eyebrow: "Step 2 · Naming",
    title: "Start every subfolder with DCT.",
    body: "Auto Ads only picks up subfolders whose name starts with DCT. The number after it sets the order of the ad sets, and the rest of the name is yours.",
    points: [
      "Supported files: .mp4, .mov, .jpg, .png",
      "Include “copy” in the document name, e.g. ad_copy",
    ],
    tint: "from-emerald-500/15 via-teal-400/10 to-transparent",
    Visual: NamingVisual,
  },
  {
    id: "copy",
    eyebrow: "Step 3 · Ad copy",
    title: "Write the copy once.",
    body: (
      <>
        Label every field and number the variations. The document in the main folder is used for{" "}
        <span className="text-foreground font-medium">every</span> ad set. Need different copy for one ad set? Put a
        separate document inside that DCT folder and it takes priority.
      </>
    ),
    tint: "from-amber-400/15 via-orange-400/10 to-transparent",
    Visual: CopyVisual,
  },
  {
    id: "share",
    eyebrow: "Step 4 · Sharing",
    title: "Share the folder, copy its link.",
    body: "For a public link, set General access to “Anyone with the link”. For a private folder, share it with the service account email shown on the Launch page instead. Then copy the main folder's link.",
    tint: "from-violet-500/15 via-fuchsia-400/10 to-transparent",
    Visual: ShareVisual,
  },
  {
    id: "launch",
    eyebrow: "Step 5 · Launch",
    title: "Paste, sync, launch.",
    body: "On the Launch page, pick a campaign, paste the folder link and press Sync Folder. Review the ad sets Auto Ads found, check the settings, then launch.",
    tint: "from-indigo-500/15 via-violet-400/10 to-transparent",
    stageClassName: "h-[280px] sm:h-[380px]",
    Visual: LaunchVisual,
  },
];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function OnboardingGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", duration: 28 });
  const [index, setIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi]);

  // Always start from the first slide when the guide is reopened.
  useEffect(() => {
    if (open && emblaApi) emblaApi.scrollTo(0, true);
  }, [open, emblaApi]);

  const next = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const prev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    }
  };

  const finish = () => {
    onOpenChange(false);
    setLocation("/bulk-ads");
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300" />
        <DialogPrimitive.Content
          ref={contentRef}
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          aria-describedby={undefined}
          className="onboarding fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[680px] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-[28px] border border-white/60 dark:border-white/10 bg-white/85 dark:bg-[#15171c]/90 backdrop-blur-2xl shadow-[0_40px_120px_-20px_rgba(15,23,42,0.45)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-[0.97] duration-300"
          style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}
          data-testid="onboarding-guide"
        >
          <DialogPrimitive.Title className="sr-only">Getting started with Auto Ads</DialogPrimitive.Title>

          <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
            {!isLast && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                data-testid="button-onboarding-skip"
              >
                Skip
              </button>
            )}
            <DialogPrimitive.Close
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close guide"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div ref={emblaRef} className="overflow-hidden">
              <div className="flex touch-pan-y">
                {SLIDES.map((slide, i) => (
                  <SlideView key={slide.id} slide={slide} active={open && i === index} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-6 sm:px-10 pb-6 sm:pb-8 pt-4">
            <div className="flex items-center gap-1.5 sm:gap-2" role="tablist" aria-label="Guide steps">
              {SLIDES.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Go to step ${i + 1}`}
                  onClick={() => emblaApi?.scrollTo(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === index ? "w-6 bg-foreground" : "w-2 bg-foreground/20 hover:bg-foreground/40",
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {index > 0 && (
                <Button
                  variant="ghost"
                  onClick={prev}
                  className="hidden sm:inline-flex rounded-full h-10 px-5 text-[14px]"
                  data-testid="button-onboarding-back"
                >
                  Back
                </Button>
              )}
              {isLast ? (
                <Button
                  onClick={finish}
                  className="rounded-full h-10 px-6 text-[14px] font-semibold shadow-lg shadow-primary/25"
                  data-testid="button-onboarding-finish"
                >
                  Go to Launch
                </Button>
              ) : (
                <Button
                  onClick={next}
                  className="rounded-full h-10 px-6 text-[14px] font-semibold shadow-lg shadow-primary/25"
                  data-testid="button-onboarding-next"
                >
                  {index === 0 ? "Get started" : "Continue"}
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SlideView({ slide, active }: { slide: Slide; active: boolean }) {
  const { Visual } = slide;

  return (
    <section className="min-w-0 shrink-0 grow-0 basis-full" aria-roledescription="slide">
      <div className={cn("relative h-[260px] sm:h-[300px] bg-gradient-to-b flex items-center justify-center overflow-hidden", slide.tint, slide.stageClassName)}>
        {/* Remount on activation so the illustration's animation replays. */}
        <div key={active ? "on" : "off"} className="ob-anim w-full h-full flex items-center justify-center px-6">
          <Visual active={active} />
        </div>
      </div>
      <div className="px-6 sm:px-10 pt-6">
        <p className="text-[13px] font-semibold text-primary tracking-tight">{slide.eyebrow}</p>
        <h2 className="mt-1.5 text-[26px] sm:text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground">
          {slide.title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{slide.body}</p>
        {slide.points && (
          <ul className="mt-4 space-y-2">
            {slide.points.map(point => (
              <li key={point} className="flex items-start gap-2.5 text-[14px] text-foreground/90">
                <span className="material-symbols-outlined filled text-[18px] text-emerald-500 leading-5">check_circle</span>
                {point}
              </li>
            ))}
          </ul>
        )}
        {slide.id === "copy" && (
          <a
            href="/template_adcopy.docx"
            download
            className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline"
            data-testid="link-onboarding-template"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download the ad copy template
          </a>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Illustrations
// ---------------------------------------------------------------------------

function delay(ms: number): React.CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function WindowFrame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-[440px] rounded-2xl bg-white dark:bg-[#1f2228] border border-black/5 dark:border-white/10 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.25)] overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 h-9 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate text-[11px] font-medium text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={cn("material-symbols-outlined filled", className)}>{name}</span>;
}

function WelcomeVisual() {
  const tiles = [
    { icon: "folder", label: "Organize", color: "text-sky-500" },
    { icon: "link", label: "Paste link", color: "text-violet-500" },
    { icon: "rocket_launch", label: "Launch", color: "text-indigo-500" },
  ];

  return (
    <div className="flex items-center gap-3 sm:gap-5">
      {tiles.map((tile, i) => (
        <div key={tile.label} className="flex items-center gap-3 sm:gap-5">
          <div className="ob-pop flex flex-col items-center gap-3" style={delay(i * 220)}>
            <div className="flex h-[72px] w-[72px] sm:h-[88px] sm:w-[88px] items-center justify-center rounded-[22px] bg-white dark:bg-[#23262d] shadow-[0_16px_40px_-12px_rgba(15,23,42,0.3)] border border-black/5 dark:border-white/10">
              <Icon name={tile.icon} className={cn("text-[36px] sm:text-[42px]", tile.color)} />
            </div>
            <span className="text-[13px] font-semibold text-foreground">{tile.label}</span>
          </div>
          {i < tiles.length - 1 && (
            <div className="ob-grow mb-8 h-[2px] w-6 sm:w-10 origin-left rounded-full bg-foreground/15" style={delay(i * 220 + 160)} />
          )}
        </div>
      ))}
    </div>
  );
}

function StructureVisual() {
  const folders = ["DCT 161 Spring_Sale", "DCT 162 Comparison", "DCT 163 Video_Ads"];

  return (
    <WindowFrame title="My Drive › Spring Campaign">
      <div className="px-4 py-3 text-[13px]">
        <div className="ob-rise flex items-center gap-2.5 py-1.5 font-semibold text-foreground">
          <Icon name="folder_open" className="text-[20px] text-sky-500" />
          Spring Campaign
          <span className="ml-auto rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
            Campaign
          </span>
        </div>
        <div className="ml-3 border-l border-black/10 dark:border-white/10 pl-4">
          {folders.map((name, i) => (
            <div key={name} className="ob-rise flex items-center gap-2.5 py-1.5 text-foreground" style={delay(250 + i * 180)}>
              <Icon name="folder" className="text-[20px] text-muted-foreground" />
              <span className="truncate">{name}</span>
              <span
                className="ob-pop ml-auto shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300"
                style={delay(900 + i * 180)}
              >
                Ad set {i + 1}
              </span>
            </div>
          ))}
          <div className="ob-rise flex items-center gap-2.5 py-1.5 text-foreground" style={delay(250 + folders.length * 180)}>
            <Icon name="description" className="text-[20px] text-blue-500" />
            ad_copy
            <span
              className="ob-pop ml-auto shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
              style={delay(1450)}
            >
              Copy for all
            </span>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function NamingVisual() {
  const names = [
    { prefix: "DCT 161", rest: " Spring_Sale", ok: true },
    { prefix: "DCT_162", rest: " Comparison", ok: true },
    { prefix: "DCT163", rest: "", ok: true },
    { prefix: "", rest: "Spring Sale Images", ok: false },
  ];

  return (
    <WindowFrame title="Folder names">
      <div className="divide-y divide-black/5 dark:divide-white/5 text-[13px]">
        {names.map((n, i) => (
          <div key={n.prefix + n.rest} className="ob-rise flex items-center gap-2.5 px-4 py-2.5" style={delay(i * 200)}>
            <Icon name="folder" className={cn("text-[20px]", n.ok ? "text-muted-foreground" : "text-muted-foreground/50")} />
            <span className={cn("truncate font-mono text-[12.5px]", n.ok ? "text-foreground" : "text-muted-foreground line-through decoration-rose-400/70")}>
              {n.prefix && (
                <mark className="ob-mark rounded bg-emerald-400/25 px-0.5 text-inherit" style={delay(600 + i * 200)}>
                  {n.prefix}
                </mark>
              )}
              {n.rest}
            </span>
            <span className="ob-pop ml-auto flex shrink-0 items-center gap-1" style={delay(700 + i * 200)}>
              {n.ok ? (
                <>
                  <Icon name="check_circle" className="text-[18px] text-emerald-500" />
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Detected</span>
                </>
              ) : (
                <>
                  <Icon name="cancel" className="text-[18px] text-rose-500" />
                  <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Ignored</span>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

function CopyVisual() {
  const lines: Array<{ label: string; text: string }> = [
    { label: "Primary text_1:", text: "Hear every detail. Free shipping this week." },
    { label: "Primary text_2:", text: "Studio sound, all-day comfort." },
    { label: "Headline_1:", text: "Spring Sale: 30% off" },
    { label: "Description_1:", text: "Limited time only" },
  ];

  return (
    <WindowFrame title="ad_copy">
      <div className="px-5 py-4 space-y-2.5">
        {lines.map((line, i) => (
          <div key={line.label} className="ob-rise text-[12.5px] leading-snug" style={delay(i * 230)}>
            <span className="ob-mark rounded bg-amber-300/40 dark:bg-amber-400/25 px-1 py-px font-semibold text-foreground" style={delay(250 + i * 230)}>
              {line.label}
            </span>
            <p className="mt-1 text-muted-foreground">{line.text}</p>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

function ShareVisual() {
  return (
    <WindowFrame title="Share “Spring Campaign”" className="max-w-[400px]">
      <div className="px-5 py-4">
        <p className="text-[12px] font-semibold text-foreground">General access</p>
        <div className="mt-2 flex items-center gap-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5">
          <div className="relative h-8 w-8 shrink-0">
            <div className="ob-fade-out absolute inset-0 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/10" style={delay(700)}>
              <Icon name="lock" className="text-[18px] text-muted-foreground" />
            </div>
            <div className="ob-fade-in absolute inset-0 flex items-center justify-center rounded-full bg-emerald-500/15" style={delay(700)}>
              <Icon name="public" className="text-[18px] text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="relative min-w-0 flex-1 h-9">
            <div className="ob-fade-out absolute inset-0" style={delay(700)}>
              <p className="text-[13px] font-medium text-foreground">Restricted</p>
              <p className="truncate text-[11px] text-muted-foreground">Only people with access can open</p>
            </div>
            <div className="ob-fade-in absolute inset-0" style={delay(700)}>
              <p className="text-[13px] font-medium text-foreground">Anyone with the link</p>
              <p className="truncate text-[11px] text-muted-foreground">Anyone on the internet with the link can view</p>
            </div>
          </div>
          <Icon name="expand_more" className="text-[18px] text-muted-foreground" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="ob-press flex items-center gap-1.5 rounded-full border border-sky-500/40 px-4 py-1.5 text-[12.5px] font-semibold text-sky-600 dark:text-sky-400" style={delay(1500)}>
              <Icon name="link" className="text-[16px]" />
              Copy link
            </div>
            <div className="ob-toast flex items-center gap-1 whitespace-nowrap rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background shadow-lg" style={delay(1750)}>
              <Icon name="check" className="text-[14px]" />
              Link copied
            </div>
          </div>
          <div className="rounded-full bg-sky-600 px-5 py-1.5 text-[12.5px] font-semibold text-white">Done</div>
        </div>
      </div>
    </WindowFrame>
  );
}

function LaunchVisual({ active }: { active: boolean }) {
  const { theme } = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const src = `/onboarding/launch-flow-${theme === "dark" ? "dark" : "light"}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, src]);

  if (failed) {
    const steps = ["Import", "Validate", "Configure", "Launch"];
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {steps.map((step, i) => (
          <div key={step} className="ob-pop flex items-center gap-2 rounded-full bg-white dark:bg-[#23262d] px-4 py-2 text-[13px] font-semibold shadow-md" style={delay(i * 180)}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="ob-pop w-full max-w-[580px] overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#1f2228] shadow-[0_20px_50px_-12px_rgba(15,23,42,0.3)]">
      <video
        key={src}
        ref={videoRef}
        className="block w-full aspect-[16/10] object-cover object-top cursor-zoom-in"
        onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => {})}
        title="Click to view full screen"
        poster={`${src}.jpg`}
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        aria-label="Screen recording of pasting a Drive link, syncing and launching ads"
      >
        <source src={`${src}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
      </video>
    </div>
  );
}
