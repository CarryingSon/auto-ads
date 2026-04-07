import { useState, useEffect, useRef, useMemo } from "react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { TypewriterProgressBar } from "@/components/typewriter-progress-bar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToastAction } from "@/components/ui/toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getCsrfHeaders } from "@/lib/queryClient";
import { filterDisplayableInstagramAccounts } from "@/lib/instagram-accounts";
import {
  FolderOpen,
  FileVideo,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Eye,
  Rocket,
  Settings,
  ExternalLink,
  Loader2,
  Plus,
  Info,
  Image,
  Copy,
  Edit,
  Search,
  ChevronsUpDown,
  Check,
  Target,
  Users,
  Download,
  Save,
  Clock,
  Upload,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { Connection, CampaignSettings, AdSetSettings, AdSettings } from "@shared/schema";

const META_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "IE", name: "Ireland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "RO", name: "Romania" },
  { code: "HU", name: "Hungary" },
  { code: "GR", name: "Greece" },
  { code: "HR", name: "Croatia" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "BG", name: "Bulgaria" },
  { code: "LT", name: "Lithuania" },
  { code: "LV", name: "Latvia" },
  { code: "EE", name: "Estonia" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "CY", name: "Cyprus" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "IN", name: "India" },
  { code: "ZA", name: "South Africa" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "TW", name: "Taiwan" },
  { code: "HK", name: "Hong Kong" },
  { code: "RS", name: "Serbia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "ME", name: "Montenegro" },
  { code: "MK", name: "North Macedonia" },
  { code: "AL", name: "Albania" },
  { code: "XK", name: "Kosovo" },
];

function CountryPicker({ selectedCountries, onToggle }: { selectedCountries: string[]; onToggle: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = META_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs font-normal"
          data-testid="button-add-country"
        >
          <span className="flex items-center gap-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            Search & add countries...
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search countries..."
            value={search}
            onValueChange={setSearch}
            data-testid="input-country-search"
          />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>No countries found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((country) => {
                const isSelected = selectedCountries.includes(country.code);
                return (
                  <CommandItem
                    key={country.code}
                    value={country.code}
                    onSelect={() => onToggle(country.code)}
                    data-testid={`country-option-${country.code}`}
                  >
                    <Check className={`mr-2 h-3.5 w-3.5 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                    <span className="text-xs font-medium mr-1.5">{country.code}</span>
                    <span className="text-xs text-muted-foreground">{country.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface WizardStepProps {
  step: number;
  currentStep: number;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}

function WizardStep({ step, currentStep, title, onClick, disabled }: WizardStepProps) {
  const isCompleted = currentStep > step;
  const isCurrent = currentStep === step;
  const isClickable = onClick && !disabled;

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={disabled}
      className={`flex flex-col items-center relative z-10 ${isClickable ? "cursor-pointer" : ""} ${disabled && !isCurrent ? "opacity-60 cursor-not-allowed" : ""}`}
      data-testid={`wizard-step-${step}`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold mb-2 transition-all ${
          isCompleted
            ? "bg-green-500 text-white shadow-lg shadow-green-200/50 hover:scale-110"
            : isCurrent
            ? "bg-[#1877F2] text-white shadow-[0_0_15px_rgba(24,119,242,0.5)] hover:scale-110"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
        }`}
      >
        {isCompleted ? <span className="material-symbols-outlined text-base">check</span> : step}
      </div>
      <span
        className={`text-[10px] font-semibold uppercase tracking-widest ${
          isCompleted ? "text-green-600" : isCurrent ? "text-[#1877F2]" : "text-slate-400"
        }`}
      >
        {title}
      </span>
    </button>
  );
}

interface ParsedCopy {
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
}

function parsePastedCopyText(rawText: string): ParsedCopy {
  const extractCopyFields = (text: string): ParsedCopy => {
    const primaryTexts: string[] = [];
    const headlines: string[] = [];
    const descriptions: string[] = [];

    // Keep label boundary behavior aligned with server file parser.
    const fieldLabels = [
      "Primary\\s*text",
      "Primary",
      "Headline",
      "Description",
      "Desc",
    ];
    const extractByLabel = (labelPattern: string): string[] => {
      const results: string[] = [];
      const regex = new RegExp(
        `${labelPattern}[\\s_]*(\\d*):\\s*(.+?)(?=\\n\\s*(?:(?:${fieldLabels.join("|")})[\\s_]*\\d*\\s*:)|$)`,
        "gis",
      );
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const value = match[2].trim();
        if (value) results.push(value);
      }
      return results;
    };

    primaryTexts.push(...extractByLabel("(?:Primary\\s*text|Primary)"));
    headlines.push(...extractByLabel("Headline"));
    descriptions.push(...extractByLabel("(?:Description|Desc)"));

    return { primaryTexts, headlines, descriptions };
  };

  const results: ParsedCopy[] = [];
  const dctHeaders: { start: number; contentStart: number }[] = [];

  const dctBlockPattern = /(?:^|\n)\s*(DCT[\s_]*\d+[^\n:]*):\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = dctBlockPattern.exec(rawText)) !== null) {
    dctHeaders.push({
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (dctHeaders.length === 0) {
    const adBlockPattern = /(?:^|\n)\s*(Ad\s*(\d{1,3}))[:\s]*/gi;
    while ((match = adBlockPattern.exec(rawText)) !== null) {
      dctHeaders.push({
        start: match.index,
        contentStart: match.index + match[0].length,
      });
    }
  }

  if (dctHeaders.length > 0) {
    dctHeaders.sort((a, b) => a.start - b.start);
    for (let i = 0; i < dctHeaders.length; i++) {
      const start = dctHeaders[i].contentStart;
      const end = i + 1 < dctHeaders.length ? dctHeaders[i + 1].start : rawText.length;
      const blockText = rawText.slice(start, end);
      results.push(extractCopyFields(blockText));
    }
  } else {
    const separatorPattern = /[-–—_=]{5,}/g;
    if (separatorPattern.test(rawText)) {
      const blocks = rawText.split(/[-–—_=]{5,}/).filter((b) => b.trim());
      for (const block of blocks) {
        const blockText = block.trim();
        if (!blockText) continue;

        const dctNameMatch = blockText.match(/^\s*(DCT[\s_-]*[^\n:]+):\s*/i);
        const contentText = dctNameMatch ? blockText.slice(dctNameMatch[0].length) : blockText;
        const copy = extractCopyFields(contentText);
        if (copy.primaryTexts.length > 0 || copy.headlines.length > 0) {
          results.push(copy);
        }
      }
    } else {
      const numberedPattern = /(?:^|\n)\s*(\d{1,3})\.\s+/g;
      const numberedHeaders: { start: number; contentStart: number }[] = [];
      while ((match = numberedPattern.exec(rawText)) !== null) {
        numberedHeaders.push({
          start: match.index,
          contentStart: match.index + match[0].length,
        });
      }

      if (numberedHeaders.length > 0) {
        numberedHeaders.sort((a, b) => a.start - b.start);
        for (let i = 0; i < numberedHeaders.length; i++) {
          const start = numberedHeaders[i].contentStart;
          const end = i + 1 < numberedHeaders.length ? numberedHeaders[i + 1].start : rawText.length;
          const blockText = rawText.slice(start, end);
          results.push(extractCopyFields(blockText));
        }
      } else {
        const copy = extractCopyFields(rawText);
        if (copy.primaryTexts.length > 0 || copy.headlines.length > 0) {
          results.push(copy);
        }
      }
    }
  }

  return {
    primaryTexts: results.flatMap((r) => r.primaryTexts),
    headlines: results.flatMap((r) => r.headlines),
    descriptions: results.flatMap((r) => r.descriptions),
  };
}

type LaunchStatus = "idle" | "extracting" | "launching" | "complete" | "error";

interface LaunchResults {
  campaign?: { id: string; name: string } | null;
  adSets: Array<{ id: string; name: string; status: string }>;
  creatives: Array<{ id: string; name: string; type: string }>;
  ads: Array<{ id: string; name: string; adSetName: string }>;
  logs: string[];
}

interface AdSetInfo {
  id: string;
  name: string;
  folderName: string;
  videoCount: number;
  imageCount: number;
  hasDocx: boolean;
  docxFileName: string | null;
  docxSource?: 'per-dct' | 'global' | 'missing';
  parsedCopy?: ParsedCopy | null;
  status: string;
  validationErrors: string[] | null;
  useDefaults: boolean;
  overrideSettings?: Record<string, any>;
  geoSplitMarket?: string;
  geoTargeting?: string[];
}

interface ImportResult {
  jobId: string;
  folderName: string;
  folderId: string;
  adSets: AdSetInfo[];
}

type AdUploadMode = "single" | "dynamic";

interface ImageEnhancements {
  add_overlays: boolean;
  visual_touch_ups: boolean;
  add_music: boolean;
  text_improvements: boolean;
  show_summaries: boolean;
  relevant_comments: boolean;
  enhance_cta: boolean;
  brightness_and_contrast: boolean;
  reveal_details: boolean;
  show_spotlights: boolean;
}

interface VideoEnhancements {
  visual_touch_ups: boolean;
  text_improvements: boolean;
  add_video_effects: boolean;
  show_summaries: boolean;
  relevant_comments: boolean;
  enhance_cta: boolean;
  reveal_details: boolean;
  show_spotlights: boolean;
}

interface CreativeEnhancements {
  image: ImageEnhancements;
  video: VideoEnhancements;
}

const DEFAULT_IMAGE_ENHANCEMENTS: ImageEnhancements = {
  add_overlays: false,
  visual_touch_ups: true,
  add_music: false,
  text_improvements: false,
  show_summaries: false,
  relevant_comments: true,
  enhance_cta: true,
  brightness_and_contrast: false,
  reveal_details: false,
  show_spotlights: false,
};

const DEFAULT_VIDEO_ENHANCEMENTS: VideoEnhancements = {
  visual_touch_ups: true,
  text_improvements: false,
  add_video_effects: false,
  show_summaries: false,
  relevant_comments: true,
  enhance_cta: false,
  reveal_details: false,
  show_spotlights: false,
};

const DEFAULT_ENHANCEMENTS: CreativeEnhancements = {
  image: { ...DEFAULT_IMAGE_ENHANCEMENTS },
  video: { ...DEFAULT_VIDEO_ENHANCEMENTS },
};

interface WizardDraft {
  version: number;
  currentStep: number;
  folderUrl: string;
  folderName: string;
  jobId: string | null;
  selectedCampaignId: string;
  adSetOverrides: Record<string, any>;
  launchMode: "now" | "scheduled";
  scheduledDate: string;
  scheduledTime: string;
  timestamp: number;
  adAccountId?: string;
  facebookPageId?: string;
  connectionUpdatedAt?: string;
  adUploadMode?: AdUploadMode;
}

const DRAFT_VERSION = 3;
const DRAFT_STORAGE_KEY = "bulk-ads-draft";
const SYNC_REQUEST_TIMEOUT_MS = 180000;
const QUEUE_STUCK_WARNING_MS = 45000;

const SYNC_STATUS_MESSAGES = [
  { after: 0, text: "Connecting to Google Drive..." },
  { after: 2, text: "Scanning folder structure..." },
  { after: 5, text: "Found DCT subfolders, reading files..." },
  { after: 8, text: "Downloading DOCX files..." },
  { after: 12, text: "Parsing ad copy from documents..." },
  { after: 18, text: "Extracting primary texts, headlines, descriptions..." },
  { after: 25, text: "Validating creatives and matching copy..." },
  { after: 40, text: "Processing media files..." },
  { after: 60, text: "Almost done, finalizing structure..." },
  { after: 90, text: "Still working, large folder takes longer..." },
  { after: 120, text: "Hang tight, processing a lot of files..." },
];

interface DefaultSettings {
  adAccountId?: string;
  campaignId?: string;
  campaignName?: string;
  createNewCampaign?: boolean;
  dailyBudget?: number;
  startDate?: string;
  placements?: "AUTO" | "MANUAL";
  geoTargeting?: string[];
  ageMin?: number;
  ageMax?: number;
  gender?: "ALL" | "MALE" | "FEMALE";
  dailyMinSpendTarget?: number;
  dailySpendCap?: number;
  lifetimeSpendCap?: number;
  pageId?: string;
  instagramAccountId?: string;
  budgetAmount?: number;
  budgetType?: "DAILY" | "LIFETIME";
  pixelId?: string;
  defaultCta?: string;
  websiteUrl?: string;
  defaultUrl?: string;
  displayLink?: string;
  beneficiaryName?: string;
  payerName?: string;
}

interface ActiveSyncState {
  syncStep: number;
  startTime: number;
  campaignId: string;
  driveUrl: string;
  mode: "private" | "public";
  promise: Promise<any> | null;
  result: any | null;
  error: string | null;
  resultApplied: boolean;
  listeners: Set<() => void>;
}

const activeSyncStore: ActiveSyncState = {
  syncStep: 0,
  startTime: 0,
  campaignId: "",
  driveUrl: "",
  mode: "public",
  promise: null,
  result: null,
  error: null,
  resultApplied: false,
  listeners: new Set(),
};

function notifySyncListeners() {
  activeSyncStore.listeners.forEach(fn => fn());
}

function useSyncStore() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate(c => c + 1);
    activeSyncStore.listeners.add(listener);
    forceUpdate(c => c + 1);
    return () => { activeSyncStore.listeners.delete(listener); };
  }, []);
  return activeSyncStore;
}

interface ActiveLaunchState {
  status: LaunchStatus;
  currentStep: number;
  jobId: string | null;
  campaignId: string;
  campaignName: string;
  progress: number;
  logs: {message: string; type: string; timestamp?: string}[];
  adSetStatuses: Record<string, "pending" | "processing" | "completed" | "failed">;
  results: LaunchResults;
  adSets: AdSetInfo[];
  folderUrl: string;
  folderName: string;
  driveMode: "private" | "public";
  estimatedTimeRemaining: number | null;
  initialEstimatedTime: number | null;
  launchStartTime: number | null;
  isPolling: boolean;
  syncResultsData: any;
  listeners: Set<() => void>;
}

const EMPTY_LAUNCH_RESULTS: LaunchResults = {
  campaign: null,
  adSets: [],
  creatives: [],
  ads: [],
  logs: [],
};

const activeLaunchStore: ActiveLaunchState = {
  status: "idle",
  currentStep: 0,
  jobId: null,
  campaignId: "",
  campaignName: "",
  progress: 0,
  logs: [],
  adSetStatuses: {},
  results: { ...EMPTY_LAUNCH_RESULTS },
  adSets: [],
  folderUrl: "",
  folderName: "",
  driveMode: "public",
  estimatedTimeRemaining: null,
  initialEstimatedTime: null,
  launchStartTime: null,
  isPolling: false,
  syncResultsData: null,
  listeners: new Set(),
};

function notifyLaunchListeners() {
  activeLaunchStore.listeners.forEach(fn => fn());
}

function resetLaunchStore() {
  activeLaunchStore.status = "idle";
  activeLaunchStore.currentStep = 0;
  activeLaunchStore.jobId = null;
  activeLaunchStore.campaignId = "";
  activeLaunchStore.campaignName = "";
  activeLaunchStore.progress = 0;
  activeLaunchStore.logs = [];
  activeLaunchStore.adSetStatuses = {};
  activeLaunchStore.results = { ...EMPTY_LAUNCH_RESULTS };
  activeLaunchStore.adSets = [];
  activeLaunchStore.folderUrl = "";
  activeLaunchStore.folderName = "";
  activeLaunchStore.driveMode = "public";
  activeLaunchStore.estimatedTimeRemaining = null;
  activeLaunchStore.initialEstimatedTime = null;
  activeLaunchStore.launchStartTime = null;
  activeLaunchStore.isPolling = false;
  activeLaunchStore.syncResultsData = null;
  notifyLaunchListeners();
}

function useLaunchStore() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const listener = () => forceUpdate(c => c + 1);
    activeLaunchStore.listeners.add(listener);
    forceUpdate(c => c + 1);
    return () => { activeLaunchStore.listeners.delete(listener); };
  }, []);
  return activeLaunchStore;
}

