import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import type { CampaignSettings, AdSetSettings, AdSettings, CreativeSettings } from "@shared/schema";

interface GlobalSettings {
  id?: string;
  facebookPageId?: string | null;
  facebookPageName?: string | null;
  instagramPageId?: string | null;
  instagramPageName?: string | null;
  useInstagramFromFacebook?: boolean | null;
  beneficiaryName?: string | null;
  payerName?: string | null;
  primaryTextVariations?: string[] | null;
  headlineVariations?: string[] | null;
  descriptionVariations?: string[] | null;
  defaultCta?: string | null;
  planType?: string | null;
  uploadsRemaining?: number | null;
}

interface Connection {
  id: string;
  provider: string;
  status: string;
  accountName?: string;
  accountEmail?: string;
}

interface BillingPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  planType: string;
  invoiceUrl?: string | null;
  createdAt: string;
}

interface BillingStatus {
  planType: "free" | "pro";
  billingInterval: "monthly" | "yearly" | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  uploadsUsed: number;
  uploadsLimit: number | null;
  uploadsRemaining: number | null;
  canLaunch: boolean;
}

const CTA_OPTIONS = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "DOWNLOAD", label: "Download" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "WATCH_MORE", label: "Watch More" },
  { value: "APPLY_NOW", label: "Apply Now" },
];

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const { data: settings, isLoading } = useQuery<GlobalSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: billingStatus, isLoading: billingStatusLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
  });
  
  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["/api/connections"],
  });
  
  const metaConnection = connections.find(c => c.provider === "meta" && c.status === "connected");
  
  const { data: billingPayments = [], isLoading: billingLoading } = useQuery<BillingPayment[]>({
    queryKey: ["/api/billing/payments"],
  });
  
  // Fetch ad accounts from Meta (must be before pixels/audiences)
  const { data: adAccountsData } = useQuery<{
    data: Array<{ id: string; name: string; hasSettings?: boolean }>;
    selectedAdAccountId: string | null;
  }>({
    queryKey: ["/api/meta/ad-accounts"],
    enabled: !!metaConnection,
  });
  
  const adAccounts = adAccountsData?.data || [];
  const selectedAdAccountId = adAccountsData?.selectedAdAccountId || "";
  const selectedAdAccount = adAccounts.find(a => a.id === selectedAdAccountId || `act_${a.id}` === selectedAdAccountId);
  
  // Fetch pixels and audiences from Meta (scoped to selected ad account)
  const { data: pixelsData } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/meta/pixels", selectedAdAccountId],
    queryFn: async () => { const res = await fetch("/api/meta/pixels", { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch pixels"); return res.json(); },
    enabled: !!metaConnection && !!selectedAdAccountId,
  });
  
  const { data: customAudiencesData } = useQuery<{ data: Array<{ id: string; name: string; subtype?: string }> }>({
    queryKey: ["/api/meta/custom-audiences", selectedAdAccountId],
    queryFn: async () => { const res = await fetch("/api/meta/custom-audiences", { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch custom audiences"); return res.json(); },
    enabled: !!metaConnection && !!selectedAdAccountId,
  });
  
  const { data: savedAudiencesData } = useQuery<{ data: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/meta/saved-audiences", selectedAdAccountId],
    queryFn: async () => { const res = await fetch("/api/meta/saved-audiences", { credentials: "include" }); if (!res.ok) throw new Error("Failed to fetch saved audiences"); return res.json(); },
    enabled: !!metaConnection && !!selectedAdAccountId,
  });
  
  const pixels = pixelsData?.data || [];
  const customAudiences = customAudiencesData?.data || [];
  const savedAudiences = savedAudiencesData?.data || [];
  
  // Fetch pages from Meta (same source as sidebar)
  const { data: pagesData } = useQuery<{
    data: Array<{ id: string; name: string; access_token?: string }>;
    selectedPageId: string | null;
  }>({
    queryKey: ["/api/meta/pages"],
  });
  
  const metaPages = pagesData?.data || [];
  const selectedPageIdFromMeta = pagesData?.selectedPageId || "";
  
  // Fetch Instagram accounts connected to the selected Facebook page
  const { data: instagramAccountsData } = useQuery<{
    data: Array<{ id: string; username: string; name?: string; profile_picture_url?: string }>;
  }>({
    queryKey: ["/api/meta/instagram-accounts", selectedPageIdFromMeta],
    enabled: !!selectedPageIdFromMeta && !!metaConnection,
  });
  
  const instagramAccounts = instagramAccountsData?.data || [];
  
  // Mutation to update selected page (syncs with sidebar)
  const updatePageMutation = useMutation({
    mutationFn: async (pageId: string) => {
      const res = await apiRequest("PATCH", "/api/meta/pages/selected", { pageId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/campaigns"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Page Updated",
        description: "Selected Facebook Page has been changed.",
      });
    },
  });
  
  // Fetch per-ad-account settings
  const { data: adAccountSettingsData, isLoading: isLoadingAdAccountSettings } = useQuery<{
    settings: {
      // Campaign settings
      campaignObjective?: string;
      budgetType?: string;
      budgetAmount?: number;
      // Ad Set settings
      pixelId?: string;
      pixelName?: string;
      audienceType?: string;
      audienceId?: string;
      audienceName?: string;
      geoTargeting?: string[];
      ageMin?: number;
      ageMax?: number;
      gender?: string;
      dailyMinSpendTarget?: number;
      dailySpendCap?: number;
      lifetimeSpendCap?: number;
      websiteUrl?: string;
      defaultCta?: string;
      defaultUrl?: string;
      displayLink?: string;
      isConfigured?: boolean;
    } | null;
    adAccountId: string | null;
    adAccountName: string | null;
    isConfigured: boolean;
  }>({
    queryKey: ["/api/ad-account-settings"],
    enabled: !!metaConnection && !!selectedAdAccountId,
  });
  
  // State for campaign import feature
  const [importCampaignId, setImportCampaignId] = useState<string>("");
  const [importAdSetId, setImportAdSetId] = useState<string>("");
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  
  // Fetch campaigns for import dropdown
  const { data: campaignsData, isLoading: isLoadingCampaigns } = useQuery<{
    data: Array<{
      id: string;
      name: string;
      status: string;
      effective_status?: string;
      objective?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
  }>({
    queryKey: ["/api/meta/campaigns", selectedAdAccountId || "none"],
    queryFn: async () => {
      const res = await fetch("/api/meta/campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!metaConnection && !!selectedAdAccountId,
  });
  
  const campaigns = campaignsData?.data || [];
  
  // Fetch campaign details when a campaign is selected for import
  const { data: campaignDetailsData, isLoading: isLoadingCampaignDetails, error: campaignDetailsError, refetch: refetchCampaignDetails } = useQuery<{
    data: {
      campaign: {
        id: string;
        name: string;
        objective?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      };
      adSets: Array<{
        id: string;
        name: string;
        status: string;
        daily_budget?: string;
        lifetime_budget?: string;
        targeting?: {
          geo_locations?: {
            countries?: string[];
            regions?: Array<{ key: string; name: string }>;
            cities?: Array<{ key: string; name: string }>;
          };
          age_min?: number;
          age_max?: number;
          genders?: number[];
          custom_audiences?: Array<{ id: string; name: string }>;
          excluded_custom_audiences?: Array<{ id: string; name: string }>;
        };
        promoted_object?: {
          pixel_id?: string;
          custom_event_type?: string;
        };
        optimization_goal?: string;
        billing_event?: string;
      }>;
      ads: Array<{
        id: string;
        name: string;
        adset_id: string;
        creative?: {
          call_to_action_type?: string;
          object_story_spec?: {
            link_data?: {
              link?: string;
              display_link?: string;
              message?: string;
              name?: string;
              call_to_action?: {
                type?: string;
              };
            };
            video_data?: {
              video_id?: string;
              call_to_action?: {
                type?: string;
                value?: {
                  link?: string;
                };
              };
            };
          };
          asset_feed_spec?: {
            call_to_action_types?: string[];
            link_urls?: Array<{
              website_url?: string;
            }>;
          };
        };
      }>;
    };
  }>({
    queryKey: ["/api/meta/campaigns", importCampaignId, "details"],
    enabled: !!importCampaignId,
    staleTime: 0,
    retry: 2,
    retryDelay: 3000,
  });
  
  const importAdSets = campaignDetailsData?.data?.adSets || [];
  
  // Campaign settings state
  const [campaignObjective, setCampaignObjective] = useState<string>("OUTCOME_SALES");
  const [budgetType, setBudgetType] = useState<string>("DAILY");
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [startDate, setStartDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [conversionEvent, setConversionEvent] = useState<string>("PURCHASE");
  const [defaultLandingUrl, setDefaultLandingUrl] = useState<string>("");
  
  // Ad Set settings state
  const [pixelId, setPixelId] = useState<string>("");
  const [audienceType, setAudienceType] = useState<string>("ADVANTAGE_PLUS");
  const [audienceId, setAudienceId] = useState<string>("");
  const [useAdvantagePlacements, setUseAdvantagePlacements] = useState<boolean>(true);
  const [placementsFacebook, setPlacementsFacebook] = useState<boolean>(true);
  const [placementsInstagram, setPlacementsInstagram] = useState<boolean>(true);
  const [placementsMessenger, setPlacementsMessenger] = useState<boolean>(false);
  const [placementsAudienceNetwork, setPlacementsAudienceNetwork] = useState<boolean>(false);
  const [attributionClickThrough, setAttributionClickThrough] = useState<string>("7_DAY");
  const [attributionViewThrough, setAttributionViewThrough] = useState<string>("NONE");
  const [geoTargeting, setGeoTargeting] = useState<string>("");
  const [ageMin, setAgeMin] = useState<string>("18");
  const [ageMax, setAgeMax] = useState<string>("65");
  const [gender, setGender] = useState<string>("ALL");
  const [dailyMinSpendTarget, setDailyMinSpendTarget] = useState<string>("");
  const [dailySpendCap, setDailySpendCap] = useState<string>("");
  const [lifetimeSpendCap, setLifetimeSpendCap] = useState<string>("");
  
  // Ad settings state
  const [defaultUrl, setDefaultUrl] = useState<string>("");
  const [defaultUtm, setDefaultUtm] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string>("");
  const [displayLink, setDisplayLink] = useState<string>("");
  
  // Creative settings state
  const [advantageCreative, setAdvantageCreative] = useState<boolean>(true);
  const [visualTouchups, setVisualTouchups] = useState<boolean>(false);
  const [textImprovements, setTextImprovements] = useState<boolean>(false);
  const [enhanceCta, setEnhanceCta] = useState<boolean>(false);
  const [relevantComments, setRelevantComments] = useState<boolean>(true);
  const [musicOverlay, setMusicOverlay] = useState<boolean>(false);
  const [imageAnimation, setImageAnimation] = useState<boolean>(false);
  
  // Ad format settings
  const [adFormat, setAdFormat] = useState<string>("FLEXIBLE");
  const [multiAdvertiserAds, setMultiAdvertiserAds] = useState<boolean>(false);
  const [advantagePlusCreative, setAdvantagePlusCreative] = useState<boolean>(true);
  
  const [facebookPageId, setFacebookPageId] = useState("");
  const [facebookPageName, setFacebookPageName] = useState("GROS studentski klub");
  const [instagramPageId, setInstagramPageId] = useState("");
  const [instagramPageName, setInstagramPageName] = useState("");
  const [useInstagramFromFacebook, setUseInstagramFromFacebook] = useState(true);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [payerName, setPayerName] = useState("");
  
  const [defaultCta, setDefaultCta] = useState("LEARN_MORE");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/auth/logout");
      window.location.href = "/";
    } catch (err) {
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteData = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", "/auth/delete-my-data");
      toast({
        title: "Data deleted",
        description: "All your data has been deleted successfully",
      });
      window.location.href = "/";
    } catch (err) {
      toast({
        title: "Delete failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Sync facebookPageId with metaAssets selectedPageId (single source of truth)
  useEffect(() => {
    if (selectedPageIdFromMeta) {
      setFacebookPageId(selectedPageIdFromMeta);
      const page = metaPages.find(p => p.id === selectedPageIdFromMeta);
      if (page) {
        setFacebookPageName(page.name);
      }
    }
  }, [selectedPageIdFromMeta, metaPages]);
  
  useEffect(() => {
    if (settings) {
      setInstagramPageId(settings.instagramPageId || "");
      setInstagramPageName(settings.instagramPageName || "");
      setUseInstagramFromFacebook(settings.useInstagramFromFacebook ?? true);
      setBeneficiaryName(settings.beneficiaryName || "");
      setPayerName(settings.payerName || "");
      setDefaultCta(settings.defaultCta || "LEARN_MORE");
    }
  }, [settings]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingParam = params.get("billing");
    if (!billingParam) return;

    if (billingParam === "success") {
      toast({
        title: "Subscription updated",
        description: "Payment completed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payments"] });
    } else if (billingParam === "cancel") {
      toast({
        title: "Checkout cancelled",
        description: "No payment was made.",
      });
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);
  
  // Auto-select first Instagram account when Facebook page is selected and no Instagram is configured
  // But don't override if user explicitly chose "Use Facebook Page"
  useEffect(() => {
    if (instagramAccounts.length > 0 && !instagramPageId && facebookPageId && !useInstagramFromFacebook) {
      const firstAccount = instagramAccounts[0];
      setInstagramPageId(firstAccount.id);
      setInstagramPageName(firstAccount.username || firstAccount.name || "");
    }
  }, [instagramAccounts, instagramPageId, facebookPageId, useInstagramFromFacebook]);
  
  // Sync ad account settings state
  useEffect(() => {
    const s = adAccountSettingsData?.settings;
    if (s) {
      // Load saved campaign settings
      setCampaignObjective(s.campaignObjective || "OUTCOME_SALES");
      setBudgetType(s.budgetType || "DAILY");
      setBudgetAmount(s.budgetAmount?.toString() || "");
      // Load saved ad set settings
      setPixelId(s.pixelId || "");
      setAudienceType(s.audienceType || "ADVANTAGE_PLUS");
      setAudienceId(s.audienceId || "");
      setGeoTargeting(s.geoTargeting?.join(", ") || "");
      setAgeMin(s.ageMin?.toString() || "18");
      setAgeMax(s.ageMax?.toString() || "65");
      setGender(s.gender || "ALL");
      setDailyMinSpendTarget(s.dailyMinSpendTarget?.toString() || "");
      setDailySpendCap(s.dailySpendCap?.toString() || "");
      setLifetimeSpendCap(s.lifetimeSpendCap?.toString() || "");
      setWebsiteUrl(s.websiteUrl || "");
      setDefaultCta(s.defaultCta || "LEARN_MORE");
      setDefaultUrl(s.defaultUrl || "");
      setDisplayLink(s.displayLink || "");
    } else {
      // Reset to defaults when no settings exist
      setCampaignObjective("OUTCOME_SALES");
      setBudgetType("DAILY");
      setBudgetAmount("");
      setPixelId("");
      setAudienceType("ADVANTAGE_PLUS");
      setAudienceId("");
      setGeoTargeting("");
      setAgeMin("18");
      setAgeMax("65");
      setGender("ALL");
      setDailyMinSpendTarget("");
      setDailySpendCap("");
      setLifetimeSpendCap("");
      setWebsiteUrl("");
      setDefaultCta("LEARN_MORE");
      setDefaultUrl("");
      setDisplayLink("");
    }
  }, [adAccountSettingsData]);
  
  const updateAdAccountSettingsMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await apiRequest("PATCH", "/api/ad-account-settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sidebar-data"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ad-account-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/ad-accounts"] });
      toast({ title: "Settings saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save settings", description: error.message, variant: "destructive" });
    },
  });
  
  // Refetch ad account settings, pixels, and audiences when selected ad account changes
  useEffect(() => {
    if (selectedAdAccountId) {
      queryClient.invalidateQueries({ queryKey: ["/api/ad-account-settings"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/pixels"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/custom-audiences"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/saved-audiences"], exact: false });
    }
  }, [selectedAdAccountId]);
  
  const handleSaveAdSetSettings = () => {
    const geoArray = geoTargeting.split(",").map(s => s.trim()).filter(s => s);
    const selectedPixel = pixels.find(p => p.id === pixelId);
    const selectedAudience = audienceType === "CUSTOM" 
      ? customAudiences.find(a => a.id === audienceId)
      : audienceType === "SAVED"
        ? savedAudiences.find(a => a.id === audienceId)
        : undefined;
    
    updateAdAccountSettingsMutation.mutate({
      pixelId: pixelId || null,
      pixelName: selectedPixel?.name || null,
      audienceType: audienceType,
      audienceId: audienceType !== "ADVANTAGE_PLUS" ? audienceId || null : null,
      audienceName: selectedAudience?.name || null,
      geoTargeting: geoArray.length > 0 ? geoArray : [],
      ageMin: ageMin ? parseInt(ageMin) : 18,
      ageMax: ageMax ? parseInt(ageMax) : 65,
      gender: gender,
      dailyMinSpendTarget: dailyMinSpendTarget ? parseFloat(dailyMinSpendTarget) : null,
      dailySpendCap: dailySpendCap ? parseFloat(dailySpendCap) : null,
      lifetimeSpendCap: lifetimeSpendCap ? parseFloat(lifetimeSpendCap) : null,
    });
  };
  
  const handleSaveAdSettings = () => {
    updateAdAccountSettingsMutation.mutate({
      websiteUrl: websiteUrl || null,
      defaultCta: defaultCta || null,
      defaultUrl: defaultUrl || null,
      displayLink: displayLink || null,
    });
  };
  
  // Helper to save settings with explicit values (used for both manual save and auto-save after import)
  const saveSettingsWithValues = (values: {
    campaignObjective: string;
    budgetType: string;
    budgetAmount: string;
    pixelId: string;
    audienceType: string;
    audienceId: string;
    geoTargeting: string;
    ageMin: string;
    ageMax: string;
    gender: string;
    dailyMinSpendTarget: string;
    dailySpendCap: string;
    lifetimeSpendCap: string;
    websiteUrl: string;
    defaultCta: string;
    defaultUrl: string;
    displayLink: string;
  }, callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
    const geoArray = values.geoTargeting.split(",").map(s => s.trim()).filter(s => s);
    const selectedPixel = pixels.find(p => p.id === values.pixelId);
    const selectedAudience = values.audienceType === "CUSTOM" 
      ? customAudiences.find(a => a.id === values.audienceId)
      : values.audienceType === "SAVED"
        ? savedAudiences.find(a => a.id === values.audienceId)
        : undefined;
    
    updateAdAccountSettingsMutation.mutate({
      campaignObjective: values.campaignObjective || null,
      budgetType: values.budgetType || null,
      budgetAmount: values.budgetAmount ? parseFloat(values.budgetAmount) : null,
      pixelId: values.pixelId || null,
      pixelName: selectedPixel?.name || null,
      audienceType: values.audienceType,
      audienceId: values.audienceType !== "ADVANTAGE_PLUS" ? values.audienceId || null : null,
      audienceName: selectedAudience?.name || null,
      geoTargeting: geoArray.length > 0 ? geoArray : [],
      ageMin: values.ageMin ? parseInt(values.ageMin) : 18,
      ageMax: values.ageMax ? parseInt(values.ageMax) : 65,
      gender: values.gender,
      dailyMinSpendTarget: values.dailyMinSpendTarget ? parseFloat(values.dailyMinSpendTarget) : null,
      dailySpendCap: values.dailySpendCap ? parseFloat(values.dailySpendCap) : null,
      lifetimeSpendCap: values.lifetimeSpendCap ? parseFloat(values.lifetimeSpendCap) : null,
      websiteUrl: values.websiteUrl || null,
      defaultCta: values.defaultCta || null,
      defaultUrl: values.defaultUrl || null,
      displayLink: values.displayLink || null,
    }, callbacks);
  };

  // Combined save for both Ad Set and Ad settings (uses current React state)
  const handleSaveAllSettings = () => {
    saveSettingsWithValues({
      campaignObjective,
      budgetType,
      budgetAmount,
      pixelId,
      audienceType,
      audienceId,
      geoTargeting,
      ageMin,
      ageMax,
      gender,
      dailyMinSpendTarget,
      dailySpendCap,
      lifetimeSpendCap,
      websiteUrl,
      defaultCta,
      defaultUrl,
      displayLink,
    });
  };
  
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<GlobalSettings>) => {
      const res = await apiRequest("PATCH", "/api/settings", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save settings", description: error.message, variant: "destructive" });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (interval: "monthly" | "yearly") => {
      const res = await apiRequest("POST", "/api/billing/checkout", { interval });
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveIdentity = () => {
    // Save the selected Instagram account ID directly
    updateSettingsMutation.mutate({
      facebookPageId,
      facebookPageName,
      instagramPageId: useInstagramFromFacebook ? "" : instagramPageId,
      instagramPageName: useInstagramFromFacebook ? "" : instagramPageName,
      useInstagramFromFacebook,
      beneficiaryName,
      payerName,
    });
  };
  
  // Handler to apply settings from imported campaign/ad set
  const handleApplyImportedSettings = async () => {
    const selectedAdSet = importAdSets.find(as => as.id === importAdSetId);
    if (!selectedAdSet) {
      toast({ title: "No ad set selected", description: "Please select an ad set to import settings from.", variant: "destructive" });
      return;
    }
    
    setIsApplyingImport(true);
    
    let ad: any = null;
    let sampleAdFetchError: string | null = null;
    try {
      const res = await apiRequest("GET", `/api/meta/adsets/${selectedAdSet.id}/sample-ad`);
      const result = await res.json();
      ad = result.data;
    } catch (err: any) {
      sampleAdFetchError = err?.message || "Could not fetch ad from this ad set.";
      console.warn("[Settings] Sample ad fetch failed during import; continuing with partial import", {
        adSetId: selectedAdSet.id,
        error: sampleAdFetchError,
      });
    }
    
    // ===== STEP 1: Extract ALL values ONCE and store in local variables =====
    const campaignData = campaignDetailsData?.data?.campaign;
    const targeting = selectedAdSet.targeting;
    
    // Campaign settings - try campaign level first, then fall back to ad set level
    const extractedObjective = campaignData?.objective || "";
    
    // Budget can be at campaign level OR ad set level - check both
    const campaignDailyBudget = campaignData?.daily_budget;
    const campaignLifetimeBudget = campaignData?.lifetime_budget;
    const adsetDailyBudget = selectedAdSet?.daily_budget;
    const adsetLifetimeBudget = selectedAdSet?.lifetime_budget;
    
    // Determine budget type and amount from campaign first, then ad set
    let extractedBudgetType = "";
    let extractedBudgetAmount = "";
    
    if (campaignDailyBudget) {
      extractedBudgetType = "DAILY";
      extractedBudgetAmount = (parseInt(campaignDailyBudget) / 100).toString();
    } else if (campaignLifetimeBudget) {
      extractedBudgetType = "LIFETIME";
      extractedBudgetAmount = (parseInt(campaignLifetimeBudget) / 100).toString();
    } else if (adsetDailyBudget) {
      extractedBudgetType = "DAILY";
      extractedBudgetAmount = (parseInt(adsetDailyBudget) / 100).toString();
    } else if (adsetLifetimeBudget) {
      extractedBudgetType = "LIFETIME";
      extractedBudgetAmount = (parseInt(adsetLifetimeBudget) / 100).toString();
    }
    
    // Geo targeting - only use country codes (Meta API requires ISO country codes)
    // Regions and cities have different API fields and cannot be used in countries array
    const countries = targeting?.geo_locations?.countries || [];
    const extractedGeoTargeting = countries.join(", ");
    
    // Age targeting
    const extractedAgeMin = (targeting?.age_min || 18).toString();
    const extractedAgeMax = (targeting?.age_max || 65).toString();
    
    // Gender
    let extractedGender = "ALL";
    if (targeting?.genders) {
      if (targeting.genders.includes(1) && targeting.genders.includes(2)) {
        extractedGender = "ALL";
      } else if (targeting.genders.includes(1)) {
        extractedGender = "MALE";
      } else if (targeting.genders.includes(2)) {
        extractedGender = "FEMALE";
      }
    }
    
    // Audience
    const extractedAudienceType = (targeting?.custom_audiences?.length ?? 0) > 0 ? "CUSTOM" : "ADVANTAGE_PLUS";
    const extractedAudienceId = targeting?.custom_audiences?.[0]?.id || "";
    
    // Pixel
    const extractedPixelId = selectedAdSet.promoted_object?.pixel_id || "";
    
    // Spend caps from ad set
    const extractedDailySpendCap = selectedAdSet.daily_budget 
      ? (parseInt(selectedAdSet.daily_budget) / 100).toString() 
      : "";
    const extractedLifetimeSpendCap = selectedAdSet.lifetime_budget 
      ? (parseInt(selectedAdSet.lifetime_budget) / 100).toString() 
      : "";
    
    // CTA and URL from ad (support regular ads, video ads with single format, and DCT/Dynamic Creative ads)
    const ctaFromLinkData = ad?.creative?.object_story_spec?.link_data?.call_to_action?.type;
    const ctaFromVideoData = ad?.creative?.object_story_spec?.video_data?.call_to_action?.type;
    const ctaFromCreative = ad?.creative?.call_to_action_type;
    // For DCT ads, CTA and URLs are in asset_feed_spec
    const assetFeedSpec = ad?.creative?.asset_feed_spec;
    const ctaFromAssetFeed = assetFeedSpec?.call_to_action_types?.[0];
    
    // URL extraction: separate website URL (destination) and default URL (display/fallback)
    // Website URL = main destination URL where clicks go
    const websiteUrlFromLinkData = ad?.creative?.object_story_spec?.link_data?.link;
    const websiteUrlFromVideoData = ad?.creative?.object_story_spec?.video_data?.call_to_action?.value?.link;
    const websiteUrlFromAssetFeed = assetFeedSpec?.link_urls?.[0]?.website_url;
    const extractedWebsiteUrl = websiteUrlFromLinkData || websiteUrlFromVideoData || websiteUrlFromAssetFeed || websiteUrl || "";
    
    // Default URL = display URL for link_data ads only (display_link is validated URL field)
    // For video ads and DCT ads, defaultUrl equals websiteUrl since no separate display URL exists
    const displayUrlFromLinkData = ad?.creative?.object_story_spec?.link_data?.display_link;
    const extractedDefaultUrl = displayUrlFromLinkData || defaultUrl || extractedWebsiteUrl;
    
    // Display Link - the visual URL shown on the ad (e.g., "www.example.com")
    const extractedDisplayLink = displayUrlFromLinkData || displayLink || "";
    
    const extractedCta = ctaFromLinkData || ctaFromVideoData || ctaFromCreative || ctaFromAssetFeed || defaultCta || "";
    
    // ===== STEP 2: Apply ALL values to React state (overwrite existing settings) =====
    setCampaignObjective(extractedObjective);
    setBudgetType(extractedBudgetType);
    setBudgetAmount(extractedBudgetAmount);
    setGeoTargeting(extractedGeoTargeting);
    setAgeMin(extractedAgeMin);
    setAgeMax(extractedAgeMax);
    setGender(extractedGender);
    setAudienceType(extractedAudienceType);
    setAudienceId(extractedAudienceId);
    setPixelId(extractedPixelId);
    setDailySpendCap(extractedDailySpendCap);
    setLifetimeSpendCap(extractedLifetimeSpendCap);
    setDefaultCta(extractedCta);
    setWebsiteUrl(extractedWebsiteUrl);
    setDefaultUrl(extractedDefaultUrl);
    setDisplayLink(extractedDisplayLink);
    
    // ===== STEP 3: Validate required fields before auto-saving =====
    const missingFields: string[] = [];
    if (!extractedObjective) missingFields.push("Campaign Objective");
    if (!extractedBudgetType) missingFields.push("Budget Type");
    if (!extractedBudgetAmount) missingFields.push("Budget Amount");
    if (!extractedCta) missingFields.push("CTA");
    if (!extractedWebsiteUrl) missingFields.push("Website URL");
    
    // ===== STEP 4: Save to database (also for partial imports) =====
    saveSettingsWithValues({
      campaignObjective: extractedObjective,
      budgetType: extractedBudgetType,
      budgetAmount: extractedBudgetAmount,
      pixelId: extractedPixelId,
      audienceType: extractedAudienceType,
      audienceId: extractedAudienceId,
      geoTargeting: extractedGeoTargeting,
      ageMin: extractedAgeMin,
      ageMax: extractedAgeMax,
      gender: extractedGender,
      dailyMinSpendTarget: dailyMinSpendTarget,
      dailySpendCap: extractedDailySpendCap,
      lifetimeSpendCap: extractedLifetimeSpendCap,
      websiteUrl: extractedWebsiteUrl,
      defaultCta: extractedCta,
      defaultUrl: extractedDefaultUrl,
      displayLink: extractedDisplayLink,
    }, {
      onSuccess: () => {
        const warningParts: string[] = [];
        if (sampleAdFetchError) warningParts.push("creative data was unavailable");
        if (missingFields.length > 0) warningParts.push(`missing fields: ${missingFields.join(", ")}`);

        if (warningParts.length > 0) {
          toast({
            title: "Settings Imported (Partial)",
            description: `Saved with warnings: ${warningParts.join("; ")}.`,
          });
        } else {
          toast({
            title: "Settings Imported & Saved",
            description: `Settings from "${selectedAdSet.name}" have been saved to your ad account.`,
          });
        }
      },
      onError: (error: Error) => {
        toast({
          title: "Import Applied",
          description: `Settings applied to form but save failed: ${error.message}. Please click "Save Settings" manually.`,
          variant: "destructive"
        });
      }
    });
    
    // Reset import selection
    setImportCampaignId("");
    setImportAdSetId("");
    setIsApplyingImport(false);
  };
  
  if (isLoading || billingStatusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const effectivePlanType = billingStatus?.planType || (settings?.planType === "pro" ? "pro" : "free");
  const isProPlan = effectivePlanType === "pro";
  const isLegacyPro = billingStatus?.subscriptionStatus === "legacy_pro";
  const uploadsTotal = billingStatus?.uploadsLimit ?? (isProPlan ? null : 3);
  const uploadsUsed = billingStatus?.uploadsUsed ?? (
    uploadsTotal !== null ? Math.max(0, uploadsTotal - (settings?.uploadsRemaining ?? uploadsTotal)) : 0
  );
  const uploadsRemaining = billingStatus?.uploadsRemaining ?? (
    uploadsTotal !== null ? Math.max(0, uploadsTotal - uploadsUsed) : null
  );
  const uploadsPercent = uploadsTotal ? Math.min(100, Math.round((uploadsUsed / uploadsTotal) * 100)) : 0;
  const currentPeriodEndLabel = billingStatus?.currentPeriodEnd
    ? new Date(billingStatus.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const userInitials = (user?.name || "U").split(" ").map(n => n[0]).join("").toUpperCase();

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-5">
      <div className="mb-1">
        <h1 className="text-xl font-extrabold tracking-tight" data-testid="text-settings-title">
          Ad Account Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Configure your platform experience and integrations.
        </p>
      </div>

      {/* Section 1: Your Account */}
      <section className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]">
                <span className="material-symbols-outlined text-lg">account_circle</span>
              </div>
              <div>
                <h2 className="text-base font-bold">Your Account</h2>
                <p className="text-[11px] font-medium text-muted-foreground">Manage your profile and connections</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-bold rounded-full border border-green-500/20">ACTIVE</span>
          </div>

          {/* Profile Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-5 border-b border-white/20 dark:border-white/5">
            <div className="flex items-center gap-4">
              <div className="relative">
                {user?.picture ? (
                  <img
                    alt="Profile"
                    className="w-14 h-14 rounded-xl object-cover shadow-lg ring-2 ring-white/30 dark:ring-white/10"
                    src={user.picture}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1877F2] to-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg ring-2 ring-white/30 dark:ring-white/10">
                    {userInitials}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full" />
              </div>
              <div>
                <h3 className="text-sm font-bold" data-testid="text-user-name">{user?.name || "User"}</h3>
                <p className="text-xs font-medium text-muted-foreground opacity-80" data-testid="text-user-email">{user?.email || "Facebook Account"}</p>
                <p className="text-[9px] font-mono text-gray-400 mt-0.5 uppercase tracking-wider">ID: {user?.id || "—"}</p>
              </div>
            </div>
            <button 
              className="inline-flex items-center px-4 py-2 bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 rounded-lg text-xs font-bold hover:bg-white/60 dark:hover:bg-white/10 transition-all"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <span className="material-symbols-outlined text-base mr-1.5">logout</span>
              Log out
            </button>
          </div>

          {/* Integrations */}
          <div className="pt-5">
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Integrations</h4>
            <div className="grid md:grid-cols-2 gap-3">
              {/* Meta Account */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/40 dark:border-white/10 bg-white/40 dark:bg-slate-800/20 hover:border-[#1877F2]/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <SiFacebook className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Meta Account</p>
                    {metaConnection ? (
                      <p className="text-[10px] font-bold text-green-600 dark:text-green-400">CONNECTED</p>
                    ) : (
                      <p className="text-[10px] font-bold text-muted-foreground opacity-60">NOT LINKED</p>
                    )}
                  </div>
                </div>
                <button
                  className="text-[10px] font-bold text-[#1877F2] hover:text-white hover:bg-[#1877F2] px-4 py-2 border border-[#1877F2]/30 rounded-lg transition-all uppercase"
                  onClick={() => window.location.href = "/auth/meta/start"}
                  data-testid="button-reconnect-meta"
                >
                  {metaConnection ? "Reconnect" : "Connect"}
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* Section 2: Plan + Usage */}
      <section className="grid md:grid-cols-3 gap-4">
        {/* Current Plan */}
        <div
          className={`md:col-span-1 glass-card rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden group transition-all ${
            isProPlan
              ? "border border-[#1877F2]/60 shadow-[0_0_0_1px_rgba(24,119,242,0.2),0_14px_36px_rgba(24,119,242,0.18)]"
              : ""
          }`}
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#1877F2]/20 rounded-full blur-3xl group-hover:bg-[#1877F2]/30 transition-colors pointer-events-none" />
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Current Plan</h3>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-extrabold">{isProPlan ? "Pro" : "Free"}</span>
              {isProPlan && billingStatus?.billingInterval && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {billingStatus.billingInterval}
                </Badge>
              )}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {isProPlan ? (isLegacyPro ? "Legacy Pro access (temporary)" : "Unlimited launches enabled") : "3 launches per UTC month"}
            </p>
            {isProPlan && billingStatus?.cancelAtPeriodEnd && currentPeriodEndLabel && (
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-2">
                Cancels on {currentPeriodEndLabel}
              </p>
            )}
            {isProPlan && !billingStatus?.cancelAtPeriodEnd && currentPeriodEndLabel && (
              <p className="text-[10px] font-semibold text-muted-foreground mt-2">
                Renews on {currentPeriodEndLabel}
              </p>
            )}
          </div>
          <div className="mt-5 space-y-2">
            {!isProPlan && (
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/10">
                <button
                  className={`text-[10px] font-bold py-1.5 rounded-md transition-all ${billingPeriod === "monthly" ? "bg-[#1877F2] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setBillingPeriod("monthly")}
                  type="button"
                >
                  Monthly
                </button>
                <button
                  className={`text-[10px] font-bold py-1.5 rounded-md transition-all ${billingPeriod === "yearly" ? "bg-[#1877F2] text-white" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setBillingPeriod("yearly")}
                  type="button"
                >
                  Yearly
                </button>
              </div>
            )}
            {isProPlan && !isLegacyPro ? (
              <button
                type="button"
                className="w-full py-2.5 px-3 bg-white/60 dark:bg-white/10 border border-white/40 dark:border-white/15 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="button-manage-subscription"
                onClick={() => {
                  window.location.href = "/api/billing/portal";
                }}
              >
                Manage subscription
              </button>
            ) : (
              <button
                className="w-full py-2.5 px-3 bg-[#1877F2] hover:bg-[#1565c0] text-white text-xs font-bold rounded-xl shadow-lg shadow-[#1877F2]/25 transition-all flex items-center justify-center gap-2 group/btn disabled:opacity-60"
                data-testid="button-upgrade"
                onClick={() => checkoutMutation.mutate(billingPeriod)}
                disabled={checkoutMutation.isPending}
              >
                {checkoutMutation.isPending ? "Redirecting..." : "Upgrade Now"}
                <span className="material-symbols-outlined text-base group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
              </button>
            )}
            {(!isProPlan || isLegacyPro) && (
              <p className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500">
                {billingPeriod === "monthly" ? "€29 / month" : "€290 / year (2 months free)"}
              </p>
            )}
          </div>
        </div>

        {/* Usage & Limits */}
        <div className="md:col-span-2 glass-card rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1877F2] text-lg">analytics</span>
              <h3 className="text-base font-bold">Usage & Limits</h3>
            </div>
            <span className="text-[10px] font-bold bg-white/40 dark:bg-white/5 px-2.5 py-1 rounded-full text-muted-foreground border border-white/20 dark:border-white/5">
              {isProPlan ? "UNLIMITED" : "RESETS MONTHLY (UTC)"}
            </span>
          </div>
          <div className="space-y-5">
            {/* Uploads */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-xs font-bold">Uploads</p>
                  <p className="text-[11px] font-medium text-muted-foreground opacity-70">
                    {isProPlan ? "Unlimited processing volume" : "Monthly processing volume"}
                  </p>
                </div>
                <div className="text-right">
                  {isProPlan ? (
                    <span className="text-base font-bold">Unlimited</span>
                  ) : (
                    <>
                      <span className="text-base font-bold">{uploadsUsed}</span>
                      <span className="text-xs font-bold text-muted-foreground opacity-40">/ {uploadsTotal ?? 3}</span>
                    </>
                  )}
                </div>
              </div>
              {isProPlan ? (
                <div className="rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Your Pro plan has no upload cap.
                </div>
              ) : (
                <>
                  <div className="w-full bg-gray-200/50 dark:bg-gray-800/50 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10">
                    <div className="bg-gradient-to-r from-[#1877F2] to-blue-400 h-1.5 rounded-full shadow-[0_0_8px_rgba(24,119,242,0.4)] transition-all duration-500" style={{ width: `${uploadsPercent}%` }} />
                  </div>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-2">
                    {uploadsRemaining ?? 0} uploads remaining this month
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>



      {/* Section: Billing */}
      <section className="glass-card rounded-2xl overflow-hidden" data-testid="section-billing">
        <div className="p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-[#1877F2]/10 flex items-center justify-center text-[#1877F2]">
              <span className="material-symbols-outlined text-lg">receipt_long</span>
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight" data-testid="text-billing-title">Billing</h2>
              <p className="text-[10px] font-medium text-muted-foreground">Monthly payment history</p>
            </div>
          </div>

          {billingLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="billing-loading">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : billingPayments.length === 0 ? (
            <div className="text-center py-8" data-testid="billing-empty">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-lg text-slate-400">payments</span>
              </div>
              <p className="text-xs font-bold text-muted-foreground" data-testid="text-no-payments">No payments yet</p>
              <p className="text-[10px] font-medium text-muted-foreground opacity-60 mt-1">Your payment history will appear here</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/40 dark:border-white/10">
              <table className="w-full text-left" data-testid="table-billing">
                <thead>
                  <tr className="border-b border-white/30 dark:border-white/5 bg-white/30 dark:bg-white/[0.02]">
                    <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Period</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Plan</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Amount</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {billingPayments.map((payment) => {
                    const start = new Date(payment.periodStart);
                    const monthLabel = start.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                    const statusColor = payment.status === "paid"
                      ? "text-green-600 dark:text-green-400 bg-green-500/10"
                      : payment.status === "pending"
                        ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        : "text-red-500 bg-red-500/10";
                    return (
                      <tr key={payment.id} className="border-b border-white/20 dark:border-white/5 last:border-0" data-testid={`row-payment-${payment.id}`}>
                        <td className="px-3 py-2.5 text-xs font-bold" data-testid={`text-period-${payment.id}`}>{monthLabel}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#1877F2]/10 text-[#1877F2]" data-testid={`text-plan-${payment.id}`}>
                            {payment.planType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold" data-testid={`text-amount-${payment.id}`}>
                          {payment.currency === "EUR" ? "€" : payment.currency === "USD" ? "$" : payment.currency}
                          {payment.amount.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${statusColor}`} data-testid={`text-status-${payment.id}`}>
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {payment.invoiceUrl ? (
                            <a
                              href={payment.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-bold text-[#1877F2] hover:underline uppercase tracking-wide inline-flex items-center gap-1"
                              data-testid={`link-invoice-${payment.id}`}
                            >
                              <span className="material-symbols-outlined text-[14px]">download</span>
                              PDF
                            </a>
                          ) : (
                            <span className="text-[10px] font-medium text-muted-foreground opacity-40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Section 5: Restricted Area */}
      <section className="glass-card rounded-2xl border-red-500/30 dark:border-red-500/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-red-500/[0.03] pointer-events-none" />
        <div className="p-5 relative z-10">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
              <span className="material-symbols-outlined text-lg">warning</span>
            </div>
            <h2 className="text-base font-extrabold text-red-500 tracking-tight">Restricted Area</h2>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <h3 className="text-xs font-bold">Delete Account Data</h3>
              <p className="text-xs font-medium text-muted-foreground mt-1 max-w-xl leading-relaxed">
                Permanently purge all campaign logs, creatives, and analytical data. This process is irreversible.
              </p>
            </div>
            <button
              className="whitespace-nowrap px-5 py-2.5 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/40 text-red-500 rounded-xl text-xs font-bold transition-all focus:ring-4 focus:ring-red-500/20 disabled:opacity-50"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              data-testid="button-delete-data"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />}
              Delete my data
            </button>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <AlertDialogContent className="rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your campaign logs, creatives, settings, and analytical data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteData}
                    className="bg-red-500 hover:bg-red-600 text-white"
                    data-testid="button-confirm-delete"
                  >
                    Yes, delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>

      <footer className="mt-8 mb-6 text-center">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">&copy; 2025 Auto-ads Platform</p>
      </footer>
    </div>
  );
}