export default function BulkAds() {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState("");
  const [folderName, setFolderName] = useState("");
  const [adSets, setAdSets] = useState<AdSetInfo[]>([]);
  const [expandedAdSets, setExpandedAdSets] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [defaultSettings, setDefaultSettings] = useState<DefaultSettings>({
    createNewCampaign: true,
    dailyBudget: 0,
    geoTargeting: [],
    ageMin: undefined,
    ageMax: undefined,
    gender: undefined,
    placements: "AUTO",
    budgetAmount: undefined,
    budgetType: undefined,
    pixelId: "",
    beneficiaryName: "",
    payerName: "",
  });
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>("idle");
  const [launchProgress, setLaunchProgress] = useState(0);
  const [launchLogs, setLaunchLogs] = useState<{message: string; type: string; timestamp?: string}[]>([]);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [initialEstimatedTime, setInitialEstimatedTime] = useState<number | null>(null);
  const [launchStartTime, setLaunchStartTime] = useState<number | null>(null);
  const [adSetOverrides, setAdSetOverrides] = useState<Record<string, { 
    name?: string; 
    dailyBudget?: number;
    geoTargeting?: string[];
    ageMin?: number;
    ageMax?: number;
    gender?: string;
    dailyMinSpendTarget?: number;
    dailySpendCap?: number;
    lifetimeSpendCap?: number;
  }>>({});
  const [disabledAdSetIds, setDisabledAdSetIds] = useState<Set<string>>(new Set());
  const [isPolling, setIsPolling] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignObjective, setNewCampaignObjective] = useState("OUTCOME_TRAFFIC");
  const [newCampaignBudgetType, setNewCampaignBudgetType] = useState<"ABO" | "CBO">("ABO");
  const [newCampaignBudget, setNewCampaignBudget] = useState("");
  const [currentAdSetIndex, setCurrentAdSetIndex] = useState(0);
  const [adSetStatuses, setAdSetStatuses] = useState<Record<string, "pending" | "processing" | "completed" | "failed">>({});
  const [showCopyEditor, setShowCopyEditor] = useState(false);
  const [editingCopy, setEditingCopy] = useState<{
    primaryText: string;
    headline: string;
    description: string;
    cta: string;
    url: string;
    utm: string;
  }>({
    primaryText: "",
    headline: "",
    description: "",
    cta: "LEARN_MORE",
    url: "",
    utm: "",
  });
  const [adSetCopyOverrides, setAdSetCopyOverrides] = useState<Record<string, typeof editingCopy>>({});
  const [launchMode, setLaunchMode] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [adUploadMode, setAdUploadMode] = useState<AdUploadMode>("dynamic");
  const [creativeEnhancements, setCreativeEnhancements] = useState<CreativeEnhancements>({ ...DEFAULT_ENHANCEMENTS });
  const [driveMode, setDriveMode] = useState<"private" | "public">("private");
  const [geoSplit, setGeoSplit] = useState(false);
  const [dryRunPreview, setDryRunPreview] = useState<Array<{
    index: number;
    adsetId: string;
    adsetName: string;
    videoFilename: string;
    headline: string;
    primaryText: string;
    description: string;
    cta: string;
    url: string;
    isValid: boolean;
    errors: string[];
  }> | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showCopyEditModal, setShowCopyEditModal] = useState(false);
  const [editingAdSetId, setEditingAdSetId] = useState<string | null>(null);
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState(false);
  const [editingAdSetCopy, setEditingAdSetCopy] = useState<{
    primaryTexts: string[];
    headlines: string[];
    descriptions: string[];
  }>({ primaryTexts: [], headlines: [], descriptions: [] });
  const [isApplyingGlobalCopy, setIsApplyingGlobalCopy] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showTargetingEditDialog, setShowTargetingEditDialog] = useState(false);
  const [showCreativeEditDialog, setShowCreativeEditDialog] = useState(false);
  const [editingTargeting, setEditingTargeting] = useState({
    budgetAmount: 0,
    budgetType: "DAILY" as "DAILY" | "LIFETIME",
    geoTargeting: [] as string[],
    ageMin: 18,
    ageMax: 65,
    gender: "ALL" as "ALL" | "MALE" | "FEMALE",
  });
  const [editingCreative, setEditingCreative] = useState({
    pixelId: "",
    defaultCta: "LEARN_MORE",
    websiteUrl: "",
    defaultUrl: "",
    displayLink: "",
    beneficiaryName: "",
    payerName: "",
  });
  const syncStore = useSyncStore();
  const syncStep = syncStore.syncStep;
  const syncStartTime = syncStore.startTime || null;
  const launchStore = useLaunchStore();
  const [syncElapsedTime, setSyncElapsedTime] = useState<number>(0);
  const [importCampaignId, setImportCampaignId] = useState<string>("");
  const [importAdSetId, setImportAdSetId] = useState<string>("");
  const [showDriveBrowser, setShowDriveBrowser] = useState(true);
  const [browseFolderId, setBrowseFolderId] = useState("root");
  const [browseHistory, setBrowseHistory] = useState<Array<{ id: string; name: string }>>([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState("");
  const [driveSearchDebounced, setDriveSearchDebounced] = useState("");
  const [driveTab, setDriveTab] = useState<"my-drive" | "shared" | "shared-drives">("my-drive");
  const [selectedSharedDriveId, setSelectedSharedDriveId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCampaignId && selectedCampaignId !== "__create_new__") {
      setImportCampaignId(selectedCampaignId);
      setImportAdSetId("");
    }
  }, [selectedCampaignId]);
    const [syncResultsData, setSyncResultsData] = useState<{
    folderName: string;
    globalDocxFound: boolean;
    adSets: AdSetInfo[];
  } | null>(null);
  const [launchResults, setLaunchResults] = useState<LaunchResults>({ ...EMPTY_LAUNCH_RESULTS });
  
  // Load ad accounts list with hasSettings flag (same source as sidebar)
  const { data: adAccountsData, isLoading: adAccountsLoading } = useQuery<{
    data: Array<{
      id: string;
      name: string;
      hasSettings?: boolean;
    }>;
    selectedAdAccountId: string | null;
    connectionUpdatedAt: string | null;
  }>({
    queryKey: ["/api/meta/ad-accounts"],
  });

  const selectedAdAccountId = adAccountsData?.selectedAdAccountId || "";
  const availableAdAccounts = adAccountsData?.data || [];
  const normalizeAdAccountId = (value: string | null | undefined) => String(value || "").replace(/^act_/, "");
  const hasUsableAdAccount = availableAdAccounts.length > 0;
  const hasSelectedUsableAdAccount = Boolean(selectedAdAccountId) && availableAdAccounts.some(
    (account) => normalizeAdAccountId(account.id) === normalizeAdAccountId(selectedAdAccountId),
  );
  const selectedSessionAdAccount = availableAdAccounts.find(
    (account) => normalizeAdAccountId(account.id) === normalizeAdAccountId(selectedAdAccountId),
  );
  const connectionUpdatedAt = adAccountsData?.connectionUpdatedAt || null;

  // Load per-ad-account settings to check if configured
  const { data: adAccountSettingsData, isLoading: adAccountSettingsLoading, isFetched: adAccountSettingsFetched, dataUpdatedAt } = useQuery<{
    settings: {
      pixelId?: string;
      pixelName?: string;
      websiteUrl?: string;
      defaultUrl?: string;
      displayLink?: string;
      isConfigured?: boolean;
      geoTargeting?: string[];
      ageMin?: number;
      ageMax?: number;
      gender?: string;
      budgetType?: string;
      budgetAmount?: number;
      defaultCta?: string;
      audienceType?: string;
      audienceId?: string;
      audienceName?: string;
      facebookPageId?: string;
      facebookPageName?: string;
      instagramPageId?: string;
      instagramPageName?: string;
      creativeEnhancements?: Record<string, boolean>;
    } | null;
    adAccountId: string | null;
    adAccountName: string | null;
    isConfigured: boolean;
  }>({
    queryKey: ["/api/ad-account-settings", selectedAdAccountId || "none"],
    queryFn: async () => {
      const res = await fetch("/api/ad-account-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ad account settings");
      return res.json();
    },
    enabled: !!selectedAdAccountId && hasSelectedUsableAdAccount,
    staleTime: 0, // Always refetch to get fresh data
    refetchOnMount: "always", // Always refetch when component mounts
  });

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
    queryFn: async () => {
      const res = await fetch("/api/connections", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: globalSettings } = useQuery<{
    facebookPageId?: string;
    facebookPageName?: string;
    instagramPageId?: string;
    instagramPageName?: string;
  }>({
    queryKey: ["/api/settings"],
  });

  // Auto-load saved creative enhancements from ad account settings
  const enhancementsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (adAccountSettingsData?.settings?.creativeEnhancements && selectedAdAccountId && enhancementsLoadedRef.current !== selectedAdAccountId) {
      const saved = adAccountSettingsData.settings.creativeEnhancements as any;
      if (saved.image || saved.video) {
        setCreativeEnhancements(prev => ({
          image: { ...prev.image, ...(saved.image ? Object.fromEntries(Object.entries(saved.image).filter(([key]) => key in prev.image)) : {}) },
          video: { ...prev.video, ...(saved.video ? Object.fromEntries(Object.entries(saved.video).filter(([key]) => key in prev.video)) : {}) },
        }));
      } else if (typeof saved === 'object' && !Array.isArray(saved)) {
        const oldToImageMap: Record<string, keyof ImageEnhancements> = {
          relevant_comments: "relevant_comments",
          enhance_cta: "enhance_cta",
          visual_touch_ups: "visual_touch_ups",
          text_generation: "text_improvements",
          text_improvements: "text_improvements",
          text_optimizations: "text_improvements",
          image_expansion: "add_overlays",
          add_overlays: "add_overlays",
          add_text_overlay: "add_overlays",
          image_brightness_and_contrast: "brightness_and_contrast",
          brightness_and_contrast: "brightness_and_contrast",
          image_animation: "reveal_details",
          reveal_details: "reveal_details",
          reveal_details_over_time: "reveal_details",
          show_summaries: "show_summaries",
          show_summary: "show_summaries",
          add_catalog_items: "show_summaries",
          show_spotlights: "show_spotlights",
          video_highlights: "show_spotlights",
          add_site_links: "show_spotlights",
          music_overlay: "add_music",
          music_generation: "add_music",
          add_music: "add_music",
        };
        const oldToVideoMap: Record<string, keyof VideoEnhancements> = {
          relevant_comments: "relevant_comments",
          enhance_cta: "enhance_cta",
          visual_touch_ups: "visual_touch_ups",
          text_generation: "text_improvements",
          text_improvements: "text_improvements",
          text_optimizations: "text_improvements",
          advantage_plus_creative: "add_video_effects",
          dynamic_media: "add_video_effects",
          add_catalog_items: "show_summaries",
          show_summaries: "show_summaries",
          show_summary: "show_summaries",
          add_site_links: "show_spotlights",
          show_spotlights: "show_spotlights",
          video_highlights: "show_spotlights",
          translate_text: "reveal_details",
          reveal_details: "reveal_details",
          reveal_details_over_time: "reveal_details",
          add_video_effects: "add_video_effects",
        };
        setCreativeEnhancements(prev => {
          const img = { ...prev.image };
          const vid = { ...prev.video };
          for (const [oldKey, val] of Object.entries(saved)) {
            if (typeof val === 'boolean') {
              if (oldToImageMap[oldKey]) img[oldToImageMap[oldKey]] = val;
              if (oldToVideoMap[oldKey]) vid[oldToVideoMap[oldKey]] = val;
            }
          }
          return { image: img, video: vid };
        });
      }
      enhancementsLoadedRef.current = selectedAdAccountId;
    }
  }, [adAccountSettingsData, selectedAdAccountId]);

  // Track previous ad account and page to detect changes
  const prevAdAccountRef = useRef<string | null>(null);
  const prevPageRef = useRef<string | null>(null);
  
  // Ref for auto-scrolling activity log
  const activityLogRef = useRef<HTMLDivElement>(null);
  const syncProgressRef = useRef<HTMLDivElement>(null);

  // Reset session when ad account or page changes
  useEffect(() => {
    const prevAdAccount = prevAdAccountRef.current;
    const prevPage = prevPageRef.current;
    const currentPage = globalSettings?.facebookPageId || null;
    
    // Skip on initial mount (when refs are null)
    if (prevAdAccount === null && prevPage === null) {
      prevAdAccountRef.current = selectedAdAccountId || null;
      prevPageRef.current = currentPage;
      return;
    }
    
    // Check if either changed
    const adAccountChanged = prevAdAccount !== null && selectedAdAccountId && prevAdAccount !== selectedAdAccountId;
    const pageChanged = prevPage !== null && currentPage && prevPage !== currentPage;
    
    if (adAccountChanged || pageChanged) {
      // Reset upload session state
      setCurrentStep(1);
      setJobId(null);
      setFolderUrl("");
      setFolderName("");
      setAdSets([]);
      setExpandedAdSets([]);
      setCampaignName("");
      setSelectedCampaignId("");
      setAdSetOverrides({});
      setAdSetCopyOverrides({});
      setLaunchStatus("idle");
      setLaunchProgress(0);
      setLaunchLogs([]);
      setAdSetStatuses({});
      setDryRunPreview(null);
      setLaunchMode("now");
      setScheduledDate("");
      setScheduledTime("09:00");
      enhancementsLoadedRef.current = null;
      
      // Clear localStorage draft
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      
      toast({
        title: adAccountChanged ? "Ad account changed" : "Facebook page changed",
        description: "Upload session has been reset",
      });
    }
    
    // Update refs
    prevAdAccountRef.current = selectedAdAccountId || null;
    prevPageRef.current = currentPage;
  }, [selectedAdAccountId, globalSettings?.facebookPageId, toast]);


  // Load user settings for defaults
  const { data: userSettings, isLoading: userSettingsLoading } = useQuery<{
    campaignSettings?: CampaignSettings;
    adSetSettings?: AdSetSettings;
    adSettings?: AdSettings;
  }>({
    queryKey: ["/api/user/settings"],
  });

  const { data: pagesData, isFetching: isPagesFetching } = useQuery<{
    data: Array<{ id: string; name: string; source: string }>;
    selectedPageId: string | null;
    filteredByAdAccount?: boolean;
    autoSelected?: boolean;
  }>({
    queryKey: ["/api/meta/pages", selectedAdAccountId || "none"],
    queryFn: async () => {
      const cachedRes = await fetch("/api/meta/pages", { credentials: "include" });
      if (!cachedRes.ok) throw new Error("Failed to fetch Meta pages");
      const cachedData = await cachedRes.json();
      const hasPages = Array.isArray(cachedData?.data) && cachedData.data.length > 0;
      const hasSelectedPage = Boolean(cachedData?.selectedPageId);
      if (hasPages || hasSelectedPage) return cachedData;

      const refreshRes = await fetch("/api/meta/pages?refresh=true", { credentials: "include" });
      if (!refreshRes.ok) return cachedData;
      return refreshRes.json();
    },
    enabled: !!selectedAdAccountId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const selectedPageId = pagesData?.selectedPageId || "";
  const metaPages = pagesData?.data || [];
  const selectedPage = metaPages.find(p => p.id === selectedPageId);
  
  const { data: instagramAccountsData, isFetching: isInstagramFetching } = useQuery<{
    data: Array<{ id: string; username?: string; name?: string }>;
  }>({
    queryKey: ["/api/meta/instagram-accounts", selectedPageId],
    enabled: !!selectedPageId,
  });
  
  const instagramAccounts = filterDisplayableInstagramAccounts(instagramAccountsData?.data || []);
  const savedIgId = globalSettings?.instagramPageId || "";
  const selectedInstagram = instagramAccounts.find(a => a.id === savedIgId) || (instagramAccounts.length > 0 ? instagramAccounts[0] : null);
  const hasLinkedInstagram = Boolean(selectedInstagram?.id);

  const { data: campaignsData, isLoading: campaignsLoading, isError: campaignsError } = useQuery<{
    data: Array<{ 
      id: string; 
      name: string; 
      status: string; 
      effective_status?: string;
      objective?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
    source: string;
  }>({
    queryKey: ["/api/meta/campaigns", selectedAdAccountId || "none"],
    queryFn: async () => {
      const res = await fetch("/api/meta/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!selectedAdAccountId,
  });

  const metaCampaigns = campaignsData?.data || [];
  const isCampaignActive = (campaign: { effective_status?: string; status?: string }) =>
    campaign.effective_status === "ACTIVE" || campaign.status === "ACTIVE";

  const sortedMetaCampaigns = useMemo(() => {
    return [...metaCampaigns].sort((a, b) => {
      const aActive = isCampaignActive(a) ? 1 : 0;
      const bActive = isCampaignActive(b) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });
  }, [metaCampaigns]);
  
  // Fetch ad sets for import settings feature
  const {
    data: importAdSetsData,
    isLoading: importAdSetsLoading,
    isFetching: importAdSetsFetching,
    isError: importAdSetsError,
  } = useQuery<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      daily_budget?: string;
      lifetime_budget?: string;
      targeting?: any;
      promoted_object?: {
        pixel_id?: string;
        page_id?: string;
        custom_event_type?: string;
      };
      dsa_beneficiary?: string;
      dsa_payor?: string;
    }>;
    source?: string;
  }>({
    queryKey: ["/api/meta/adsets", selectedAdAccountId || "none", importCampaignId || "none"],
    queryFn: async () => {
      const res = await fetch(`/api/meta/adsets?campaignId=${encodeURIComponent(importCampaignId)}&live=true`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch ad sets");
      return res.json();
    },
    enabled: !!importCampaignId && !!selectedAdAccountId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const importAdSets = importAdSetsData?.data || [];
  const isImportAdSetsPending = importAdSetsLoading || importAdSetsFetching;

  const { data: importCampaignDetailsData } = useQuery<{
    data: {
      campaign: any;
      adSets: any[];
      ads: any[];
    };
  }>({
    queryKey: ["/api/meta/campaigns/details", selectedAdAccountId || "none", importCampaignId || "none", "live"],
    queryFn: async () => {
      const res = await fetch(`/api/meta/campaigns/${encodeURIComponent(importCampaignId)}/details?live=true`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaign details");
      return res.json();
    },
    enabled: !!importCampaignId && !!selectedAdAccountId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const importCampaignAds = importCampaignDetailsData?.data?.ads || [];
  const hasImportCampaignAdsForSelectedAdSet = !!importAdSetId &&
    importCampaignAds.some((ad: any) => ad.adset_id === importAdSetId);

  const { data: importSampleAdData } = useQuery<{ data: any }>({
    queryKey: [`/api/meta/adsets/${importAdSetId}/sample-ad`],
    enabled: !!importAdSetId && !hasImportCampaignAdsForSelectedAdSet,
  });
  const importSampleAd = importSampleAdData?.data || null;
  
  // Fetch detailed campaign data when a campaign is selected (for accurate settings display)
  const { data: campaignDetailsData, isLoading: campaignDetailsLoading, error: campaignDetailsError } = useQuery<{
    data: {
      campaign: {
        id: string;
        name: string;
        objective: string;
        status: string;
        daily_budget?: string;
        lifetime_budget?: string;
        special_ad_categories?: string[];
      };
      adSets: any[];
      ads: any[];
    };
  }>({
    queryKey: [`/api/meta/campaigns/${selectedCampaignId}/details`],
    enabled: !!selectedCampaignId && selectedCampaignId !== "__create_new__",
    staleTime: 30000, // Cache for 30 seconds
  });
  
  // Use detailed campaign data - NO fallback to list data to ensure consistency with backend
  const campaignDetails = campaignDetailsData?.data?.campaign;
  const selectedCampaign = campaignDetails; // Only use detailed data, not list data
  const campaignHasCBO = selectedCampaign && (selectedCampaign.daily_budget || selectedCampaign.lifetime_budget);
  const campaignBudget = selectedCampaign?.daily_budget 
    ? parseInt(selectedCampaign.daily_budget) / 100 
    : selectedCampaign?.lifetime_budget 
      ? parseInt(selectedCampaign.lifetime_budget) / 100 
      : null;
  const campaignBudgetType = selectedCampaign?.daily_budget ? "DAILY" : selectedCampaign?.lifetime_budget ? "LIFETIME" : null;

  const { data: jobDetails } = useQuery<{
    id: string;
    status: string;
    progressStatus?: "queued" | "processing" | "retrying" | "failed" | "completed";
    currentStep: number;
    campaignId?: string;
    logs?: string[];
    totalAdSets?: number;
    completedAdSets?: number;
    queueId?: string | null;
    queueStatus?: string | null;
    queueAttempts?: number;
    queueMaxAttempts?: number | null;
    nextRunAt?: string | null;
    lastError?: string | null;
  }>({
    queryKey: [`/api/jobs/${jobId}/progress`],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/progress`, {
        credentials: "include",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        throw new Error((await res.text()) || `Failed to fetch progress (${res.status})`);
      }
      return res.json();
    },
    enabled: !!jobId && isPolling,
    refetchInterval: isPolling ? 2000 : false,
  });

  const { data: driveEmailData, isLoading: driveEmailLoading } = useQuery<{ email: string | null; connected: boolean }>({
    queryKey: ["/api/drive/connected-email"],
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
  });
  
  const driveConnectedEmail = driveEmailData?.email || null;

  const { data: driveBrowseData, isLoading: driveBrowseLoading } = useQuery<{
    folderId: string;
    folderName: string;
    parents: string[];
    folders: Array<{ id: string; name: string; modifiedTime: string }>;
  }>({
    queryKey: ["/api/drive/browse", browseFolderId, driveTab, selectedSharedDriveId],
    queryFn: async () => {
      const params = new URLSearchParams({ folderId: browseFolderId });
      if (driveTab === "shared") params.set("sharedWithMe", "true");
      if (driveTab === "shared-drives" && selectedSharedDriveId) params.set("driveId", selectedSharedDriveId);
      const res = await fetch(`/api/drive/browse?${params}`);
      if (!res.ok) throw new Error("Failed to browse");
      return res.json();
    },
    enabled: !!driveConnectedEmail && showDriveBrowser && driveMode === "private" && !driveSearchDebounced && !(driveTab === "shared-drives" && !selectedSharedDriveId),
  });

  useEffect(() => {
    const timer = setTimeout(() => setDriveSearchDebounced(driveSearchQuery), 350);
    return () => clearTimeout(timer);
  }, [driveSearchQuery]);

  const { data: driveSearchData, isLoading: driveSearchLoading } = useQuery<{
    folders: Array<{ id: string; name: string; modifiedTime: string }>;
  }>({
    queryKey: ["/api/drive/search", driveSearchDebounced],
    queryFn: async () => {
      const res = await fetch(`/api/drive/search?q=${encodeURIComponent(driveSearchDebounced)}`);
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
    enabled: !!driveConnectedEmail && showDriveBrowser && driveMode === "private" && driveSearchDebounced.length >= 2,
  });

  const { data: sharedDrivesData, isLoading: sharedDrivesLoading } = useQuery<{
    drives: Array<{ id: string; name: string; createdTime: string }>;
  }>({
    queryKey: ["/api/drive/shared-drives"],
    queryFn: async () => {
      const res = await fetch("/api/drive/shared-drives");
      if (!res.ok) throw new Error("Failed to list shared drives");
      return res.json();
    },
    enabled: !!driveConnectedEmail && driveMode === "private" && driveTab === "shared-drives",
  });

  const isSearchMode = driveSearchDebounced.length >= 2;
  const displayedFolders = isSearchMode ? (driveSearchData?.folders || []) : (driveBrowseData?.folders || []);
  const isLoadingFolders = isSearchMode ? driveSearchLoading : driveBrowseLoading;

  // Fetch available pixels from Meta
  const { data: pixelsData } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/meta/pixels", selectedAdAccountId || "none"],
    queryFn: async () => { const res = await fetch("/api/meta/pixels", { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch pixels"); return res.json(); },
    enabled: !!selectedAdAccountId && hasSelectedUsableAdAccount,
  });
  const availablePixels = pixelsData?.data || [];

  // Compute effective settings - use imported ad set values if selected, otherwise use ad account settings
  const importedAdSet = importAdSetId ? importAdSets.find(a => a.id === importAdSetId) : null;
  const importedTargeting = importedAdSet?.targeting;
  
  // Get promoted_object from imported ad set for pixel info
  const importedPromotedObject = importedAdSet?.promoted_object;
  
  // Get ads from the imported ad set to extract creative-level data (CTA, URL, display_link)
  // Prefer ad with link_data (image ads) since display_link is only supported there
  const importedAdSetAds = importAdSetId ? importCampaignAds.filter((ad: any) => ad.adset_id === importAdSetId) : [];
  const importedAd = importedAdSetAds.find((ad: any) => ad.creative?.object_story_spec?.link_data) 
    || importedAdSetAds[0] || null;

  const extractCreativeUrl = (ad: any): string => {
    if (!ad?.creative) return "";
    const c = ad.creative;
    return c.object_story_spec?.link_data?.link
      || c.object_story_spec?.link_data?.call_to_action?.value?.link
      || c.object_story_spec?.video_data?.call_to_action?.value?.link
      || c.asset_feed_spec?.link_urls?.[0]?.website_url
      || c.asset_feed_spec?.link_urls?.[0]
      || "";
  };
  const extractCreativeCta = (ad: any): string => {
    if (!ad?.creative) return "";
    const c = ad.creative;
    return c.object_story_spec?.link_data?.call_to_action?.type
      || c.object_story_spec?.video_data?.call_to_action?.type
      || c.call_to_action_type
      || c.asset_feed_spec?.call_to_action_types?.[0]
      || "";
  };
  const extractCreativeDisplayLink = (ad: any): string => {
    if (!ad?.creative) return "";
    return ad.creative.object_story_spec?.link_data?.display_link || "";
  };

  const importedDisplayLink = extractCreativeDisplayLink(importSampleAd) || (() => {
    for (const ad of importedAdSetAds) {
      const dl = extractCreativeDisplayLink(ad);
      if (dl) return dl;
    }
    return "";
  })();
  const importedWebsiteUrl = extractCreativeUrl(importSampleAd) || (() => {
    for (const ad of importedAdSetAds) {
      const url = extractCreativeUrl(ad);
      if (url) return url;
    }
    return "";
  })();
  const importedCta = extractCreativeCta(importSampleAd) || (() => {
    for (const ad of importedAdSetAds) {
      const cta = extractCreativeCta(ad);
      if (cta) return cta;
    }
    return "";
  })();
  
  const effectiveSettings = {
    // Ad Set targeting settings - defaultSettings (from edit dialog) takes priority, then imported, then saved settings
    geoTargeting: (defaultSettings.geoTargeting && defaultSettings.geoTargeting.length > 0) 
      ? defaultSettings.geoTargeting 
      : (importedTargeting?.geo_locations?.countries || adAccountSettingsData?.settings?.geoTargeting || []),
    ageMin: defaultSettings.ageMin !== undefined 
      ? defaultSettings.ageMin 
      : (importedTargeting?.age_min || adAccountSettingsData?.settings?.ageMin || 18),
    ageMax: defaultSettings.ageMax !== undefined 
      ? defaultSettings.ageMax 
      : (importedTargeting?.age_max || adAccountSettingsData?.settings?.ageMax || 65),
    gender: defaultSettings.gender 
      ? defaultSettings.gender 
      : (importedTargeting?.genders 
        ? (importedTargeting.genders.includes(1) && importedTargeting.genders.includes(2) ? "ALL" : importedTargeting.genders.includes(1) ? "MALE" : "FEMALE")
        : adAccountSettingsData?.settings?.gender || "ALL"),
    budgetAmount: defaultSettings.budgetAmount !== undefined 
      ? defaultSettings.budgetAmount 
      : (importedAdSet?.daily_budget 
        ? parseInt(importedAdSet.daily_budget) / 100 
        : importedAdSet?.lifetime_budget 
          ? parseInt(importedAdSet.lifetime_budget) / 100
          : adAccountSettingsData?.settings?.budgetAmount || 20),
    budgetType: defaultSettings.budgetType 
      ? defaultSettings.budgetType 
      : (importedAdSet?.daily_budget ? "DAILY" : importedAdSet?.lifetime_budget ? "LIFETIME" : adAccountSettingsData?.settings?.budgetType || "DAILY"),
    // Ad Creative settings from promoted_object - defaultSettings takes priority
    pixelId: defaultSettings.pixelId || importedPromotedObject?.pixel_id || adAccountSettingsData?.settings?.pixelId || null,
    customEventType: importedPromotedObject?.custom_event_type || "PURCHASE",
    // DSA fields for beneficiary and payer - defaultSettings takes priority
    beneficiaryName: defaultSettings.beneficiaryName || importedAdSet?.dsa_beneficiary || (adAccountSettingsData?.settings as any)?.beneficiaryName || null,
    payerName: defaultSettings.payerName || importedAdSet?.dsa_payor || (adAccountSettingsData?.settings as any)?.payerName || null,
    isImported: !!importedAdSet,
  };

  const metaConnected = connections.some(
    (c) => c.provider === "meta" && c.status === "connected"
  );

  const importMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/drive/import", { folderUrl: url });
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setFolderName(data.folderName);
      setCampaignName(data.folderName);
      setAdSets(data.adSets);
      setCurrentStep(2);
      toast({
        title: "Folder imported",
        description: `Found ${data.adSets.length} Ad Set folders`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/drive/adsets?jobId=${jobId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch ad sets");
      }
      return res.json() as Promise<AdSetInfo[]>;
    },
    onSuccess: (data) => {
      setAdSets(data.map(a => ({
        ...a,
        folderName: a.folderName || a.name,
        parsedCopy: a.parsedCopy || null,
        geoSplitMarket: a.geoSplitMarket || (a.overrideSettings as any)?.geoSplitMarket || undefined,
        geoTargeting: a.geoTargeting || (a.overrideSettings as any)?.geoTargeting || undefined,
      })));
      toast({ title: "Folder synced", description: "Ad Set information updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  // Effect to track elapsed time during sync
  useEffect(() => {
    if (syncStep > 0 && syncStep < 5 && syncStartTime) {
      const interval = setInterval(() => {
        setSyncElapsedTime(Date.now() - syncStartTime);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [syncStep, syncStartTime]);

  // Keyboard Enter handler for main action buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea or dialog is open
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        showCopyEditor ||
        showCreateCampaignModal ||
        showTargetingEditDialog ||
        showCreativeEditDialog ||
        showCopyEditModal ||
        showInfoModal
      ) {
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        
        // Step 1: If folder URL is entered, trigger sync
        if (currentStep === 1 && folderUrl.trim()) {
          const syncBtn = document.querySelector('[data-testid="button-sync-drive"]') as HTMLButtonElement;
          if (syncBtn && !syncBtn.disabled) {
            syncBtn.click();
          }
        }
        // Steps 2-3: Click next button if enabled
        else if (currentStep >= 2 && currentStep < 4) {
          const nextBtn = document.querySelector('[data-testid="button-next-step"]') as HTMLButtonElement;
          if (nextBtn && !nextBtn.disabled) {
            nextBtn.click();
          }
        }
        // Step 4: Launch
        else if (currentStep === 4 && launchStatus === "idle") {
          const launchBtn = document.querySelector('[data-testid="button-launch"]') as HTMLButtonElement;
          if (launchBtn && !launchBtn.disabled) {
            launchBtn.click();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, folderUrl, launchStatus, showCopyEditor, showCreateCampaignModal, showTargetingEditDialog, showCreativeEditDialog, showCopyEditModal, showInfoModal]);

  const applySyncResult = (data: any) => {
    setJobId(data.jobId);
    setFolderName(data.driveRootFolderName);
    const mappedAdSets = data.adSets.map((a: any) => ({
      id: a.id,
      name: a.name,
      folderName: a.dctName || a.name,
      videoCount: a.videoCount ?? a.creativeCount,
      imageCount: a.imageCount ?? 0,
      hasDocx: a.docxSource !== 'missing',
      docxFileName: null,
      docxSource: a.docxSource,
      parsedCopy: a.parsedCopy ? {
        primaryTexts: a.parsedCopy.primaryTexts || [],
        headlines: a.parsedCopy.headlines || [],
        descriptions: a.parsedCopy.descriptions || [],
      } : null,
      status: a.status,
      validationErrors: a.validationErrors,
      useDefaults: true,
      geoSplitMarket: a.geoSplitMarket || undefined,
      geoTargeting: a.geoTargeting || undefined,
    }));
    setAdSets(mappedAdSets);
    setSyncResultsData({
      folderName: data.driveRootFolderName,
      globalDocxFound: data.globalDocxFound,
      adSets: mappedAdSets,
    });
    setCurrentStep(2);
  };

  const startGlobalSync = ({ campaignId, driveUrl, mode }: { campaignId: string; driveUrl: string; mode: "private" | "public" }) => {
    if (activeSyncStore.promise || (activeSyncStore.syncStep > 0 && activeSyncStore.syncStep < 5)) {
      return;
    }

    resetLaunchStore();

    setLaunchStatus("idle");
    setLaunchProgress(0);
    setLaunchLogs([]);
    setAdSetStatuses({});
    setLaunchResults({ ...EMPTY_LAUNCH_RESULTS });

    activeSyncStore.startTime = Date.now();
    activeSyncStore.syncStep = 1;
    activeSyncStore.campaignId = campaignId;
    activeSyncStore.driveUrl = driveUrl;
    activeSyncStore.mode = mode;
    activeSyncStore.result = null;
    activeSyncStore.error = null;
    activeSyncStore.resultApplied = false;
    setSyncElapsedTime(0);
    notifySyncListeners();

    setTimeout(() => {
      syncProgressRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    const run = async () => {
      await new Promise(r => setTimeout(r, 600));
      activeSyncStore.syncStep = 2;
      notifySyncListeners();

      const endpoint = mode === "private" ? "/api/drive/import-private" : "/api/drive/sync";
      const apiPromise = apiRequest(
        "POST",
        endpoint,
        { campaignId, driveUrl, geoSplit },
        { timeoutMs: SYNC_REQUEST_TIMEOUT_MS },
      );

      await new Promise(r => setTimeout(r, 800));
      activeSyncStore.syncStep = 3;
      notifySyncListeners();

      const res = await apiPromise;

      await new Promise(r => setTimeout(r, 500));
      activeSyncStore.syncStep = 4;
      notifySyncListeners();

      const data = await res.json();

      await new Promise(r => setTimeout(r, 400));
      activeSyncStore.syncStep = 5;
      activeSyncStore.result = data;
      notifySyncListeners();

      return data;
    };

    activeSyncStore.promise = run()
      .then(data => {
        if (!activeSyncStore.resultApplied) {
          activeSyncStore.resultApplied = true;
          console.log("[sync] directly applying result, adSets:", data?.adSets?.length);
          applySyncResultRef.current(data);
          toast({ title: "Sync successful", description: `Found ${data.adSets?.length || 0} DCT folders` });
        }
      })
      .catch(err => {
        activeSyncStore.syncStep = 0;
        activeSyncStore.error = err?.message || "Sync failed";
        notifySyncListeners();
      })
      .finally(() => {
        // Important: clear settled promise so a new sync can start without page refresh.
        activeSyncStore.promise = null;
      });
  };

  const applySyncResultRef = useRef(applySyncResult);
  applySyncResultRef.current = applySyncResult;
  const queueWaitStartedAtRef = useRef<number | null>(null);
  const queueKickAttemptedRef = useRef(false);

  useEffect(() => {
    const store = activeSyncStore;
    console.log("[sync-restore] syncStep effect, syncStep:", store.syncStep, "hasResult:", !!store.result, "resultApplied:", store.resultApplied, "error:", store.error);

    if (store.driveUrl) {
      setFolderUrl(store.driveUrl);
    }
    if (store.mode) {
      setDriveMode(store.mode);
    }
    if (store.campaignId) {
      setSelectedCampaignId(store.campaignId);
    }

    if (store.syncStep > 0 && store.syncStep < 5 && store.startTime) {
      setSyncElapsedTime(Date.now() - store.startTime);
    }

    if (store.error) {
      toast({ title: "Sync failed", description: store.error, variant: "destructive" });
      store.error = null;
    }
  }, [syncStep]);

  useEffect(() => {
    const store = activeSyncStore;
    if (store.syncStep === 5 && store.result && !store.resultApplied) {
      store.resultApplied = true;
      console.log("[sync-restore] applying completed result, adSets:", store.result?.adSets?.length);
      try {
        applySyncResultRef.current(store.result);
        toast({ title: "Sync successful", description: `Found ${store.result.adSets?.length || 0} DCT folders` });
      } catch (e) {
        console.error("[sync-restore] Failed to apply sync result:", e);
        store.resultApplied = false;
      }
    }
  }, [syncStep]);

  useEffect(() => {
    const store = activeSyncStore;
    if (store.syncStep === 5 && store.result && !store.resultApplied) {
      store.resultApplied = true;
      console.log("[sync-restore] mount: applying completed result, adSets:", store.result?.adSets?.length);
      try {
        const data = store.result;
        setJobId(data.jobId);
        setFolderName(data.driveRootFolderName);
        if (data.adSets && Array.isArray(data.adSets)) {
          const mappedAdSets = data.adSets.map((a: any) => ({
            id: a.id,
            name: a.name,
            folderName: a.dctName || a.name,
            videoCount: a.videoCount ?? a.creativeCount,
            imageCount: a.imageCount ?? 0,
            hasDocx: a.docxSource !== 'missing',
            docxFileName: null,
            docxSource: a.docxSource,
            parsedCopy: a.parsedCopy ? {
              primaryTexts: a.parsedCopy.primaryTexts || [],
              headlines: a.parsedCopy.headlines || [],
              descriptions: a.parsedCopy.descriptions || [],
            } : null,
            status: a.status,
            validationErrors: a.validationErrors,
            useDefaults: true,
            geoSplitMarket: a.geoSplitMarket || (a.overrideSettings as any)?.geoSplitMarket || undefined,
            geoTargeting: a.geoTargeting || (a.overrideSettings as any)?.geoTargeting || undefined,
          }));
          setAdSets(mappedAdSets);
          setSyncResultsData({
            folderName: data.driveRootFolderName,
            globalDocxFound: data.globalDocxFound,
            adSets: mappedAdSets,
          });
        }
        setCurrentStep(2);
        toast({ title: "Sync successful", description: `Found ${data.adSets?.length || 0} DCT folders` });
      } catch (e) {
        console.error("[sync-restore] mount: Failed to apply sync result:", e);
        store.resultApplied = false;
      }
    }
    if (store.driveUrl) setFolderUrl(store.driveUrl);
    if (store.mode) setDriveMode(store.mode);
    if (store.campaignId) setSelectedCampaignId(store.campaignId);
  }, []);

  useEffect(() => {
    const ls = activeLaunchStore;
    if (activeSyncStore.syncStep > 0) return;
    if ((ls.status === "launching" || ls.status === "complete" || ls.status === "extracting" || ls.status === "error") && ls.currentStep >= 4) {
      console.log("[launch-restore] restoring launch state, status:", ls.status, "step:", ls.currentStep);
      setCurrentStep(ls.currentStep);
      setJobId(ls.jobId);
      setSelectedCampaignId(ls.campaignId);
      setCampaignName(ls.campaignName);
      setLaunchStatus(ls.status);
      setLaunchProgress(ls.progress);
      setLaunchLogs([...ls.logs]);
      setAdSetStatuses({...ls.adSetStatuses});
      setLaunchResults(ls.results);
      setAdSets([...ls.adSets]);
      setFolderUrl(ls.folderUrl);
      setFolderName(ls.folderName);
      setDriveMode(ls.driveMode);
      setEstimatedTimeRemaining(ls.estimatedTimeRemaining);
      setInitialEstimatedTime(ls.initialEstimatedTime);
      setLaunchStartTime(ls.launchStartTime);
      setIsPolling(ls.isPolling);
      if (ls.syncResultsData) setSyncResultsData(ls.syncResultsData);
    }
  }, []);

  useEffect(() => {
    if (launchStatus === "launching" || launchStatus === "complete" || launchStatus === "extracting" || currentStep === 5) {
      activeLaunchStore.status = launchStatus;
      activeLaunchStore.currentStep = currentStep;
      activeLaunchStore.jobId = jobId;
      activeLaunchStore.campaignId = selectedCampaignId;
      activeLaunchStore.campaignName = campaignName;
      activeLaunchStore.progress = launchProgress;
      activeLaunchStore.logs = [...launchLogs];
      activeLaunchStore.adSetStatuses = {...adSetStatuses};
      activeLaunchStore.results = launchResults;
      activeLaunchStore.adSets = [...adSets];
      activeLaunchStore.folderUrl = folderUrl;
      activeLaunchStore.folderName = folderName;
      activeLaunchStore.driveMode = driveMode;
      activeLaunchStore.estimatedTimeRemaining = estimatedTimeRemaining;
      activeLaunchStore.initialEstimatedTime = initialEstimatedTime;
      activeLaunchStore.launchStartTime = launchStartTime;
      activeLaunchStore.isPolling = isPolling;
      activeLaunchStore.syncResultsData = syncResultsData;
      notifyLaunchListeners();
    }
  }, [launchStatus, currentStep, launchProgress, launchLogs, adSetStatuses, launchResults, jobId, campaignName, isPolling, estimatedTimeRemaining]);

  const updateAdSetCopyMutation = useMutation({
    mutationFn: async ({ adsetId, copy }: { 
      adsetId: string; 
      copy: { primaryTexts: string[]; headlines: string[]; descriptions: string[] } 
    }) => {
      const res = await apiRequest("POST", `/api/drive/adsets/${adsetId}/copy`, copy);
      return res.json();
    },
    onSuccess: (_, variables) => {
      setAdSets(prev => prev.map(a => 
        a.id === variables.adsetId 
          ? { 
              ...a, 
              hasDocx: true, 
              docxSource: a.docxSource === 'missing' ? 'per-dct' : a.docxSource,
              status: a.status === 'invalid' && a.validationErrors?.includes('No ad copy found') 
                ? ((a.validationErrors?.filter(e => e !== 'No ad copy found').length || 0) > 0 ? 'invalid' : 'valid')
                : a.status,
              validationErrors: a.validationErrors?.filter(e => e !== 'No ad copy found') || [],
              parsedCopy: {
                ...(a.parsedCopy || { primaryTexts: [], headlines: [], descriptions: [] }),
                ...variables.copy,
              },
            }
          : a
      ));
      setShowCopyEditModal(false);
      setEditingAdSetId(null);
      toast({ title: "Ad copy updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update copy", description: error.message, variant: "destructive" });
    },
  });

  const updateAdSetMutation = useMutation({
    mutationFn: async ({ adsetId, updates }: { adsetId: string; updates: Partial<AdSetInfo> }) => {
      const res = await apiRequest("PATCH", `/api/adsets/${adsetId}`, updates);
      return res.json();
    },
    onSuccess: (_, variables) => {
      setAdSets((prev) =>
        prev.map((a) => (a.id === variables.adsetId ? { ...a, ...variables.updates } : a))
      );
    },
  });

  const updateDefaultsMutation = useMutation({
    mutationFn: async (settings: DefaultSettings) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}/defaults`, { defaultSettings: settings });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Defaults updated" });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (params: { name: string; objective: string; budgetType: "ABO" | "CBO"; dailyBudget?: number }) => {
      const res = await apiRequest("POST", "/api/meta/campaigns", params);
      return res.json() as Promise<{ success: boolean; campaign: { id: string; name: string } }>;
    },
    onSuccess: (data) => {
      setSelectedCampaignId(data.campaign.id);
      setCampaignName(data.campaign.name);
      setDefaultSettings((prev) => ({
        ...prev,
        campaignId: data.campaign.id,
        campaignName: data.campaign.name,
        createNewCampaign: false,
      }));
      setShowCreateCampaignModal(false);
      setNewCampaignName("");
      setNewCampaignBudget("");
      setNewCampaignBudgetType("ABO");
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"], exact: false });
      toast({ title: "Campaign created", description: `Created "${data.campaign.name}"` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create campaign", description: error.message, variant: "destructive" });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("No job ID");
      const res = await apiRequest("POST", "/api/bulk-ads/dry-run", { jobId, disabledAdSetIds: Array.from(disabledAdSetIds) });
      return res.json() as Promise<{
        jobId: string;
        adsCount: number;
        validAds: number;
        invalidAds: number;
        preview: Array<{
          index: number;
          adsetId: string;
          adsetName: string;
          videoFilename: string;
          headline: string;
          primaryText: string;
          description: string;
          cta: string;
          url: string;
          isValid: boolean;
          errors: string[];
        }>;
      }>;
    },
    onSuccess: (data) => {
      setDryRunPreview(data.preview);
      toast({
        title: "Dry run complete",
        description: `${data.validAds} of ${data.adsCount} ads are valid`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Dry run failed", description: error.message, variant: "destructive" });
    },
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("No job ID");
      
      // Launch must always use a currently selected and usable Meta ad account.
      const actualAdAccountId = selectedAdAccountId;
      if (!hasSelectedUsableAdAccount || !actualAdAccountId) {
        throw new Error("ad_account_required: Select a valid Meta ad account before launching.");
      }
      
      // Initialize all enabled ad set statuses to pending
      const initialStatuses: Record<string, "pending" | "processing" | "completed" | "failed"> = {};
      enabledAdSets.forEach((a) => {
        initialStatuses[a.id] = "pending";
      });
      setAdSetStatuses(initialStatuses);
      
      const payload: Record<string, any> = {
        jobId,
        adAccountId: actualAdAccountId,
        campaignId: defaultSettings.campaignId || selectedCampaignId,
        campaignName,
        pageId: selectedPageId,
        launchMode,
        adUploadMode,
        copyOverrides: adSetCopyOverrides,
        creativeEnhancements,
        disabledAdSetIds: Array.from(disabledAdSetIds),
      };
      if (launchMode === "scheduled" && scheduledDate) {
        payload.scheduledAt = `${scheduledDate}T${scheduledTime}:00`;
      }
      // Auto-save creative enhancements to ad account settings for next upload
      apiRequest("PATCH", "/api/ad-account-settings", { creativeEnhancements }).catch(() => {});

      const res = await apiRequest("POST", "/api/bulk-ads/launch", payload);
      return res.json();
    },
    onMutate: () => {
      // Reset state before launching
      setLaunchLogs([]);
      setLaunchProgress(0);
      setLaunchStatus("launching");
      setCurrentStep(5); // Navigate to Results step with live progress
      setLaunchStartTime(Date.now());
      
      let totalEstimatedSeconds = 0;
      for (const adset of enabledAdSets) {
        const videos = adset.videoCount || 0;
        const images = adset.imageCount || 0;
        totalEstimatedSeconds += videos * 90;
        totalEstimatedSeconds += images * 10;
        totalEstimatedSeconds += (videos + images) * 5;
      }
      totalEstimatedSeconds += enabledAdSets.length * 10;
      totalEstimatedSeconds = Math.ceil(totalEstimatedSeconds * 1.2);
      setEstimatedTimeRemaining(totalEstimatedSeconds);
      setInitialEstimatedTime(totalEstimatedSeconds); // Save initial for progress calculation
      queueWaitStartedAtRef.current = null;
      queueKickAttemptedRef.current = false;
      
      // Start polling immediately so we can get logs from the server
      // Polling is more reliable than SSE for logs - server saves logs to DB on each update
      setIsPolling(true);
    },
    onSuccess: () => {
      // Polling is already started in onMutate
    },
    onError: (error: Error) => {
      setIsPolling(false);
      setLaunchStatus("error");
      setLaunchProgress(0);
      queueWaitStartedAtRef.current = null;
      queueKickAttemptedRef.current = false;
      const parts = error.message.split("\n\n");
      const mainError = parts[0];
      const details = parts.length > 1 ? parts.slice(1).join("\n\n") : undefined;
      const isFreeLimitReached = mainError.includes("FREE_LIMIT_REACHED");
      const normalizedMainError = mainError.replace(/^FREE_LIMIT_REACHED:\s*/, "");
      const isInstagramRequired = /instagram_required/i.test(normalizedMainError);
      const isAdAccountRequired = /ad_account_required/i.test(normalizedMainError);
      const cleanedMainError = normalizedMainError
        .replace(/^instagram_required:\s*/i, "")
        .replace(/^ad_account_required:\s*/i, "")
        .trim();
      const displayError = cleanedMainError || normalizedMainError;
      const errorLines = details ? details.split("\n") : [displayError];
      setLaunchLogs(prev => [
        ...prev,
        { type: "error" as const, message: `Upload stopped: ${displayError}`, timestamp: new Date().toISOString() },
        ...errorLines.map(line => ({ type: "error" as const, message: line, timestamp: new Date().toISOString() })),
      ]);
      if (isFreeLimitReached) {
        toast({
          title: "Free limit reached",
          description: "Free plan allows 3 launches per UTC month. Upgrade to continue.",
          variant: "destructive",
          duration: 15000,
          action: (
            <ToastAction
              altText="Upgrade"
              onClick={(event) => {
                event.preventDefault();
                window.location.href = "/settings";
              }}
            >
              Upgrade
            </ToastAction>
          ),
        });
        return;
      }

      if (isInstagramRequired) {
        toast({
          title: "Instagram account required",
          description: details || displayError,
          variant: "destructive",
          duration: 15000,
        });
        return;
      }

      if (isAdAccountRequired) {
        toast({
          title: "Ad account required",
          description: details || displayError,
          variant: "destructive",
          duration: 15000,
        });
        return;
      }

      toast({
        title: "Launch failed — upload stopped",
        description: details || displayError,
        variant: "destructive",
        duration: 15000,
      });
    },
  });

  const retryAdSetMutation = useMutation({
    mutationFn: async (adsetId: string) => {
      if (!jobId) throw new Error("No job ID");
      setAdSetStatuses((prev) => ({ ...prev, [adsetId]: "processing" }));
      const res = await apiRequest("POST", `/api/bulk-ads/retry/${jobId}/${adsetId}`);
      return res.json();
    },
    onSuccess: () => {
      // Re-enable polling to track retry progress from server
      setIsPolling(true);
      setLaunchStatus("launching");
      toast({ title: "Retry started" });
    },
    onError: (error: Error, adsetId) => {
      setAdSetStatuses((prev) => ({ ...prev, [adsetId]: "failed" }));
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const cancelUploadMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) throw new Error("No job ID");
      await apiRequest("POST", `/api/bulk-ads/cancel/${jobId}`);
    },
    onSuccess: () => {
      setShowCancelConfirm(false);
      setIsPolling(false);
      setLaunchStatus("error");
      setLaunchLogs(prev => [
        ...prev,
        { type: "error" as const, message: "Upload cancelled by user", timestamp: new Date().toISOString() },
      ]);
      toast({ title: "Upload cancelled", description: "The upload has been stopped. Ad sets already created remain on Meta.", variant: "destructive" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    },
  });

  // Mutation to save imported settings to ad account settings
  const saveImportedSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!importedAdSet) throw new Error("No ad set selected for import");
      const targeting = importedAdSet.targeting;
      
      const settingsUpdate: Record<string, unknown> = {};
      
      // Ad Set settings
      if (targeting?.geo_locations?.countries) {
        settingsUpdate.geoTargeting = targeting.geo_locations.countries;
      }
      if (targeting?.age_min) {
        settingsUpdate.ageMin = targeting.age_min;
      }
      if (targeting?.age_max) {
        settingsUpdate.ageMax = targeting.age_max;
      }
      if (targeting?.genders) {
        settingsUpdate.gender = targeting.genders.includes(1) && targeting.genders.includes(2) 
          ? "ALL" 
          : targeting.genders.includes(1) 
            ? "MALE" 
            : "FEMALE";
      }
      if (importedAdSet.daily_budget) {
        settingsUpdate.budgetAmount = parseInt(importedAdSet.daily_budget) / 100;
        settingsUpdate.budgetType = "DAILY";
      } else if (importedAdSet.lifetime_budget) {
        settingsUpdate.budgetAmount = parseInt(importedAdSet.lifetime_budget) / 100;
        settingsUpdate.budgetType = "LIFETIME";
      }
      
      // Ad Creative settings from promoted_object
      const promotedObj = importedAdSet.promoted_object;
      if (promotedObj?.pixel_id) {
        settingsUpdate.pixelId = promotedObj.pixel_id;
      }
      
      // DSA fields for beneficiary and payer
      if (importedAdSet.dsa_beneficiary) {
        settingsUpdate.beneficiaryName = importedAdSet.dsa_beneficiary;
      }
      if (importedAdSet.dsa_payor) {
        settingsUpdate.payerName = importedAdSet.dsa_payor;
      }
      
      // Ad Creative settings from the first ad in this ad set
      if (importedDisplayLink) {
        settingsUpdate.displayLink = importedDisplayLink;
      }
      if (importedWebsiteUrl) {
        settingsUpdate.websiteUrl = importedWebsiteUrl;
        settingsUpdate.defaultUrl = importedDisplayLink || importedWebsiteUrl;
      }
      if (importedCta) {
        settingsUpdate.defaultCta = importedCta;
      }
      
      const res = await apiRequest("PATCH", "/api/ad-account-settings", settingsUpdate);
      return res.json();
    },
    onSuccess: (_, __, ___) => {
      const targeting = importedAdSet?.targeting;
      setDefaultSettings(prev => ({
        ...prev,
        geoTargeting: targeting?.geo_locations?.countries || prev.geoTargeting,
        ageMin: targeting?.age_min || prev.ageMin,
        ageMax: targeting?.age_max || prev.ageMax,
        gender: targeting?.genders 
          ? (targeting.genders.includes(1) && targeting.genders.includes(2) ? "ALL" : targeting.genders.includes(1) ? "MALE" : "FEMALE")
          : prev.gender,
        budgetAmount: importedAdSet?.daily_budget 
          ? parseInt(importedAdSet.daily_budget) / 100 
          : importedAdSet?.lifetime_budget 
            ? parseInt(importedAdSet.lifetime_budget) / 100 
            : prev.budgetAmount,
        budgetType: importedAdSet?.daily_budget ? "DAILY" : importedAdSet?.lifetime_budget ? "LIFETIME" : prev.budgetType,
        pixelId: importedAdSet?.promoted_object?.pixel_id || prev.pixelId,
        beneficiaryName: importedAdSet?.dsa_beneficiary || prev.beneficiaryName,
        payerName: importedAdSet?.dsa_payor || prev.payerName,
        defaultCta: importedCta || prev.defaultCta,
        websiteUrl: importedWebsiteUrl || prev.websiteUrl,
        defaultUrl: importedDisplayLink || importedWebsiteUrl || prev.defaultUrl,
        displayLink: importedDisplayLink || prev.displayLink,
      }));
      
      queryClient.invalidateQueries({ queryKey: ["/api/ad-account-settings"] });
      setImportCampaignId("");
      setImportAdSetId("");
      toast({ title: "Settings saved", description: "Imported settings have been saved and displayed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    },
  });

  const validAdSets = adSets.filter((a) => a.status !== "invalid");
  const enabledAdSets = validAdSets.filter((a) => !disabledAdSetIds.has(a.id));
  const invalidAdSets = adSets.filter((a) => a.status === "invalid");
  const canProceedToStep3 = enabledAdSets.length > 0;

  // Reset current ad set index when valid ad sets change
  useEffect(() => {
    if (currentAdSetIndex >= validAdSets.length && validAdSets.length > 0) {
      setCurrentAdSetIndex(0);
    }
  }, [validAdSets.length, currentAdSetIndex]);

  // Apply user settings as defaults when loaded
  useEffect(() => {
    if (userSettings) {
      setDefaultSettings((prev) => {
        const updated = { ...prev };
        const cs = userSettings.campaignSettings || {};
        const as = userSettings.adSetSettings || {};
        const ads = userSettings.adSettings || {};
        
        // Apply campaign settings
        if (cs.budgetAmount) {
          updated.dailyBudget = cs.budgetAmount;
        }
        
        // Apply ad set settings
        // Note: as.placements is an object { facebook, instagram, etc } but DefaultSettings expects "AUTO" | "MANUAL"
        // So we check useAdvantagePlacements to determine the mode
        if (as.useAdvantagePlacements !== undefined) {
          updated.placements = as.useAdvantagePlacements ? "AUTO" : "MANUAL";
        }
        if (as.geoTargeting && as.geoTargeting.length > 0) {
          updated.geoTargeting = as.geoTargeting;
        }
        if (as.ageMin) {
          updated.ageMin = as.ageMin;
        }
        if (as.ageMax) {
          updated.ageMax = as.ageMax;
        }
        if (as.gender) {
          updated.gender = as.gender as "ALL" | "MALE" | "FEMALE";
        }
        if (as.dailyMinSpendTarget !== undefined) {
          updated.dailyMinSpendTarget = as.dailyMinSpendTarget;
        }
        if (as.dailySpendCap !== undefined) {
          updated.dailySpendCap = as.dailySpendCap;
        }
        if (as.lifetimeSpendCap !== undefined) {
          updated.lifetimeSpendCap = as.lifetimeSpendCap;
        }
        
        return updated;
      });
      
      // Apply ad settings (CTA, URL, UTM)
      const ads = userSettings.adSettings || {};
      if (ads.defaultCta && !editingCopy.cta) {
        setEditingCopy((prev) => ({ ...prev, cta: ads.defaultCta! }));
      }
      if (ads.defaultUrl && !editingCopy.url) {
        setEditingCopy((prev) => ({ ...prev, url: ads.defaultUrl! }));
      }
      if (ads.defaultUtm && !editingCopy.utm) {
        setEditingCopy((prev) => ({ ...prev, utm: ads.defaultUtm! }));
      }
    }
  }, [userSettings]);

  // Countdown timer effect - also updates progress bar based on elapsed time
  // Continues counting into negative when over time
  useEffect(() => {
    if (launchStatus === "launching" && estimatedTimeRemaining !== null) {
      const interval = setInterval(() => {
        setEstimatedTimeRemaining(prev => {
          if (prev === null) return null;
          const newRemaining = prev - 1;
          
          // Calculate progress based on elapsed time vs initial estimate
          // Cap at 95% - only show 100% when job is actually complete
          if (initialEstimatedTime && initialEstimatedTime > 0) {
            const elapsed = initialEstimatedTime - newRemaining;
            const timeBasedProgress = Math.min((elapsed / initialEstimatedTime) * 100, 95);
            setLaunchProgress(timeBasedProgress);
          }
          
          return newRemaining; // Can go negative
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [launchStatus, estimatedTimeRemaining, initialEstimatedTime]);

  // Auto-scroll activity log to bottom when new logs arrive
  useEffect(() => {
    if (activityLogRef.current && launchLogs.length > 0) {
      activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight;
    }
  }, [launchLogs]);

  // Effect to track job status during polling
  useEffect(() => {
    if (isPolling && jobDetails) {
      const queueStatus = jobDetails.queueStatus || jobDetails.progressStatus || null;
      const isWaitingInQueue = queueStatus === "queued" && (jobDetails.completedAdSets ?? 0) === 0;

      if (isWaitingInQueue) {
        if (!queueWaitStartedAtRef.current) {
          queueWaitStartedAtRef.current = Date.now();
        }

        const waitedMs = Date.now() - queueWaitStartedAtRef.current;
        if (waitedMs >= QUEUE_STUCK_WARNING_MS && !queueKickAttemptedRef.current) {
          queueKickAttemptedRef.current = true;

          const waitedSeconds = Math.floor(waitedMs / 1000);
          const warningMessage = `Upload is still queued after ${waitedSeconds}s. Waiting for secured server-side worker trigger...`;
          setLaunchLogs((prev) => [
            ...prev,
            {
              type: "warning",
              message: warningMessage,
              timestamp: new Date().toISOString(),
            },
          ]);
          toast({
            title: "Upload still queued",
            description: "Worker did not start yet. Waiting for secured server-side trigger.",
            variant: "destructive",
          });

          setLaunchLogs((prev) => [
            ...prev,
            {
              type: "info",
              message: "Manual worker trigger is disabled in secured mode. Waiting for server-side worker trigger.",
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      } else {
        queueWaitStartedAtRef.current = null;
      }

      // Always sync logs from jobDetails - they are the source of truth
      // Server saves logs to DB on each update, so we always get fresh data
      if (jobDetails.logs && jobDetails.logs.length > 0) {
        // Convert string logs to object format for display
        const formattedLogs = jobDetails.logs.map((msg: string) => ({
          message: msg,
          type: msg.toLowerCase().includes("error") ? "error" : 
                msg.toLowerCase().includes("warning") ? "warning" :
                msg.toLowerCase().includes("created") || msg.toLowerCase().includes("uploaded") ? "success" : "info"
        }));
        // Always update from server - server logs are the source of truth
        setLaunchLogs(formattedLogs);
      }
      
      // Progress bar is now based on elapsed time (see countdown timer effect)
      // Only update from server when we have specific completion data
      
      // Update per-ad-set statuses from job progress
      if ((jobDetails as any).adSetProgress) {
        const progress = (jobDetails as any).adSetProgress as Record<string, string>;
        setAdSetStatuses((prev) => {
          const updated = { ...prev };
          for (const [id, status] of Object.entries(progress)) {
            if (status === "completed" || status === "failed" || status === "processing" || status === "pending") {
              updated[id] = status;
            }
          }
          return updated;
        });
      }
      
      if (jobDetails.status === "done" || jobDetails.status === "completed" || jobDetails.status === "error" || jobDetails.status === "failed") {
        setIsPolling(false);
        queueWaitStartedAtRef.current = null;
        queueKickAttemptedRef.current = false;
        const isSuccess = jobDetails.status === "done" || jobDetails.status === "completed";
        setLaunchStatus(isSuccess ? "complete" : "idle");
        setEstimatedTimeRemaining(null); // Clear countdown when done
        setInitialEstimatedTime(null); // Clear initial estimate
        setLaunchProgress(isSuccess ? 100 : 0);
        
        // Extract results from metaObjects
        const metaObjects = (jobDetails as any).metaObjects || [];
        const campaignObj = metaObjects.find((obj: any) => obj.objectType === "campaign");
        const adSetObjs = metaObjects.filter((obj: any) => obj.objectType === "adset");
        const creativeObjs = metaObjects.filter((obj: any) => obj.objectType === "creative");
        const adObjs = metaObjects.filter((obj: any) => obj.objectType === "ad");
        
        setLaunchResults({
          campaign: campaignObj ? { id: campaignObj.metaId, name: campaignObj.name || "Campaign" } : undefined,
          adSets: adSetObjs.map((obj: any) => ({ 
            id: obj.metaId, 
            name: obj.name || "Ad Set", 
            status: obj.status || "created" 
          })),
          creatives: creativeObjs.map((obj: any) => ({ 
            id: obj.metaId, 
            name: obj.name || "Creative",
            type: obj.name?.includes("video") ? "video" : "image"
          })),
          ads: adObjs.map((obj: any) => ({ 
            id: obj.metaId, 
            name: obj.name || "Ad",
            adSetName: adSetObjs.find((as: any) => obj.name?.includes(as.name))?.name || ""
          })),
          logs: launchLogs.map(l => l.message),
        });
        
        if (isSuccess) {
          toast({ title: "Ads created successfully!" });
          setCurrentStep(5); // Go to results step
        } else {
          toast({ 
            title: "Launch failed", 
            description: (jobDetails as any).errorMessage || "An error occurred during ad creation",
            variant: "destructive" 
          });
        }
      }
    }
  }, [isPolling, jobDetails, toast, validAdSets.length]);



  // Load draft from localStorage on mount (only if same connection & ad account & page)
  useEffect(() => {
    // Wait until we know the current ad account, page, and connection
    if (!selectedAdAccountId || !connectionUpdatedAt) return;
    // Don't restore draft if a sync is in progress or just completed
    if (activeSyncStore.syncStep > 0) return;
    
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const draft: WizardDraft = JSON.parse(saved);
        // Check version, age, matching ad account/page, and same connection
        const currentPageId = globalSettings?.facebookPageId || "";
        const sameAdAccount = draft.adAccountId === selectedAdAccountId;
        const samePage = draft.facebookPageId === currentPageId;
        const sameConnection = draft.connectionUpdatedAt === connectionUpdatedAt;
        
        if (draft.version === DRAFT_VERSION && 
            Date.now() - draft.timestamp < 24 * 60 * 60 * 1000 &&
            sameAdAccount && samePage && sameConnection) {
          // Step 1 is always a fresh start; only restore active sessions from step 2+
          const shouldRestoreDraft =
            draft.currentStep >= 2 &&
            (draft.currentStep < 4 || (draft.currentStep === 4 && launchStatus === "idle"));

          if (shouldRestoreDraft) {
            setFolderUrl(draft.folderUrl || "");
            setFolderName(draft.folderName || "");
            setJobId(draft.jobId);
            setSelectedCampaignId(draft.selectedCampaignId || "");
            setAdSetOverrides(draft.adSetOverrides || {});
            setLaunchMode(draft.launchMode || "now");
            setScheduledDate(draft.scheduledDate || "");
            setScheduledTime(draft.scheduledTime || "09:00");
            // Multi Single mode is deprecated; always use Dynamic format.
            setAdUploadMode("dynamic");
            // Only restore step if not launching/complete
            if (draft.currentStep <= 4) {
              setCurrentStep(draft.currentStep);
            }
            // Re-fetch adSets from backend if we have a jobId and were past step 1
            if (draft.jobId && draft.currentStep >= 2) {
              fetch(`/api/drive/adsets?jobId=${draft.jobId}`)
                .then(r => r.ok ? r.json() : Promise.reject())
                .then((data: AdSetInfo[]) => {
                  setAdSets(data.map(a => ({
                    ...a,
                    folderName: a.folderName || a.name,
                    parsedCopy: a.parsedCopy || null,
                    geoSplitMarket: a.geoSplitMarket || (a.overrideSettings as any)?.geoSplitMarket || undefined,
                    geoTargeting: a.geoTargeting || (a.overrideSettings as any)?.geoTargeting || undefined,
                  })));
                })
                .catch(() => {
                  // If adSets can't be loaded, force a full fresh session
                  resetSession();
                });
            }
          } else {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        } else if (!sameAdAccount || !samePage || !sameConnection) {
          // Different context or reconnected - clear old draft
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to load draft:", e);
    }
  }, [selectedAdAccountId, globalSettings?.facebookPageId, connectionUpdatedAt]);

  // Save draft to localStorage when key state changes
  useEffect(() => {
    // Step 1 is always fresh; don't persist draft here
    if (currentStep < 2) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }

    // Don't save if we're launching or complete, or if no ad account selected, or no connection info
    if (launchStatus !== "idle" || !selectedAdAccountId || !connectionUpdatedAt) return;
    
    const draft: WizardDraft = {
      version: DRAFT_VERSION,
      currentStep,
      folderUrl,
      folderName,
      jobId,
      selectedCampaignId,
      adSetOverrides,
      launchMode,
      scheduledDate,
      scheduledTime,
      adUploadMode,
      timestamp: Date.now(),
      adAccountId: selectedAdAccountId,
      facebookPageId: globalSettings?.facebookPageId || "",
      connectionUpdatedAt: connectionUpdatedAt,
    };
    
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      console.error("Failed to save draft:", e);
    }
  }, [currentStep, folderUrl, folderName, jobId, selectedCampaignId, adSetOverrides, launchMode, scheduledDate, scheduledTime, adUploadMode, launchStatus, selectedAdAccountId, globalSettings?.facebookPageId, connectionUpdatedAt]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  // Clear draft on successful launch
  useEffect(() => {
    if (launchStatus === "complete") {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [launchStatus]);

  function resetSession() {
    setCurrentStep(1);
    setJobId(null);
    setFolderUrl("");
    setFolderName("");
    setAdSets([]);
    setExpandedAdSets([]);
    setSyncResultsData(null);
    setSelectedCampaignId("");
    setCampaignName("");
    setAdSetOverrides({});
    setAdSetCopyOverrides({});
    setDisabledAdSetIds(new Set());
    setDryRunPreview(null);
    setLaunchMode("now");
    setScheduledDate("");
    setScheduledTime("09:00");
    setAdUploadMode("dynamic");
    setLaunchStatus("idle");
    setLaunchLogs([]);
    setLaunchProgress(0);
    setAdSetStatuses({});
    setLaunchResults({ ...EMPTY_LAUNCH_RESULTS });
    setIsPolling(false);
    setSyncElapsedTime(0);
    setEstimatedTimeRemaining(null);
    setInitialEstimatedTime(null);
    setLaunchStartTime(null);
    setShowCopyEditor(false);
    setShowCopyEditModal(false);
    setShowCreateCampaignModal(false);
    setShowTargetingEditDialog(false);
    setShowCreativeEditDialog(false);
    setPasteText("");
    setEditingAdSetId(null);
    setCurrentAdSetIndex(0);
    setShowInfoModal(false);
    setImportCampaignId("");
    setImportAdSetId("");
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    enhancementsLoadedRef.current = null;

    activeSyncStore.startTime = 0;
    activeSyncStore.driveUrl = "";
    activeSyncStore.campaignId = "";
    activeSyncStore.mode = "public";
    activeSyncStore.syncStep = 0;
    activeSyncStore.result = null;
    activeSyncStore.promise = null;
    activeSyncStore.error = null;
    activeSyncStore.resultApplied = false;
    notifySyncListeners();
    resetLaunchStore();
  }

  // Navigate to a specific step with validation
  const navigateToStep = (targetStep: number) => {
    // Can't navigate during launch
    if (launchStatus !== "idle" && launchStatus !== "complete") {
      return;
    }
    
    // Can't navigate to launch (4) or results (5) directly
    if (targetStep >= 4) {
      return;
    }
    
    // Going to step 1 resets the session for a fresh import
    if (targetStep === 1) {
      resetSession();
      return;
    }
    
    // Can't go back from results (step 5)
    if (currentStep === 5) {
      return;
    }
    
    // Validation when moving forward
    if (targetStep > currentStep) {
      // Step 1 -> 2: Need imported job
      if (currentStep === 1 && targetStep >= 2) {
        if (!jobId || adSets.length === 0) {
          toast({ title: "Import folder first", variant: "destructive" });
          return;
        }
      }
      // Step 2 -> 3: Need valid ad sets
      if (currentStep === 2 && targetStep >= 3) {
        if (validAdSets.length === 0) {
          toast({ title: "No valid ad sets", variant: "destructive" });
          return;
        }
      }
    }
    
    setCurrentStep(targetStep);
  };

  const handleImport = () => {
    if (!folderUrl.trim()) {
      toast({ title: "Enter a folder URL", variant: "destructive" });
      return;
    }
    importMutation.mutate(folderUrl.trim());
  };

  const toggleAdSetExpanded = (id: string) => {
    setExpandedAdSets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleDefaults = (adsetId: string, useDefaults: boolean) => {
    updateAdSetMutation.mutate({ adsetId, updates: { useDefaults } });
  };

  const handleSaveDefaults = () => {
    updateDefaultsMutation.mutate(defaultSettings);
  };

  const handleDCTSync = () => {
    if (!selectedCampaignId || selectedCampaignId === "__create_new__") {
      toast({ title: "Select campaign first", description: "Choose a campaign before syncing a folder", variant: "destructive" });
      return;
    }
    if (!folderUrl.trim()) {
      toast({ title: "Enter folder URL", variant: "destructive" });
      return;
    }
    if (driveMode === "private" && !driveConnectedEmail) {
      toast({ title: "Google Drive not configured", description: "Service account not set up", variant: "destructive" });
      return;
    }
    startGlobalSync({ campaignId: selectedCampaignId, driveUrl: folderUrl.trim(), mode: driveMode });
  };

  const isSyncInProgress = syncStep > 0 && syncStep < 5;

  const renderStep1 = () => (
    <div className="space-y-4">
      {/* Campaign Selection - separate glass-panel */}
      <div className="glass-panel rounded-2xl p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[#1877F2] text-lg">ads_click</span>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Select Campaign</h2>
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground mb-4">Select existing campaign or create new</p>
        <div className="space-y-4">
          <Select
            value={selectedCampaignId}
            onValueChange={(value) => {
              setSelectedCampaignId(value);
              const campaign = metaCampaigns.find((c) => c.id === value);
              if (campaign) {
                setCampaignName(campaign.name);
                setDefaultSettings((prev) => ({
                  ...prev,
                  campaignId: value,
                  campaignName: campaign.name,
                  createNewCampaign: false,
                }));
              }
            }}
          >
            <SelectTrigger 
              data-testid="select-campaign-step1" 
              className="w-full h-auto min-h-[38px] bg-white/40 dark:bg-black/20 backdrop-blur-md border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 shadow-sm hover:border-[#1877F2]/50 transition-all [&>span]:line-clamp-none [&>span]:overflow-visible"
            >
              <SelectValue placeholder={campaignsLoading ? "Loading campaigns..." : "Select campaign"} />
            </SelectTrigger>
            <SelectContent>
              {sortedMetaCampaigns.map((campaign) => {
                const isCBO = !!(campaign.daily_budget || campaign.lifetime_budget);
                const isActive = isCampaignActive(campaign);
                return (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    <span className="flex items-center gap-1.5 text-[13px]">
                      {campaign.name}
                      <span className={`text-[10px] px-1.5 py-px rounded border ${isCBO ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800" : "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300 border-gray-200 dark:border-gray-800"}`}>
                        {isCBO ? "CBO" : "ABO"}
                      </span>
                      <span className={`text-[10px] px-1.5 py-px rounded border ${isActive ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800" : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-200 dark:border-orange-800"}`}>
                        {isActive ? "ACTIVE" : "PAUSED"}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {!selectedCampaignId && (
            <div className="rounded-xl border border-[#1877F2]/30 dark:border-[#1877F2]/50 p-3 bg-[#1877F2]/10 dark:bg-[#1877F2]/20 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1877F2] text-lg">warning</span>
              <span className="text-sm text-[#1556b6] dark:text-blue-200">
                Select a campaign to continue
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Import Ad Folder - main glass-panel */}
      <div className="glass-panel rounded-2xl p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-[#1877F2] text-lg">folder_open</span>
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Import Ad Folder</h2>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            data-testid="button-help"
            onClick={() => setShowInfoModal(true)}
          >
            <span className="material-symbols-outlined text-[14px]">help_outline</span>
            How it works
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Connect your assets to start the launch</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            disabled={isSyncInProgress}
            className={`text-left glass-card p-3 rounded-xl transition-all ${driveMode === "private" ? "ring-2 ring-[#1877F2]" : "border-transparent hover:border-slate-200 dark:hover:border-slate-700"} ${isSyncInProgress ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => setDriveMode("private")}
            data-testid="radio-drive-private"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 shrink-0">
                <span className="material-symbols-outlined text-lg">lock</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Private Folder</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Share with email</p>
              </div>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${driveMode === "private" ? "bg-[#1877F2]" : "border-2 border-slate-200 dark:border-slate-700"}`}>
                {driveMode === "private" && <span className="material-symbols-outlined text-white text-[13px]">check</span>}
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={isSyncInProgress}
            className={`text-left glass-card p-3 rounded-xl transition-all ${driveMode === "public" ? "ring-2 ring-[#1877F2]" : "border-transparent hover:border-slate-200 dark:hover:border-slate-700"} ${isSyncInProgress ? "opacity-60 cursor-not-allowed" : ""}`}
            onClick={() => setDriveMode("public")}
            data-testid="radio-drive-public"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 shrink-0">
                <span className="material-symbols-outlined text-lg">public</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Public URL</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Shared link</p>
              </div>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${driveMode === "public" ? "bg-[#1877F2]" : "border-2 border-slate-200 dark:border-slate-700"}`}>
                {driveMode === "public" && <span className="material-symbols-outlined text-white text-[13px]">check</span>}
              </div>
            </div>
          </button>
        </div>

        {driveMode === "private" && (
          <div className="mb-3 p-[1px] bg-gradient-to-r from-blue-500/20 via-emerald-500/20 to-transparent rounded-xl">
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md rounded-[11px] p-3 flex items-center gap-3 border border-white/40 dark:border-slate-700/40">
              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                <span className="material-symbols-outlined text-base">mail</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Share your folder with</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {driveEmailLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                      <span className="text-xs text-slate-400">Loading...</span>
                    </div>
                  ) : driveConnectedEmail ? (
                    <>
                      <code className="font-semibold text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded select-all" data-testid="text-service-account-email">{driveConnectedEmail}</code>
                      <button
                        className="text-[#1877F2] hover:text-[#1877F2]/70 transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(driveConnectedEmail);
                          toast({ title: "Email copied!" });
                        }}
                        data-testid="button-copy-email"
                      >
                        <span className="material-symbols-outlined text-sm">content_copy</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">Service account not configured</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Folder URL input */}
        <div className="space-y-2 mb-4">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">Folder URL</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]">link</span>
            <Input
              data-testid="input-folder-url"
              className="pl-9 py-2 h-auto text-sm bg-white/40 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-2 focus-visible:ring-[#1877F2]/20 transition-all"
              placeholder="Paste Google Drive folder URL..."
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
            />
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">
            {driveMode === "private" 
              ? "Share your folder with the email above, then paste the folder URL. Each DCT subfolder becomes an Ad Set."
              : "Paste a public folder URL. Each DCT subfolder becomes an Ad Set."}
          </p>
        </div>

        {/* Sync Progress Bar */}
        {syncStep > 0 && (
          <div className="mb-8" ref={syncProgressRef}>
            <TypewriterProgressBar
              messages={SYNC_STATUS_MESSAGES}
              isComplete={syncStep >= 5}
              completeMessage="Sync complete!"
              estimatedTotal={Math.min(180, 15 + (adSets.length > 0 ? adSets.reduce((sum, a) => sum + (a.videoCount || 0) + (a.imageCount || 0), 0) : 5) * 3)}
              elapsedTime={syncElapsedTime}
            />
          </div>
        )}

        {/* Geo Split toggle */}
        <div className="flex items-center justify-between px-1 mb-6">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-slate-500 dark:text-slate-400">public</span>
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Geo Split</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Split ad sets by market (US, UK, AU...) in filenames</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={geoSplit}
            disabled={isSyncInProgress}
            data-testid="toggle-geo-split"
            onClick={() => setGeoSplit(!geoSplit)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${geoSplit ? 'bg-[#1877F2]' : 'bg-slate-200 dark:bg-slate-700'} ${isSyncInProgress ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${geoSplit ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Sync button */}
        <Button
          className="w-full h-10 rounded-xl bg-[#1877F2] text-white font-bold text-xs shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all mt-auto"
          data-testid="button-sync-drive"
          onClick={handleDCTSync}
          disabled={(syncStep > 0 && syncStep < 5) || !folderUrl.trim() || (driveMode === "private" && !driveConnectedEmail)}
        >
          {(syncStep > 0 && syncStep < 5) ? (
            <>
              <span className="material-symbols-outlined animate-spin mr-2">sync</span>
              Syncing...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined mr-2">sync</span>
              Sync Folder
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const totalCreatives = adSets.reduce((sum, a) => sum + (a.videoCount || 0) + (a.imageCount || 0), 0);
    const validCount = adSets.filter(a => a.status !== "invalid").length;
    const withDocx = adSets.filter(a => a.hasDocx).length;
    
    return (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden space-y-5">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#1877F2] opacity-[0.06] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-emerald-400 opacity-[0.04] rounded-full blur-[80px] pointer-events-none" />
      <div className="mb-4 relative z-10">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="material-symbols-outlined text-muted-foreground">visibility</span>
          Structure Review
        </h3>
        <p className="text-[13px] text-muted-foreground mt-1">Review found folders and texts</p>
      </div>
      <div className="space-y-4 relative z-10">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 border">
          <div className="text-center">
            <div className="text-base font-semibold text-primary">{adSets.length}</div>
            <div className="text-[11px] text-muted-foreground">Ad Sets</div>
          </div>
          <div className="text-center">
            <div className="text-base font-semibold">{totalCreatives}</div>
            <div className="text-[11px] text-muted-foreground">Creatives</div>
          </div>
          <div className="text-center">
            <div className={`text-base font-semibold ${validCount === adSets.length ? "text-green-600" : "text-[#1877F2]"}`}>
              {validCount}/{adSets.length}
            </div>
            <div className="text-[11px] text-muted-foreground">Valid</div>
          </div>
          <div className="text-center">
            <div className={`text-base font-semibold ${withDocx === adSets.length ? "text-green-600" : "text-[#1877F2]"}`}>
              {withDocx}/{adSets.length}
            </div>
            <div className="text-[11px] text-muted-foreground">With text</div>
          </div>
        </div>
        
        {withDocx < adSets.length && adSets.length > 0 && (
          <div className="rounded-xl border border-dashed border-[#1877F2]/35 dark:border-[#1877F2]/55 bg-[#1877F2]/8 dark:bg-[#1877F2]/18 p-4 space-y-3" data-testid="global-docx-upload-card">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#1877F2] dark:text-blue-300" />
              <span className="text-sm font-medium text-[#1556b6] dark:text-blue-200">
                Upload ad copy for missing ad sets
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {adSets.length - withDocx} ad set{adSets.length - withDocx !== 1 ? 's' : ''} missing copy
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer"
                data-testid="input-global-upload-docx"
                disabled={isApplyingGlobalCopy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsApplyingGlobalCopy(true);
                  try {
                    const formData = new FormData();
                    formData.append("docx", file);
                    const parseRes = await fetch("/api/drive/parse-docx", {
                      method: "POST",
                      body: formData,
                      credentials: "include",
                      headers: getCsrfHeaders(),
                    });
                    if (!parseRes.ok) {
                      const err = await parseRes.json();
                      throw new Error(err.error || "Failed to parse DOCX");
                    }
                    const parsed = await parseRes.json();
                    if (parsed.primaryTexts.length === 0 && parsed.headlines.length === 0 && parsed.descriptions.length === 0) {
                      throw new Error("No ad copy found in the uploaded file");
                    }

                    const applyRes = await fetch(`/api/drive/jobs/${jobId}/global-copy`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...getCsrfHeaders() },
                      body: JSON.stringify({
                        primaryTexts: parsed.primaryTexts,
                        headlines: parsed.headlines,
                        descriptions: parsed.descriptions,
                      }),
                      credentials: "include",
                    });
                    if (!applyRes.ok) {
                      const err = await applyRes.json();
                      throw new Error(err.error || "Failed to apply copy");
                    }
                    const result = await applyRes.json();

                    const copyData = {
                      primaryTexts: parsed.primaryTexts,
                      headlines: parsed.headlines,
                      descriptions: parsed.descriptions,
                      dctName: "",
                    };
                    setAdSets(prev => prev.map(a => {
                      if (a.hasDocx) return a;
                      return {
                        ...a,
                        hasDocx: true,
                        docxSource: 'global' as const,
                        status: a.status === 'invalid' && a.validationErrors?.includes('No ad copy found')
                          ? ((a.validationErrors?.filter(e => e !== 'No ad copy found').length || 0) > 0 ? 'invalid' : 'valid')
                          : a.status,
                        validationErrors: a.validationErrors?.filter(e => e !== 'No ad copy found') || [],
                        parsedCopy: copyData,
                      };
                    }));

                    toast({ title: `Applied copy to ${result.updatedCount} ad set${result.updatedCount !== 1 ? 's' : ''} from DOCX` });
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    toast({ title: "Failed to upload copy", description: message, variant: "destructive" });
                  } finally {
                    setIsApplyingGlobalCopy(false);
                    e.target.value = "";
                  }
                }}
              />
              {isApplyingGlobalCopy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying to all ad sets...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Structure Preview */}
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
          Folder Structure
        </div>
        
        <div className="space-y-3">
          {adSets.map((adset, idx) => (
            <div
              key={adset.id}
              data-testid={`adset-card-${adset.id}`}
              className={`rounded-md border p-3 space-y-3 ${
                adset.status === "invalid" ? "border-destructive/50 bg-destructive/5" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {adset.status === "invalid" ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  <div>
                    <p className="font-medium">{adset.name}</p>
                    <p className="text-xs text-muted-foreground">{adset.folderName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {adset.geoSplitMarket && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400">
                      <span className="material-symbols-outlined text-xs">public</span>
                      {adset.geoSplitMarket}
                      {adset.geoTargeting && (
                        <span className="text-[9px] opacity-70">({adset.geoTargeting.join(', ')})</span>
                      )}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="gap-1">
                    <FileVideo className="h-3 w-3" />
                    {(adset.videoCount || 0) + (adset.imageCount || 0)} {((adset.videoCount || 0) + (adset.imageCount || 0)) === 1 ? "creative" : "creatives"}
                  </Badge>
                  {adset.hasDocx ? (
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {adset.docxSource === 'global' ? 'Globalni' : 'Per-DCT'}
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="destructive" className="gap-1">
                        <FileText className="h-3 w-3" />
                        Missing
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        data-testid={`button-add-copy-${adset.id}`}
                        onClick={() => {
                          setEditingAdSetId(adset.id);
                          setEditingAdSetCopy({
                            primaryTexts: [""],
                            headlines: [""],
                            descriptions: [""],
                          });
                          setPasteText("");
                          setShowCopyEditModal(true);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add copy
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {adset.parsedCopy && (adset.parsedCopy.primaryTexts.length > 0 || adset.parsedCopy.headlines.length > 0 || adset.parsedCopy.descriptions.length > 0) && (
                <div className="bg-muted/30 rounded-md p-2.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linked texts</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                      data-testid={`button-edit-copy-${adset.id}`}
                      onClick={() => {
                        setEditingAdSetId(adset.id);
                        setEditingAdSetCopy({
                          primaryTexts: adset.parsedCopy?.primaryTexts || [],
                          headlines: adset.parsedCopy?.headlines || [],
                          descriptions: adset.parsedCopy?.descriptions || [],
                        });
                        setPasteText("");
                        setShowCopyEditModal(true);
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    {adset.parsedCopy.headlines.length > 0 && (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs">Title ({adset.parsedCopy.headlines.length})</Badge>
                        <div className="space-y-1 pl-2 border-l-2 border-muted">
                          {adset.parsedCopy.headlines.map((headline, idx) => (
                            <p key={idx} className="text-muted-foreground text-sm">{idx + 1}. {headline}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {adset.parsedCopy.primaryTexts.length > 0 && (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs">Primary ({adset.parsedCopy.primaryTexts.length})</Badge>
                        <div className="space-y-1 pl-2 border-l-2 border-muted">
                          {adset.parsedCopy.primaryTexts.map((text, idx) => (
                            <p key={idx} className="text-muted-foreground text-sm line-clamp-2">{idx + 1}. {text}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {adset.parsedCopy.descriptions.length > 0 && (
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs">Desc ({adset.parsedCopy.descriptions.length})</Badge>
                        <div className="space-y-1 pl-2 border-l-2 border-muted">
                          {adset.parsedCopy.descriptions.map((desc, idx) => (
                            <p key={idx} className="text-muted-foreground text-sm">{idx + 1}. {desc}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {adset.validationErrors && adset.validationErrors.length > 0 && (
                <div className="space-y-1">
                  {adset.validationErrors.map((err, idx) => (
                    <p key={idx} className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {invalidAdSets.length > 0 && (
          <div className="rounded-md bg-[#1877F2]/10 dark:bg-[#1877F2]/20 border border-[#1877F2]/30 dark:border-[#1877F2]/50 p-3">
            <p className="text-sm text-[#1556b6] dark:text-blue-200">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {invalidAdSets.length} Ad Sets have errors and will be skipped.
            </p>
          </div>
        )}
      </div>
    </div>
  );
  };

  const renderStep3 = () => (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden space-y-5">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#1877F2] opacity-[0.06] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-emerald-400 opacity-[0.04] rounded-full blur-[80px] pointer-events-none" />

      {/* Import Settings from Existing Campaign */}
      <div className="glass-card rounded-xl p-4 relative z-10">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-symbols-outlined text-muted-foreground">download</span>
            Import Settings from Existing Campaign
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            Copy targeting and budget settings from an existing campaign to use here
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Campaign</Label>
              <Select
                value={importCampaignId}
                onValueChange={(val) => {
                  setImportCampaignId(val);
                  setImportAdSetId("");
                }}
              >
                <SelectTrigger data-testid="select-configure-import-campaign">
                  <SelectValue placeholder={campaignsLoading ? "Loading campaigns..." : "Choose a campaign"} />
                </SelectTrigger>
                <SelectContent>
                  {sortedMetaCampaigns.length === 0 ? (
                    <SelectItem value="none" disabled>No campaigns found</SelectItem>
                  ) : (
                    sortedMetaCampaigns.map((campaign) => {
                      const isCBO = !!(campaign.daily_budget || campaign.lifetime_budget);
                      const isActive = isCampaignActive(campaign);
                      return (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          <div className="flex items-center gap-2">
                            <span>{campaign.name}</span>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${isCBO ? "bg-blue-500/20 text-blue-400 border-blue-500/50" : "bg-gray-500/20 text-gray-400 border-gray-500/50"}`}
                            >
                              {isCBO ? "CBO" : "ABO"}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${isActive ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-orange-500/20 text-orange-400 border-orange-500/50"}`}
                            >
                              {isActive ? "ACTIVE" : "PAUSED"}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Select Ad Set</Label>
              <Select
                value={importAdSetId}
                onValueChange={setImportAdSetId}
                disabled={!importCampaignId || isImportAdSetsPending}
              >
                <SelectTrigger data-testid="select-configure-import-adset">
                  <SelectValue placeholder={
                    !importCampaignId 
                      ? "Select a campaign first" 
                      : isImportAdSetsPending 
                        ? "Loading ad sets..." 
                        : "Choose an ad set"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {!importCampaignId ? (
                    <SelectItem value="no-campaign" disabled>Select a campaign first</SelectItem>
                  ) : isImportAdSetsPending ? (
                    <SelectItem value="loading" disabled>
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Loading ad sets...</span>
                      </div>
                    </SelectItem>
                  ) : importAdSetsError ? (
                    <SelectItem value="load-error" disabled>Failed to load ad sets</SelectItem>
                  ) : importAdSets.length === 0 ? (
                    <SelectItem value="none" disabled>No ad sets found</SelectItem>
                  ) : (
                    importAdSets.map((adSet, idx) => (
                      <SelectItem key={adSet.id} value={adSet.id}>
                        <div className="flex items-center gap-2">
                          <span>{adSet.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {adSet.status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {importCampaignId && importAdSets.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-md space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Importing will overwrite current targeting and budget settings below
                </span>
              </div>
              <p className="text-sm">
                <strong>Ad sets found:</strong> {importAdSets.length}
              </p>
            </div>
          )}
          
          <div className="flex justify-end">
            <Button 
              onClick={() => saveImportedSettingsMutation.mutate()}
              disabled={!importCampaignId || !importAdSetId || importAdSets.length === 0 || isImportAdSetsPending}
              data-testid="button-configure-apply-import"
            >
              {isImportAdSetsPending || saveImportedSettingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Apply Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Ad Set Settings Section */}
      <div className="glass-card rounded-2xl p-6 relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-symbols-outlined text-muted-foreground">group</span>
            Targeting
          </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingTargeting({
                  budgetAmount: effectiveSettings.budgetAmount || 20,
                  budgetType: (effectiveSettings.budgetType as "DAILY" | "LIFETIME") || "DAILY",
                  geoTargeting: effectiveSettings.geoTargeting,
                  ageMin: effectiveSettings.ageMin,
                  ageMax: effectiveSettings.ageMax,
                  gender: effectiveSettings.gender as "ALL" | "MALE" | "FEMALE",
                });
                setShowTargetingEditDialog(true);
              }}
              data-testid="button-edit-targeting"
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </div>
          {effectiveSettings.isImported && (
            <p className="text-xs text-[#1877F2]">Imported from: {importedAdSet?.name}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Ad Account</p>
              <p className="text-sm font-medium truncate">{selectedSessionAdAccount?.name || adAccountSettingsData?.adAccountName || selectedAdAccountId || "Not selected"}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Budget</p>
              <p className={`text-sm font-medium ${campaignHasCBO ? "text-muted-foreground" : ""}`}>
                {campaignHasCBO 
                  ? "CBO - not needed" 
                  : `${effectiveSettings.budgetAmount}€/${effectiveSettings.budgetType === "LIFETIME" ? "lifetime" : "day"}`}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Audience</p>
              <p className="text-sm font-medium truncate">
                {adAccountSettingsData?.settings?.audienceName 
                  || (adAccountSettingsData?.settings?.audienceType === "saved" && adAccountSettingsData?.settings?.audienceId 
                    ? "Saved Audience" 
                    : adAccountSettingsData?.settings?.audienceType === "lookalike" && adAccountSettingsData?.settings?.audienceId
                      ? "Lookalike Audience"
                      : "Broad targeting")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Countries</p>
              <p className={`text-sm font-medium ${effectiveSettings.isImported ? "text-[#1877F2]" : ""}`}>
                {effectiveSettings.geoTargeting.length > 0 ? effectiveSettings.geoTargeting.join(", ") : "Not set"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Age</p>
              <p className={`text-sm font-medium ${effectiveSettings.isImported ? "text-[#1877F2]" : ""}`}>
                {effectiveSettings.ageMin} - {effectiveSettings.ageMax}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Gender</p>
              <p className={`text-sm font-medium ${effectiveSettings.isImported ? "text-[#1877F2]" : ""}`}>
                {effectiveSettings.gender === "MALE" ? "Male" : effectiveSettings.gender === "FEMALE" ? "Female" : "All"}
              </p>
            </div>
          </div>
      </div>

      {/* Ad Creative Settings Section */}
      <div className="glass-card rounded-2xl p-6 relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-symbols-outlined text-muted-foreground">movie</span>
            Creative
          </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingCreative({
                  pixelId: effectiveSettings.pixelId || "",
                  defaultCta: importedCta || adAccountSettingsData?.settings?.defaultCta || "LEARN_MORE",
                  websiteUrl: importedWebsiteUrl || adAccountSettingsData?.settings?.websiteUrl || "",
                  defaultUrl: adAccountSettingsData?.settings?.defaultUrl || "",
                  displayLink: importedDisplayLink || adAccountSettingsData?.settings?.displayLink || "",
                  beneficiaryName: effectiveSettings.beneficiaryName || "",
                  payerName: effectiveSettings.payerName || "",
                });
                setShowCreativeEditDialog(true);
              }}
              data-testid="button-edit-creative"
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </div>
          {effectiveSettings.isImported && effectiveSettings.pixelId && (
            <p className="text-xs text-[#1877F2]">Pixel imported from: {importedAdSet?.name}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-full bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                  <SiFacebook className="w-2.5 h-2.5 text-white" />
                </div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Facebook Page</p>
              </div>
              {isPagesFetching ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : (
                <p className={`text-sm font-medium truncate ${selectedPage ? "" : "text-[#1877F2]"}`}>
                  {selectedPage?.name || "Not set"}
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center flex-shrink-0">
                  <SiInstagram className="w-2.5 h-2.5 text-white" />
                </div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Instagram</p>
              </div>
              {isPagesFetching || isInstagramFetching ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : (
                <p className="text-sm font-medium truncate">
                  {selectedInstagram?.username || selectedInstagram?.name || "Not connected"}
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Pixel</p>
              <p className={`text-sm font-medium truncate ${effectiveSettings.pixelId ? (effectiveSettings.isImported && importedPromotedObject?.pixel_id ? "text-[#1877F2]" : "") : "text-[#1877F2]"}`}>
                {effectiveSettings.isImported && importedPromotedObject?.pixel_id 
                  ? effectiveSettings.pixelId 
                  : (adAccountSettingsData?.settings?.pixelName || effectiveSettings.pixelId || "Not set")}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">CTA</p>
              <p className={`text-sm font-medium ${importedCta && effectiveSettings.isImported ? "text-[#1877F2]" : ""}`}>
                {defaultSettings.defaultCta || importedCta || adAccountSettingsData?.settings?.defaultCta || "LEARN_MORE"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Website URL</p>
              <p className={`text-sm font-medium truncate ${!(defaultSettings.websiteUrl || importedWebsiteUrl || adAccountSettingsData?.settings?.websiteUrl) ? "text-[#1877F2]" : (importedWebsiteUrl && effectiveSettings.isImported ? "text-[#1877F2]" : "")}`}>
                {defaultSettings.websiteUrl || importedWebsiteUrl || adAccountSettingsData?.settings?.websiteUrl || "Not set"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Default URL</p>
              <p className={`text-sm font-medium truncate ${(defaultSettings.defaultUrl || adAccountSettingsData?.settings?.defaultUrl) ? "" : "text-muted-foreground"}`}>
                {defaultSettings.defaultUrl || adAccountSettingsData?.settings?.defaultUrl || "Not set"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Display Link</p>
              <p className={`text-sm font-medium truncate ${importedDisplayLink && effectiveSettings.isImported ? "text-[#1877F2]" : ((defaultSettings.displayLink || adAccountSettingsData?.settings?.displayLink) ? "" : "text-muted-foreground")}`}>
                {defaultSettings.displayLink || importedDisplayLink || adAccountSettingsData?.settings?.displayLink || "Not set"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Beneficiary</p>
              <p className={`text-sm font-medium truncate ${effectiveSettings.beneficiaryName ? (effectiveSettings.isImported && importedAdSet?.dsa_beneficiary ? "text-[#1877F2]" : "") : "text-muted-foreground"}`}>
                {effectiveSettings.beneficiaryName || "Not set"}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Payer</p>
              <p className={`text-sm font-medium truncate ${effectiveSettings.payerName ? (effectiveSettings.isImported && importedAdSet?.dsa_payor ? "text-[#1877F2]" : "") : "text-muted-foreground"}`}>
                {effectiveSettings.payerName || "Not set"}
              </p>
            </div>
          </div>
      </div>

      <div className="glass-card rounded-2xl p-6 relative z-10">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-symbols-outlined text-muted-foreground">tune</span>
              Ad Set Configuration
            </h3>
            <span className="text-xs text-muted-foreground">{enabledAdSets.length}/{validAdSets.length} enabled</span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1">Toggle ad sets on/off — disabled ad sets won't be uploaded</p>
        </div>
        <div className="space-y-2">
          {validAdSets.map((adset, idx) => {
            const isDisabled = disabledAdSetIds.has(adset.id);
            return (
              <div
                key={adset.id}
                className={`flex items-center justify-between border rounded-xl px-4 py-3 transition-opacity ${isDisabled ? "opacity-50" : ""}`}
                data-testid={`adset-row-${adset.id}`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="min-w-0">
                    <span className={`font-medium truncate block ${isDisabled ? "line-through text-muted-foreground" : ""}`}>{adset.name}</span>
                    {adset.folderName && adset.folderName !== adset.name && (
                      <span className="text-xs text-muted-foreground truncate block">{adset.folderName}</span>
                    )}
                  </div>
                  {adset.geoSplitMarket && (
                    <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400 flex-shrink-0">
                      <span className="material-symbols-outlined text-xs">public</span>
                      {adset.geoSplitMarket}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {(adset.videoCount || 0) + (adset.imageCount || 0)} creatives
                  </Badge>
                </div>
                <Switch
                  data-testid={`switch-adset-enabled-${adset.id}`}
                  checked={!isDisabled}
                  onCheckedChange={(checked) => {
                    setDisabledAdSetIds((prev) => {
                      const next = new Set(prev);
                      if (checked) {
                        next.delete(adset.id);
                      } else {
                        next.add(adset.id);
                      }
                      return next;
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const currentAdSet = validAdSets[currentAdSetIndex];
  const getAdSetStatusIcon = (status?: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const renderStep4 = () => (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#1877F2] opacity-[0.08] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-20 left-10 w-64 h-64 bg-emerald-400 opacity-[0.05] rounded-full blur-[80px] pointer-events-none" />
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/30 dark:to-slate-800 flex items-center justify-center text-[#1877F2] border border-blue-100 dark:border-blue-800 shadow-[0_4px_12px_rgba(24,119,242,0.1)]">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Review and Publish</h2>
            <p className="text-[13px] text-muted-foreground">Review settings before publishing</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {metaConnected && (
            <div className="px-3 py-1.5 rounded-full bg-emerald-50/80 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center shadow-sm backdrop-blur-sm">
              <span className="material-symbols-outlined text-sm mr-1.5 filled">check_circle</span>
              Connected
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4 relative z-10">
        {launchStatus === "idle" && (
          <div className="space-y-4">
            {(() => {
              const totalVideos = enabledAdSets.reduce((sum, a) => sum + (a.videoCount || 0), 0);
              const totalImages = enabledAdSets.reduce((sum, a) => sum + (a.imageCount || 0), 0);
              const totalAssets = totalVideos + totalImages;
              const totalPrimaryTexts = enabledAdSets.reduce((sum, a) => sum + (a.parsedCopy?.primaryTexts?.length || 1), 0);
              const estimatedAds = adUploadMode === "dynamic" 
                ? totalAssets 
                : totalAssets * Math.max(1, Math.ceil(totalPrimaryTexts / enabledAdSets.length));
              const estimatedSeconds = Math.ceil((totalVideos * 90 + totalImages * 10 + totalAssets * 5 + enabledAdSets.length * 10) * 1.2);
              const estimatedMinutes = estimatedSeconds < 60 ? 0 : Math.floor(estimatedSeconds / 60);
              const estimatedRemainingSeconds = estimatedSeconds % 60;
              
              return (
                <div className="glass-card rounded-xl px-3 py-2.5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/20 dark:bg-white/5 backdrop-blur-sm pointer-events-none" />
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{totalAssets}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">creatives</span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{enabledAdSets.length}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ad sets</span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#1877F2]">~{estimatedAds}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ads</span>
                      </div>
                    </div>
                    <div className="flex items-center text-muted-foreground text-[11px] font-medium gap-1">
                      <span className="material-symbols-outlined text-xs opacity-60">schedule</span>
                      ~{estimatedMinutes > 0 ? `${estimatedMinutes}m ${estimatedRemainingSeconds}s` : `${estimatedRemainingSeconds}s`}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Ad Format Selection - Large Cards */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center px-1">
                <span className="material-symbols-outlined mr-2 text-muted-foreground">style</span>
                Ad Format
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div
                  className="glass-card rounded-xl p-4 text-left transition-all duration-300 h-full active"
                  data-testid="button-format-dynamic"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-5 h-5 rounded-full border flex items-center justify-center shadow-sm border-blue-200 bg-white dark:bg-slate-800">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#1877F2] shadow-[0_0_8px_#1877F2]" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">Dynamic</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 bg-green-100/80 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full uppercase tracking-wide border border-green-200 dark:border-green-800 shadow-sm backdrop-blur-md">Recommended</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mb-2 pl-[30px]">1 ad per asset with all texts combined automatically.</p>
                  <ul className="space-y-1.5 pl-[30px]">
                    <li className="text-[13px] text-muted-foreground flex items-center">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500 mr-1.5">check_circle</span>
                      Meta A/B tests all combinations
                    </li>
                    <li className="text-[13px] text-muted-foreground flex items-center">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500 mr-1.5">check_circle</span>
                      Fewer ads, easier management
                    </li>
                    <li className="text-[13px] text-muted-foreground flex items-center">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500 mr-1.5">check_circle</span>
                      Does not fill ad limit
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/10 to-transparent" />

            {/* Creative Enhancements Section - Images & Videos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-foreground flex items-center">
                  <span className="material-symbols-outlined mr-2 text-muted-foreground">auto_fix_high</span>
                  Advantage+ Creative
                </h3>
                <button
                  className="text-[11px] font-medium text-muted-foreground hover:text-[#1877F2] transition-colors px-3 py-1 rounded-lg hover:bg-white/50 dark:hover:bg-white/10"
                  onClick={() => setCreativeEnhancements({ image: { ...DEFAULT_IMAGE_ENHANCEMENTS }, video: { ...DEFAULT_VIDEO_ENHANCEMENTS } })}
                  data-testid="button-toggle-all-enhancements"
                >
                  Reset Defaults
                </button>
              </div>
              <div className="px-1">
                <p className="text-[11px] text-muted-foreground">
                  Meta may auto-disable unsupported enhancements based on creative type, placements, and account eligibility (for example, Add music on image creatives).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Images Column */}
                <div className="border rounded-xl px-4 py-3 bg-background">
                  <div className="flex items-center gap-2 mb-1 pb-2 border-b border-border">
                    <span className="material-symbols-outlined text-[16px] text-muted-foreground">image</span>
                    <p className="text-sm font-semibold text-foreground">Images</p>
                  </div>
                  <div className="divide-y divide-border">
                    {([
                      { key: "add_overlays" as keyof ImageEnhancements, label: "Add overlays" },
                      { key: "visual_touch_ups" as keyof ImageEnhancements, label: "Visual touch-ups" },
                      { key: "add_music" as keyof ImageEnhancements, label: "Add music" },
                      { key: "text_improvements" as keyof ImageEnhancements, label: "Text improvements" },
                      { key: "show_summaries" as keyof ImageEnhancements, label: "Show summaries" },
                      { key: "relevant_comments" as keyof ImageEnhancements, label: "Relevant comments" },
                      { key: "enhance_cta" as keyof ImageEnhancements, label: "Enhance CTA" },
                      { key: "brightness_and_contrast" as keyof ImageEnhancements, label: "Adjust brightness and contrast" },
                      { key: "reveal_details" as keyof ImageEnhancements, label: "Reveal details over time" },
                      { key: "show_spotlights" as keyof ImageEnhancements, label: "Show spotlights" },
                    ]).map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-2"
                        data-testid={`toggle-image-enhancement-${item.key}`}
                      >
                        <span className="text-[13px] text-foreground">{item.label}</span>
                        <Switch
                          className="scale-[0.8]"
                          checked={creativeEnhancements.image[item.key]}
                          onCheckedChange={() => setCreativeEnhancements(prev => ({ ...prev, image: { ...prev.image, [item.key]: !prev.image[item.key] } }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Videos Column */}
                <div className="border rounded-xl px-4 py-3 bg-background">
                  <div className="flex items-center gap-2 mb-1 pb-2 border-b border-border">
                    <span className="material-symbols-outlined text-[16px] text-muted-foreground">videocam</span>
                    <p className="text-sm font-semibold text-foreground">Videos</p>
                  </div>
                  <div className="divide-y divide-border">
                    {([
                      { key: "visual_touch_ups" as keyof VideoEnhancements, label: "Visual touch-ups" },
                      { key: "text_improvements" as keyof VideoEnhancements, label: "Text improvements" },
                      { key: "add_video_effects" as keyof VideoEnhancements, label: "Add video effects" },
                      { key: "show_summaries" as keyof VideoEnhancements, label: "Show summaries" },
                      { key: "relevant_comments" as keyof VideoEnhancements, label: "Relevant comments" },
                      { key: "enhance_cta" as keyof VideoEnhancements, label: "Enhance CTA" },
                      { key: "reveal_details" as keyof VideoEnhancements, label: "Reveal details over time" },
                      { key: "show_spotlights" as keyof VideoEnhancements, label: "Show spotlights" },
                    ]).map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-2"
                        data-testid={`toggle-video-enhancement-${item.key}`}
                      >
                        <span className="text-[13px] text-foreground">{item.label}</span>
                        <Switch
                          className="scale-[0.8]"
                          checked={creativeEnhancements.video[item.key]}
                          onCheckedChange={() => setCreativeEnhancements(prev => ({ ...prev, video: { ...prev.video, [item.key]: !prev.video[item.key] } }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/10 to-transparent" />

            {/* Schedule Section - Simplified */}
            <div className="glass-card rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center">
                  <span className="material-symbols-outlined mr-2 text-muted-foreground">schedule</span>
                  Schedule
                </h3>
                <div className={`glass-tag px-3 py-1.5 rounded-full text-xs font-semibold ${scheduledDate ? "text-[#1877F2]" : "text-muted-foreground"}`}>
                  {scheduledDate ? `${scheduledDate} ${scheduledTime || "00:00"}` : "Launch Now"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Date (optional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`h-9 w-full justify-start text-left font-normal ${!scheduledDate ? "text-muted-foreground" : ""}`}
                        data-testid="button-schedule-date"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduledDate ? format(new Date(scheduledDate), "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate ? new Date(scheduledDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            setScheduledDate(format(date, "yyyy-MM-dd"));
                            setLaunchMode("scheduled");
                          } else {
                            setScheduledDate("");
                            setLaunchMode("now");
                          }
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                      {scheduledDate && (
                        <div className="p-3 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setScheduledDate("");
                              setLaunchMode("now");
                            }}
                          >
                            Clear date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-time" className="text-sm">Time</Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    data-testid="input-schedule-time"
                    className="h-9 text-base"
                    disabled={!scheduledDate}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty for immediate launch. Set date for scheduled launch.
              </p>
            </div>

            {!selectedPageId && (
              <div className="rounded-md border border-[#1877F2]/30 dark:border-[#1877F2]/50 bg-[#1877F2]/10 dark:bg-[#1877F2]/20 p-3 text-sm text-[#1556b6] dark:text-blue-200">
                Select a Facebook Page in the sidebar to enable launch.
              </div>
            )}
            {!hasUsableAdAccount && (
              <div className="rounded-md border border-red-300/60 bg-red-50/80 p-3 text-sm text-red-900 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200">
                No usable Meta ad account is available for this connection. Reconnect Meta in Connections and grant access to at least one ad account with promotable Pages.
              </div>
            )}
            {hasUsableAdAccount && !hasSelectedUsableAdAccount && (
              <div className="rounded-md border border-amber-400/40 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Select a valid Meta ad account in the sidebar before running Dry Run or Publish.
              </div>
            )}
            {selectedPageId && !isInstagramFetching && !hasLinkedInstagram && (
              <div className="rounded-md border border-amber-400/40 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Instagram account is required for launch. Connect a Professional Instagram account to this Facebook Page in Meta, then refresh the page selection.
              </div>
            )}

            <div className="space-y-2">
              <div className="flex gap-3">
              <Button
                variant="outline"
                data-testid="button-dry-run"
                className="flex-1 h-9 text-sm font-medium transition-all active:scale-[0.98]"
                disabled={!metaConnected || !hasSelectedUsableAdAccount || dryRunMutation.isPending || !jobId}
                onClick={() => dryRunMutation.mutate()}
              >
                {dryRunMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Dry Run
              </Button>
              <Button
                data-testid="button-launch"
                className="flex-1 h-9 text-sm font-medium transition-all active:scale-[0.98]"
                disabled={
                  !metaConnected ||
                  !hasSelectedUsableAdAccount ||
                  launchMutation.isPending ||
                  !jobId ||
                  !selectedPageId ||
                  isInstagramFetching ||
                  !hasLinkedInstagram
                }
                onClick={() => {
                  setCurrentStep(5);
                  launchMutation.mutate();
                }}
              >
                {launchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                {scheduledDate ? `Schedule ${scheduledDate}` : "Publish Ads"}
              </Button>
              </div>
              <p className="text-[13px] text-muted-foreground">Dry Run simulates the publish without creating ads — use it to check for errors first.</p>
            </div>
            
            {dryRunPreview && dryRunPreview.length > 0 && (
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Dry Run Preview</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDryRunPreview(null)}
                  >
                    Clear
                  </Button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {dryRunPreview.map((ad) => (
                    <div
                      key={`${ad.adsetId}-${ad.index}`}
                      className={`rounded-md border p-3 ${
                        ad.isValid
                          ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
                          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                      }`}
                      data-testid={`preview-ad-${ad.index}`}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm block truncate">
                            {ad.adsetName}: {ad.videoFilename}
                          </span>
                        </div>
                        {ad.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                      </div>
                      {ad.headline && (
                        <p className="text-xs text-muted-foreground truncate">
                          {ad.headline.split("\n---\n").join(" | ")}
                        </p>
                      )}
                      {ad.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {ad.errors.map((err, i) => (
                            <p key={i} className="text-xs text-red-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                              {err}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ description: `${label} ID copied to clipboard` });
    });
  };

  const renderStep5 = () => {
    const isComplete = launchStatus === "complete";
    const isRunning = launchStatus === "launching" || launchStatus === "idle";
    const hasWarnings = launchLogs.some(log => log.type === "error" || log.message.toLowerCase().includes("error"));
    const totalCreated = launchResults.ads.length;

    return (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group transition-all duration-300">
      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            {isRunning ? (
              <div className="w-5 h-5 border-2 border-[#1877F2]/10 border-t-[#1877F2] rounded-full animate-spin" style={{ filter: "drop-shadow(0 0 4px #1877F2)" }} />
            ) : isComplete ? (
              hasWarnings ? (
                <AlertTriangle className="h-5 w-5 text-[#1877F2]" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              )
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <h2 className="text-base font-semibold tracking-tight text-slate-800 dark:text-white">
              {launchStatus === "idle" ? "Preparing..." : launchStatus === "launching" ? "Creating ads..." : isComplete ? (hasWarnings ? "Completed with warnings" : "Ads created successfully") : "Upload failed"}
            </h2>
          </div>
          <p className="text-[13px] text-muted-foreground pl-8">
            {launchStatus === "idle"
              ? "Connecting to Meta API..."
              : launchStatus === "launching" 
              ? "Watch ad creation progress in real time"
              : isComplete
              ? `${totalCreated} ad${totalCreated !== 1 ? "s" : ""} created across ${launchResults.adSets.length} ad set${launchResults.adSets.length !== 1 ? "s" : ""}`
              : "Upload stopped due to validation errors — see details below"}
          </p>

          {/* Progress Section */}
          <div className="space-y-2 bg-white/40 dark:bg-slate-800/40 p-3 rounded-lg border border-white/40 dark:border-white/5 shadow-inner mt-3">
            <div className="flex justify-between items-end">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Overall Progress</span>
              <div className="flex items-center gap-2">
                {launchStatus === "launching" && estimatedTimeRemaining !== null && (
                  <span className={`text-[11px] font-medium ${estimatedTimeRemaining < 0 ? "text-red-500" : "text-slate-400"}`}>
                    {estimatedTimeRemaining >= 0 
                      ? `~${Math.floor(estimatedTimeRemaining / 60)}:${(estimatedTimeRemaining % 60).toString().padStart(2, '0')} remaining`
                      : `+${Math.floor(Math.abs(estimatedTimeRemaining) / 60)}:${(Math.abs(estimatedTimeRemaining) % 60).toString().padStart(2, '0')} over time`
                    }
                  </span>
                )}
                <span className="text-base font-black bg-clip-text text-transparent bg-gradient-to-br from-[#1877F2] to-blue-300">{Math.round(launchProgress)}%</span>
              </div>
            </div>
            <div className="h-2 w-full bg-slate-200/50 dark:bg-slate-700/30 rounded-full overflow-hidden backdrop-blur-sm p-[2px] border border-white/50 dark:border-white/5 shadow-inner">
              <div 
                className="h-full rounded-full relative transition-all duration-500"
                style={{ 
                  width: `${launchProgress}%`,
                  background: estimatedTimeRemaining !== null && estimatedTimeRemaining < 0 
                    ? "linear-gradient(90deg, #eab308 0%, #ef4444 100%)"
                    : "linear-gradient(90deg, #1877F2 0%, #60A5FA 50%, #1877F2 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 2s linear infinite",
                  boxShadow: "0 0 12px rgba(59, 130, 246, 0.5)",
                }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-1 bg-white/50 blur-[1px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Campaign & Ad Sets info cards */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {(campaignName || selectedCampaignId) && (
            <div className="md:col-span-7 glass-card rounded-lg p-3 flex items-center gap-3 min-w-0" data-testid="results-campaign-info">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/5 flex items-center justify-center text-[#1877F2] shadow-inner border border-white/20 shrink-0">
                <Rocket className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Campaign</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{campaignName || selectedCampaignId}</p>
              </div>
              {(launchResults.campaign?.id || selectedCampaignId) && (
                <button
                  onClick={() => copyToClipboard(launchResults.campaign?.id || selectedCampaignId, "Campaign")}
                  className="flex items-center gap-1.5 bg-white/50 dark:bg-slate-900/50 px-2 py-1.5 rounded-md border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md cursor-pointer shrink-0"
                  data-testid="copy-campaign-id-results"
                >
                  <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">{(launchResults.campaign?.id || selectedCampaignId).slice(-8)}</span>
                  <span className="material-symbols-outlined text-xs text-slate-400">content_copy</span>
                </button>
              )}
            </div>
          )}

          {isRunning && enabledAdSets.length > 0 && (
            <div className={`${(campaignName || selectedCampaignId) ? "md:col-span-5" : "md:col-span-12"} glass-card rounded-lg p-3 flex items-center justify-between gap-2`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 flex items-center justify-center text-emerald-500 shadow-inner border border-white/20 shrink-0">
                  <FolderOpen className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Ad Sets</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{enabledAdSets.length} total</p>
                </div>
              </div>
              <span className="inline-block px-2 py-1 rounded-md bg-slate-200/60 dark:bg-slate-700/60 text-[11px] font-semibold backdrop-blur-sm shrink-0">
                {enabledAdSets.reduce((sum, a) => sum + (a.videoCount || 0) + (a.imageCount || 0), 0)} CREATIVES
              </span>
            </div>
          )}
        </div>

        {/* Ad Set progress during running */}
        {isRunning && enabledAdSets.length > 0 && (
          <div className="space-y-2">
            {enabledAdSets.map((adset, idx) => (
              <div
                key={adset.id}
                className={`flex items-center justify-between p-2.5 rounded-lg transition-colors duration-200 glass-card ${
                  adSetStatuses[adset.id] === "completed" ? "border-emerald-200/40 dark:border-emerald-800/30"
                  : adSetStatuses[adset.id] === "failed" ? "border-red-200/40 dark:border-red-800/30"
                  : adSetStatuses[adset.id] === "processing" ? "border-blue-200/40 dark:border-blue-800/30"
                  : ""
                }`}
                data-testid={`progress-adset-${idx}`}
              >
                <div className="flex items-center gap-2">
                  {adSetStatuses[adset.id] === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : adSetStatuses[adset.id] === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : adSetStatuses[adset.id] === "processing" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#1877F2]" />
                  ) : (
                    <Clock className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="text-sm font-medium">{adset.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700/60 text-[10px] font-semibold backdrop-blur-sm">
                    {(adset.videoCount || 0) + (adset.imageCount || 0)} {((adset.videoCount || 0) + (adset.imageCount || 0)) === 1 ? "CREATIVE" : "CREATIVES"}
                  </span>
                  {adSetStatuses[adset.id] !== "completed" && adSetStatuses[adset.id] !== "failed" && (() => {
                    const vids = adset.videoCount || 0;
                    const imgs = adset.imageCount || 0;
                    const secs = Math.ceil(((vids * 90) + (imgs * 10) + ((vids + imgs) * 5) + 10) * 1.2);
                    return (
                      <span className="text-[10px] font-medium text-slate-400">
                        ~{secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Log - Terminal Style */}
        {(isRunning || isComplete || (launchStatus === "error" && launchLogs.length > 0)) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Activity Log</h3>
                {isRunning && (
                  <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-semibold border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                )}
                {launchStatus === "error" && (
                  <span className="flex items-center gap-1.5 bg-red-500/10 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-full text-[10px] font-semibold border border-red-500/20">
                    FAILED
                  </span>
                )}
                {isComplete && (
                  <Badge variant="secondary" className="text-xs">{launchLogs.length}</Badge>
                )}
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300/80 dark:bg-slate-600/80 backdrop-blur-sm" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300/80 dark:bg-slate-600/80 backdrop-blur-sm" />
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300/80 dark:bg-slate-600/80 backdrop-blur-sm" />
              </div>
            </div>
            <div 
              ref={activityLogRef} 
              className="rounded-xl p-3.5 font-mono text-[11px] leading-relaxed overflow-y-auto shadow-2xl relative overflow-hidden"
              style={{
                height: isRunning ? "220px" : "160px",
                background: "rgba(15, 23, 42, 0.85)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 10px 30px -5px rgba(0,0,0,0.2), inset 0 0 20px rgba(0,0,0,0.2)",
              }}
            >
              <div className="absolute inset-0 pointer-events-none z-10 opacity-20" style={{ 
                backgroundImage: "linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.1) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06))",
                backgroundSize: "100% 2px, 3px 100%"
              }} />
              <div className="space-y-1.5 relative z-20">
                {launchLogs.length === 0 ? (
                  <div className="text-slate-400 flex gap-2">
                    <span className="opacity-50 select-none">$</span>
                    <span>{launchStatus === "idle" ? "Connecting to Meta API..." : "Waiting to start..."}<span className="animate-pulse">_</span></span>
                  </div>
                ) : (
                  launchLogs.map((log, idx) => {
                    const isError = log.type === "error";
                    const isSuccess = log.type === "success";
                    const isWarning = log.type === "warning";
                    const isAction = log.message.toLowerCase().includes("uploading") || log.message.toLowerCase().includes("creating") || log.message.toLowerCase().includes("processing");
                    const isLast = idx === launchLogs.length - 1 && isRunning;

                    return (
                      <div 
                        key={idx} 
                        className={`flex gap-2 ${
                          isError ? "text-red-400" :
                          isSuccess ? "text-emerald-400" :
                          isWarning ? "text-blue-400" :
                          isAction ? "text-blue-400" :
                          "text-slate-400"
                        }`}
                      >
                        <span className={`select-none ${isSuccess ? "opacity-80" : isAction ? "animate-pulse" : "opacity-50"}`}>
                          {isSuccess ? "\u2713" : isError ? "\u2717" : isAction ? "\u25CF" : "$"}
                        </span>
                        <span>
                          {log.message}
                          {isLast && isRunning && <span className="animate-pulse">_</span>}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {isRunning && (
              <div className="flex items-center justify-between gap-3 mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your upload will continue in the background even if you close this page.
                </p>
                <button
                  data-testid="button-cancel-upload"
                  className="px-4 h-9 text-sm font-medium rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelUploadMutation.isPending}
                >
                  {cancelUploadMutation.isPending ? "Cancelling..." : "Cancel upload"}
                </button>
                <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                  <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                      <DialogTitle>Cancel upload?</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to stop the upload? Any ad sets already created will remain on Meta.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2 sm:gap-0">
                      <button
                        data-testid="button-cancel-upload-dismiss"
                        className="px-4 h-9 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                        onClick={() => setShowCancelConfirm(false)}
                      >
                        Go back
                      </button>
                      <button
                        data-testid="button-cancel-upload-confirm"
                        className="px-4 h-9 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                        onClick={() => cancelUploadMutation.mutate()}
                        disabled={cancelUploadMutation.isPending}
                      >
                        {cancelUploadMutation.isPending ? "Cancelling..." : "Yes, cancel"}
                      </button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        )}

        {/* Completed results sections */}
        {isComplete && (
          <>
            {launchResults.adSets.length > 0 && (
              <div className="glass-card rounded-xl p-4 relative z-10">
                <div className="mb-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                    Ad Sets
                    <Badge variant="secondary" className="text-xs">{launchResults.adSets.length}</Badge>
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {launchResults.adSets.map((adset, idx) => (
                    <div key={adset.id || idx} className="flex items-center justify-between gap-2 rounded-lg bg-white/30 dark:bg-slate-800/30 p-2.5 border border-white/30 dark:border-white/5 transition-colors duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{adset.name}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(adset.id, "Ad Set")}
                        className="flex items-center gap-1.5 bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md cursor-pointer shrink-0"
                        data-testid={`copy-adset-id-${idx}`}
                      >
                        <span className="text-[10px] font-mono text-slate-500">{adset.id.slice(-8)}</span>
                        <span className="material-symbols-outlined text-xs text-slate-400">content_copy</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {launchResults.creatives.length > 0 && (
              <div className="glass-card rounded-xl p-4 relative z-10">
                <div className="mb-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">image</span>
                    Creatives
                    <Badge variant="secondary" className="text-xs">{launchResults.creatives.length}</Badge>
                  </h3>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {launchResults.creatives.map((creative, idx) => (
                    <div key={creative.id || idx} className="flex items-center justify-between gap-2 rounded-lg bg-white/30 dark:bg-slate-800/30 p-2.5 border border-white/30 dark:border-white/5 transition-colors duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        {creative.type === "video" ? (
                          <FileVideo className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <Image className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                        )}
                        <span className="text-xs truncate">{creative.name}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(creative.id, "Creative")}
                        className="flex items-center gap-1.5 bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md cursor-pointer shrink-0"
                        data-testid={`copy-creative-id-${idx}`}
                      >
                        <span className="text-[10px] font-mono text-slate-500">{creative.id.slice(-8)}</span>
                        <span className="material-symbols-outlined text-xs text-slate-400">content_copy</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {launchResults.ads.length > 0 && (
              <div className="glass-card rounded-xl p-4 relative z-10">
                <div className="mb-2">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">description</span>
                    Ads
                    <Badge variant="secondary" className="text-xs">{launchResults.ads.length}</Badge>
                  </h3>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {launchResults.ads.map((ad, idx) => (
                    <div key={ad.id || idx} className="flex items-center justify-between gap-2 rounded-lg bg-white/30 dark:bg-slate-800/30 p-2.5 border border-white/30 dark:border-white/5 transition-colors duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="text-xs truncate">{ad.name}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(ad.id, "Ad")}
                        className="flex items-center gap-1.5 bg-white/50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-white/40 dark:border-white/10 shadow-sm backdrop-blur-md cursor-pointer shrink-0"
                        data-testid={`copy-ad-id-${idx}`}
                      >
                        <span className="text-[10px] font-mono text-slate-500">{ad.id.slice(-8)}</span>
                        <span className="material-symbols-outlined text-xs text-slate-400">content_copy</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-2">
              <Button
                variant="ghost"
                onClick={() => resetSession()}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                data-testid="button-start-new"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Upload
              </Button>
              <Button
                onClick={() => {
                  const actId = (selectedAdAccountId || defaultSettings.adAccountId || '').replace(/^act_/, '');
                  const campId = launchResults.campaign?.id || selectedCampaignId || defaultSettings.campaignId || '';
                  if (actId && actId !== 'demo') {
                    let url = `https://www.facebook.com/adsmanager/manage/campaigns?act=${actId}`;
                    if (campId) {
                      url += `&selected_campaign_ids=${campId}`;
                    }
                    window.open(url, '_blank');
                  } else {
                    window.open('https://www.facebook.com/adsmanager', '_blank');
                  }
                }}
                data-testid="button-open-meta-manager"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Meta Ads Manager
              </Button>
            </div>
          </>
        )}

        {/* Cancel button while running */}
        {isRunning && (
          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="ghost"
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              disabled
              data-testid="button-view-analytics-disabled"
            >
              View Analytics
            </Button>
          </div>
        )}

        {!isComplete && launchStatus !== "launching" && launchStatus !== "idle" && (
          <div className="flex justify-end gap-3 mt-2">
            <Button
              variant="ghost"
              onClick={() => resetSession()}
              className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              data-testid="button-start-new-error"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Upload
            </Button>
          </div>
        )}
      </div>
    </div>
    );
  };

  const getStep3Errors = (): string[] => {
    const errors: string[] = [];
    if (!hasUsableAdAccount) errors.push("No usable Meta ad account found");
    else if (!hasSelectedUsableAdAccount) errors.push("Select a valid Meta ad account");
    if (!selectedPageId) errors.push("Facebook Page is required");
    const effectiveCta = defaultSettings.defaultCta || importedCta || adAccountSettingsData?.settings?.defaultCta;
    if (!effectiveCta) errors.push("CTA is required");
    const effectiveUrl = defaultSettings.defaultUrl || defaultSettings.websiteUrl || importedWebsiteUrl || adAccountSettingsData?.settings?.defaultUrl || adAccountSettingsData?.settings?.websiteUrl;
    if (!effectiveUrl) errors.push("Website URL or Default URL is required");
    if (!((selectedCampaignId && selectedCampaignId !== "__create_new__") || campaignName.trim().length > 0)) {
      errors.push("Campaign name is required");
    }
    return errors;
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return !!jobId;
      case 2:
        return canProceedToStep3;
      case 3:
        return getStep3Errors().length === 0;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-1 px-2">
      <div className="glass-panel rounded-2xl p-6 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] mb-8">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <WizardStep 
            step={1} 
            currentStep={currentStep} 
            title="Import" 
            onClick={() => navigateToStep(1)}
            disabled={launchStatus !== "idle" || currentStep === 5}
          />
          <div className={`flex-1 h-0.5 mx-4 relative ${currentStep > 1 ? "" : "bg-slate-200 dark:bg-slate-700"}`}>
            {currentStep > 1 && <div className="absolute inset-y-0 left-0 w-full bg-[#1877F2]/20" />}
          </div>
          <WizardStep 
            step={2} 
            currentStep={currentStep} 
            title="Validate" 
            onClick={() => navigateToStep(2)}
            disabled={launchStatus !== "idle" || currentStep === 5}
          />
          <div className={`flex-1 h-0.5 mx-4 relative ${currentStep > 2 ? "" : "bg-slate-200 dark:bg-slate-700"}`}>
            {currentStep > 2 && <div className="absolute inset-y-0 left-0 w-full bg-[#1877F2]/20" />}
          </div>
          <WizardStep 
            step={3} 
            currentStep={currentStep} 
            title="Configure" 
            onClick={() => navigateToStep(3)}
            disabled={launchStatus !== "idle" || currentStep === 5}
          />
          <div className={`flex-1 h-0.5 mx-4 relative ${currentStep > 3 ? "" : "bg-slate-200 dark:bg-slate-700"}`}>
            {currentStep > 3 && <div className="absolute inset-y-0 left-0 w-full bg-[#1877F2]/20" />}
          </div>
          <WizardStep 
            step={4} 
            currentStep={currentStep} 
            title="Launch"
            disabled={true}
          />
          <div className={`flex-1 h-0.5 mx-4 relative ${currentStep > 4 ? "" : "bg-slate-200 dark:bg-slate-700"}`}>
            {currentStep > 4 && <div className="absolute inset-y-0 left-0 w-full bg-[#1877F2]/20" />}
          </div>
          <WizardStep 
            step={5} 
            currentStep={currentStep} 
            title="Results"
            disabled={true}
          />
        </div>
      </div>

      <div className="space-y-4">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}

        {currentStep > 1 && (
          <div className="frosted-panel rounded-2xl p-4 mt-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {currentStep < 5 && launchStatus === "idle" && (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 px-6 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 shadow-sm font-semibold transition-all"
                  data-testid="button-prev-step"
                  onClick={() => navigateToStep(currentStep - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              )}
              <Button
                variant="outline"
                className="h-10 px-4 rounded-xl bg-white/60 hover:bg-white dark:bg-slate-800/60 dark:hover:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 shadow-sm font-medium text-xs transition-all"
                data-testid="button-new-upload"
                onClick={() => resetSession()}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New upload
              </Button>
            </div>
            {currentStep < 4 && launchStatus === "idle" && (
              <div className="flex items-center gap-3">
                {currentStep === 3 && getStep3Errors().length > 0 && (
                  <div className="text-xs text-[#1877F2] dark:text-blue-300 text-right max-w-[300px]" data-testid="text-step3-errors">
                    {getStep3Errors().map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
                <Button
                  size="lg"
                  className="h-10 px-8 rounded-xl bg-[#1877F2] hover:bg-blue-600 text-white font-semibold shadow-[0_15px_30px_-5px_rgba(24,119,242,0.4)] transition-all transform hover:-translate-y-0.5"
                  data-testid="button-next-step"
                  onClick={() => setCurrentStep((s) => Math.min(4, s + 1))}
                  disabled={!canGoNext()}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showCopyEditor} onOpenChange={setShowCopyEditor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Ad Copy</DialogTitle>
            <DialogDescription>
              Fill in the ad copy fields for this ad set. These values will be applied to all ads in the set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="edit-headline">Headline</Label>
              <Input
                id="edit-headline"
                data-testid="input-edit-headline"
                value={editingCopy.headline}
                onChange={(e) => setEditingCopy((prev) => ({ ...prev, headline: e.target.value }))}
                placeholder="Main headline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-primary-text">Primary Text</Label>
              <Input
                id="edit-primary-text"
                data-testid="input-edit-primary-text"
                value={editingCopy.primaryText}
                onChange={(e) => setEditingCopy((prev) => ({ ...prev, primaryText: e.target.value }))}
                placeholder="Main ad copy"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                data-testid="input-edit-description"
                value={editingCopy.description}
                onChange={(e) => setEditingCopy((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cta">Call to Action</Label>
              <Select
                value={editingCopy.cta}
                onValueChange={(value) => setEditingCopy((prev) => ({ ...prev, cta: value }))}
              >
                <SelectTrigger data-testid="select-edit-cta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEARN_MORE">Learn More</SelectItem>
                  <SelectItem value="SHOP_NOW">Shop Now</SelectItem>
                  <SelectItem value="SIGN_UP">Sign Up</SelectItem>
                  <SelectItem value="BOOK_NOW">Book Now</SelectItem>
                  <SelectItem value="CONTACT_US">Contact Us</SelectItem>
                  <SelectItem value="GET_QUOTE">Get Quote</SelectItem>
                  <SelectItem value="DOWNLOAD">Download</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">Destination URL</Label>
              <Input
                id="edit-url"
                data-testid="input-edit-url"
                value={editingCopy.url}
                onChange={(e) => setEditingCopy((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com/landing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-utm">UTM Parameters</Label>
              <Input
                id="edit-utm"
                data-testid="input-edit-utm"
                value={editingCopy.utm}
                onChange={(e) => setEditingCopy((prev) => ({ ...prev, utm: e.target.value }))}
                placeholder="utm_source=facebook&utm_medium=paid"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCopyEditor(false)}
              data-testid="button-cancel-copy"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (currentAdSet) {
                  setAdSetCopyOverrides((prev) => ({
                    ...prev,
                    [currentAdSet.id]: editingCopy,
                  }));
                }
                setShowCopyEditor(false);
              }}
              disabled={!editingCopy.headline.trim() || !editingCopy.primaryText.trim()}
              data-testid="button-save-copy"
            >
              Save Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateCampaignModal} onOpenChange={setShowCreateCampaignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Campaign</DialogTitle>
            <DialogDescription>
              Create a new campaign in your Meta Ads account. The campaign will be created in ACTIVE status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-campaign-name">Campaign Name</Label>
              <Input
                id="new-campaign-name"
                data-testid="input-new-campaign-name"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Enter campaign name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-campaign-objective">Campaign Objective</Label>
              <Select
                value={newCampaignObjective}
                onValueChange={setNewCampaignObjective}
              >
                <SelectTrigger data-testid="select-new-campaign-objective">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTCOME_TRAFFIC">Traffic</SelectItem>
                  <SelectItem value="OUTCOME_SALES">Sales</SelectItem>
                  <SelectItem value="OUTCOME_LEADS">Leads</SelectItem>
                  <SelectItem value="OUTCOME_ENGAGEMENT">Engagement</SelectItem>
                  <SelectItem value="OUTCOME_AWARENESS">Awareness</SelectItem>
                  <SelectItem value="OUTCOME_APP_PROMOTION">App Promotion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Budget Optimization</Label>
              <Select
                value={newCampaignBudgetType}
                onValueChange={(value: "ABO" | "CBO") => setNewCampaignBudgetType(value)}
              >
                <SelectTrigger data-testid="select-budget-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ABO">ABO (Ad Set Budget)</SelectItem>
                  <SelectItem value="CBO">CBO (Campaign Budget)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {newCampaignBudgetType === "CBO" 
                  ? "Budget is set at campaign level and distributed across ad sets" 
                  : "Budget is set individually for each ad set"}
              </p>
            </div>
            {newCampaignBudgetType === "CBO" && (
              <div className="space-y-2">
                <Label htmlFor="new-campaign-budget">Daily Budget (EUR)</Label>
                <Input
                  id="new-campaign-budget"
                  data-testid="input-campaign-budget"
                  type="number"
                  min="1"
                  value={newCampaignBudget}
                  onChange={(e) => setNewCampaignBudget(e.target.value)}
                  placeholder="Enter daily budget"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateCampaignModal(false)}
              data-testid="button-cancel-create-campaign"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                createCampaignMutation.mutate({
                  name: newCampaignName,
                  objective: newCampaignObjective,
                  budgetType: newCampaignBudgetType,
                  dailyBudget: newCampaignBudgetType === "CBO" && newCampaignBudget ? parseFloat(newCampaignBudget) : undefined,
                })
              }
              disabled={!newCampaignName.trim() || (newCampaignBudgetType === "CBO" && !newCampaignBudget) || createCampaignMutation.isPending}
              data-testid="button-confirm-create-campaign"
            >
              {createCampaignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create Campaign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInfoModal} onOpenChange={setShowInfoModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-2xl">
          <div className="px-8 pt-8 pb-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl font-semibold tracking-tight">How it works</DialogTitle>
              <DialogDescription className="text-sm text-slate-400">
                A quick guide to importing and launching your ads
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-8 pb-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#1877F2] text-lg">lock</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Private Folder</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Share your Google Drive folder with the service account email shown in the app, then paste the folder URL and sync.
                </p>
                <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-none">
                  <li className="flex items-start gap-2"><span className="text-[#1877F2] font-semibold shrink-0">1.</span>Copy the service account email</li>
                  <li className="flex items-start gap-2"><span className="text-[#1877F2] font-semibold shrink-0">2.</span>Share your Drive folder with that email</li>
                  <li className="flex items-start gap-2"><span className="text-[#1877F2] font-semibold shrink-0">3.</span>Paste the folder URL & click Sync</li>
                </ol>
              </div>

              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-purple-500 text-lg">public</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Public URL</h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  If your folder is set to "Anyone with the link can view", just paste the URL and sync. No sharing step needed.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-500 text-lg">description</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">DOCX Ad Copy Format</h4>
                    <p className="text-[11px] text-slate-400">Use numbered fields. Separate A/B variants with _1, _2, etc.</p>
                  </div>
                </div>
                <a
                  href="/template_adcopy.docx"
                  download="template_adcopy.docx"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#1877F2] bg-[#1877F2]/5 hover:bg-[#1877F2]/10 transition-all shrink-0"
                  data-testid="link-download-template"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Template
                </a>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4 font-mono text-xs text-slate-600 dark:text-slate-400 leading-relaxed overflow-x-auto">
{`DCT 161:

Primary text_1:
Your first ad copy variation...

Primary text_2:
Your second ad copy variation...

Headline_1:
Your headline

Description_1:
Your description`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#1877F2] text-lg">folder_open</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Folder Structure</h4>
                  <p className="text-[11px] text-slate-400">Each subfolder becomes an Ad Set. One DOCX file for all ad copy.</p>
                </div>
              </div>
              <div className="rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4 font-mono text-xs text-slate-600 dark:text-slate-400 leading-relaxed overflow-x-auto">
                <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold mb-1">
                  <span className="material-symbols-outlined text-sm text-[#1877F2]">folder</span>
                  Campaign Folder/
                </div>
                <div className="ml-5 space-y-0.5">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-blue-400">folder</span>DCT 161 - Spring_Sale_Images/</div>
                  <div className="ml-7 text-slate-400">image1.jpg, image2.png</div>
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-blue-400">folder</span>DCT 162 - Comparison_Images/</div>
                  <div className="ml-7 text-slate-400">image1.jpg</div>
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-blue-400">folder</span>DCT 163 - Video_Ads/</div>
                  <div className="ml-7 text-slate-400">video1.mp4</div>
                  <div className="flex items-center gap-2 text-[#1877F2]"><span className="material-symbols-outlined text-sm">description</span>ad_copy.docx</div>
                </div>
              </div>
              <img src="/help_folder_structure.png" alt="Example folder structure" className="rounded-xl border border-slate-100 dark:border-slate-800 w-full" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-500 text-sm">movie</span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Videos</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[".mp4", ".mov", ".avi", ".mkv"].map(f => (
                    <span key={f} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">{f}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-violet-500 text-sm">image</span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Images</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[".jpg", ".jpeg", ".png", ".gif", ".webp"].map(f => (
                    <span key={f} className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 rounded-b-2xl">
            <Button
              onClick={() => setShowInfoModal(false)}
              className="w-full rounded-xl"
              data-testid="button-close-help"
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCopyEditModal} onOpenChange={(open) => {
        setShowCopyEditModal(open);
        if (!open) { setPasteText(""); }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Ad Copy
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const editingAdSet = adSets.find(a => a.id === editingAdSetId);
                return editingAdSet ? `Editing copy for ${editingAdSet.folderName || editingAdSet.name}` : "Edit the ad copy for this DCT folder";
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Upload className="h-4 w-4" />
                Paste text
              </div>
              <div className="space-y-2">
                <textarea
                  className="w-full min-h-[120px] px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 resize-y font-mono"
                  placeholder={"Primary text: Your ad text here\nHeadline: Your headline\nDescription: Your description\n---\nPrimary text: Second variation\nHeadline: Second headline\nDescription: Second description"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  data-testid="textarea-paste-copy"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs rounded-lg"
                  data-testid="button-parse-pasted-text"
                  disabled={!pasteText.trim()}
                  onClick={() => {
                    const parsed = parsePastedCopyText(pasteText);
                    if (parsed.primaryTexts.length === 0 && parsed.headlines.length === 0 && parsed.descriptions.length === 0) {
                      toast({
                        title: "Could not parse text",
                        description: "Use labels like Primary text_1:, Headline_1:, Description_1: (or separate entries with ---).",
                        variant: "destructive",
                      });
                      return;
                    }
                    setEditingAdSetCopy({
                      primaryTexts: parsed.primaryTexts.length > 0 ? parsed.primaryTexts : [""],
                      headlines: parsed.headlines.length > 0 ? parsed.headlines : [""],
                      descriptions: parsed.descriptions.length > 0 ? parsed.descriptions : [""],
                    });
                    setPasteText("");
                    const variationCount = Math.max(parsed.primaryTexts.length, parsed.headlines.length, parsed.descriptions.length);
                    toast({ title: `Parsed ${variationCount} variations from text` });
                  }}
                >
                  Parse & fill fields
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary Texts ({editingAdSetCopy.primaryTexts.length})</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => setEditingAdSetCopy(prev => ({ ...prev, primaryTexts: [...prev.primaryTexts, ""] }))}
                  data-testid="button-add-primary-text"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add variation
                </Button>
              </div>
              <div className="space-y-3">
                {editingAdSetCopy.primaryTexts.map((text, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Primary text {idx + 1}</span>
                      {editingAdSetCopy.primaryTexts.length > 1 && (
                        <button
                          type="button"
                          className="text-slate-400 hover:text-destructive transition-colors"
                          onClick={() => setEditingAdSetCopy(prev => ({
                            ...prev,
                            primaryTexts: prev.primaryTexts.filter((_, i) => i !== idx),
                          }))}
                          data-testid={`button-remove-primary-${idx}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full min-h-[100px] px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 resize-y"
                      value={text}
                      onChange={(e) => setEditingAdSetCopy(prev => ({
                        ...prev,
                        primaryTexts: prev.primaryTexts.map((t, i) => i === idx ? e.target.value : t),
                      }))}
                      placeholder="Enter primary text..."
                      data-testid={`textarea-primary-text-${idx}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Headlines ({editingAdSetCopy.headlines.length})</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => setEditingAdSetCopy(prev => ({ ...prev, headlines: [...prev.headlines, ""] }))}
                  data-testid="button-add-headline"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add variation
                </Button>
              </div>
              <div className="space-y-2">
                {editingAdSetCopy.headlines.map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      value={text}
                      onChange={(e) => setEditingAdSetCopy(prev => ({
                        ...prev,
                        headlines: prev.headlines.map((t, i) => i === idx ? e.target.value : t),
                      }))}
                      placeholder="Enter headline..."
                      data-testid={`input-headline-${idx}`}
                    />
                    {editingAdSetCopy.headlines.length > 1 && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-destructive transition-colors shrink-0"
                        onClick={() => setEditingAdSetCopy(prev => ({
                          ...prev,
                          headlines: prev.headlines.filter((_, i) => i !== idx),
                        }))}
                        data-testid={`button-remove-headline-${idx}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descriptions ({editingAdSetCopy.descriptions.length})</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => setEditingAdSetCopy(prev => ({ ...prev, descriptions: [...prev.descriptions, ""] }))}
                  data-testid="button-add-description"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add variation
                </Button>
              </div>
              <div className="space-y-2">
                {editingAdSetCopy.descriptions.map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      value={text}
                      onChange={(e) => setEditingAdSetCopy(prev => ({
                        ...prev,
                        descriptions: prev.descriptions.map((t, i) => i === idx ? e.target.value : t),
                      }))}
                      placeholder="Enter description..."
                      data-testid={`input-description-${idx}`}
                    />
                    {editingAdSetCopy.descriptions.length > 1 && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-destructive transition-colors shrink-0"
                        onClick={() => setEditingAdSetCopy(prev => ({
                          ...prev,
                          descriptions: prev.descriptions.filter((_, i) => i !== idx),
                        }))}
                        data-testid={`button-remove-description-${idx}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setShowCopyEditModal(false);
                setEditingAdSetId(null);
              }}
              data-testid="button-cancel-copy-edit"
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                if (editingAdSetId) {
                  updateAdSetCopyMutation.mutate({
                    adsetId: editingAdSetId,
                    copy: {
                      ...editingAdSetCopy,
                      primaryTexts: editingAdSetCopy.primaryTexts.filter(t => t.trim()),
                      headlines: editingAdSetCopy.headlines.filter(t => t.trim()),
                      descriptions: editingAdSetCopy.descriptions.filter(t => t.trim()),
                    },
                  });
                }
              }}
              disabled={updateAdSetCopyMutation.isPending}
              data-testid="button-save-copy-edit"
            >
              {updateAdSetCopyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Copy"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Targeting Edit Dialog */}
      <Dialog open={showTargetingEditDialog} onOpenChange={setShowTargetingEditDialog}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Targeting</DialogTitle>
            <DialogDescription>
              Change audience targeting settings for your ads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Countries</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[40px] p-2.5 border rounded-xl bg-muted/30" data-testid="input-edit-geo">
                {editingTargeting.geoTargeting.map((code) => {
                  const country = META_COUNTRIES.find(c => c.code === code);
                  return (
                    <Badge key={code} variant="secondary" className="gap-1 text-xs rounded-lg px-2 py-1">
                      {country ? country.name : code}
                      <button
                        type="button"
                        className="ml-0.5 hover:text-destructive"
                        onClick={() => setEditingTargeting(prev => ({
                          ...prev,
                          geoTargeting: prev.geoTargeting.filter(c => c !== code)
                        }))}
                        data-testid={`remove-country-${code}`}
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              <CountryPicker
                selectedCountries={editingTargeting.geoTargeting}
                onToggle={(code) => {
                  setEditingTargeting(prev => {
                    const exists = prev.geoTargeting.includes(code);
                    return {
                      ...prev,
                      geoTargeting: exists
                        ? prev.geoTargeting.filter(c => c !== code)
                        : [...prev.geoTargeting, code]
                    };
                  });
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-age-min" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Min Age</Label>
                <Input
                  id="edit-age-min"
                  type="number"
                  min={13}
                  max={65}
                  value={editingTargeting.ageMin}
                  onChange={(e) => setEditingTargeting(prev => ({ ...prev, ageMin: parseInt(e.target.value) || 18 }))}
                  className="rounded-xl"
                  data-testid="input-edit-age-min"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-age-max" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max Age</Label>
                <Input
                  id="edit-age-max"
                  type="number"
                  min={13}
                  max={65}
                  value={editingTargeting.ageMax}
                  onChange={(e) => setEditingTargeting(prev => ({ ...prev, ageMax: parseInt(e.target.value) || 65 }))}
                  className="rounded-xl"
                  data-testid="input-edit-age-max"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gender" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gender</Label>
              <Select
                value={editingTargeting.gender}
                onValueChange={(val) => setEditingTargeting(prev => ({ ...prev, gender: val as "ALL" | "MALE" | "FEMALE" }))}
              >
                <SelectTrigger id="edit-gender" className="rounded-xl" data-testid="select-edit-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowTargetingEditDialog(false)} data-testid="button-cancel-targeting">
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                setDefaultSettings(prev => ({
                  ...prev,
                  geoTargeting: editingTargeting.geoTargeting,
                  ageMin: editingTargeting.ageMin,
                  ageMax: editingTargeting.ageMax,
                  gender: editingTargeting.gender,
                }));
                setShowTargetingEditDialog(false);
                toast({ title: "Saved", description: "Targeting settings updated" });
              }}
              data-testid="button-save-targeting"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creative Edit Dialog */}
      <Dialog open={showCreativeEditDialog} onOpenChange={setShowCreativeEditDialog}>
        <DialogContent className="sm:max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Creative</DialogTitle>
            <DialogDescription>
              Change creative and tracking settings for your ads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-pixel" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pixel</Label>
              <Select
                value={editingCreative.pixelId || "none"}
                onValueChange={(val) => setEditingCreative(prev => ({ ...prev, pixelId: val === "none" ? "" : val }))}
              >
                <SelectTrigger id="edit-pixel" className="rounded-xl" data-testid="select-edit-pixel">
                  <SelectValue placeholder="Select pixel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No pixel</SelectItem>
                  {availablePixels.map((pixel) => (
                    <SelectItem key={pixel.id} value={pixel.id}>
                      {pixel.name} ({pixel.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availablePixels.length === 0 && (
                <p className="text-xs text-muted-foreground">No pixels found. Check your settings in Meta.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cta" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call to Action</Label>
              <Select
                value={editingCreative.defaultCta}
                onValueChange={(val) => setEditingCreative(prev => ({ ...prev, defaultCta: val }))}
              >
                <SelectTrigger id="edit-cta" className="rounded-xl" data-testid="select-edit-cta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LEARN_MORE">Learn More</SelectItem>
                  <SelectItem value="SHOP_NOW">Shop Now</SelectItem>
                  <SelectItem value="SIGN_UP">Sign Up</SelectItem>
                  <SelectItem value="SUBSCRIBE">Subscribe</SelectItem>
                  <SelectItem value="CONTACT_US">Contact Us</SelectItem>
                  <SelectItem value="GET_OFFER">Get Offer</SelectItem>
                  <SelectItem value="ORDER_NOW">Order Now</SelectItem>
                  <SelectItem value="BUY_NOW">Buy Now</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-website-url" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website URL</Label>
                <Input
                  id="edit-website-url"
                  value={editingCreative.websiteUrl}
                  onChange={(e) => setEditingCreative(prev => ({ ...prev, websiteUrl: e.target.value }))}
                  placeholder="https://example.com"
                  className="rounded-xl"
                  data-testid="input-edit-website-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-default-url" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default URL</Label>
                <Input
                  id="edit-default-url"
                  value={editingCreative.defaultUrl}
                  onChange={(e) => setEditingCreative(prev => ({ ...prev, defaultUrl: e.target.value }))}
                  placeholder="https://example.com/landing"
                  className="rounded-xl"
                  data-testid="input-edit-default-url"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display-link" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display Link</Label>
              <Input
                id="edit-display-link"
                value={editingCreative.displayLink}
                onChange={(e) => setEditingCreative(prev => ({ ...prev, displayLink: e.target.value }))}
                placeholder="www.example.com"
                className="rounded-xl"
                data-testid="input-edit-display-link"
              />
              <p className="text-xs text-muted-foreground">Visible URL shown on the ad</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-beneficiary" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Beneficiary</Label>
                <Input
                  id="edit-beneficiary"
                  value={editingCreative.beneficiaryName}
                  onChange={(e) => setEditingCreative(prev => ({ ...prev, beneficiaryName: e.target.value }))}
                  placeholder="Company name"
                  className="rounded-xl"
                  data-testid="input-edit-beneficiary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-payer" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payer</Label>
                <Input
                  id="edit-payer"
                  value={editingCreative.payerName}
                  onChange={(e) => setEditingCreative(prev => ({ ...prev, payerName: e.target.value }))}
                  placeholder="Payer name"
                  className="rounded-xl"
                  data-testid="input-edit-payer"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCreativeEditDialog(false)} data-testid="button-cancel-creative">
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={() => {
                setDefaultSettings(prev => ({
                  ...prev,
                  pixelId: editingCreative.pixelId,
                  defaultCta: editingCreative.defaultCta,
                  websiteUrl: editingCreative.websiteUrl,
                  defaultUrl: editingCreative.defaultUrl,
                  displayLink: editingCreative.displayLink,
                  beneficiaryName: editingCreative.beneficiaryName,
                  payerName: editingCreative.payerName,
                }));
                apiRequest("PATCH", "/api/ad-account-settings", {
                  pixelId: editingCreative.pixelId,
                  defaultCta: editingCreative.defaultCta,
                  websiteUrl: editingCreative.websiteUrl,
                  defaultUrl: editingCreative.defaultUrl,
                  displayLink: editingCreative.displayLink,
                  beneficiaryName: editingCreative.beneficiaryName,
                  payerName: editingCreative.payerName,
                }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/ad-account-settings"] });
                }).catch(() => {});
                setShowCreativeEditDialog(false);
                toast({ title: "Saved", description: "Creative settings updated" });
              }}
              data-testid="button-save-creative"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
