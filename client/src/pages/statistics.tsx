import { useState, useMemo, useRef, useEffect } from "react";
import { TypewriterProgressBar } from "@/components/typewriter-progress-bar";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface BreakdownChild {
  breakdownValue: string;
  spend: string;
  impressions: number;
  cpm: string;
  clicks: number;
  ctr: string;
  cpc: string;
}

interface AdStats {
  id: string;
  name: string;
  status: string;
  adSetId: string;
  adSetName: string;
  spend: string;
  impressions: number;
  cpm: string;
  clicks: number;
  ctr: string;
  cpc: string;
  reach?: number;
  frequency?: string;
  roas?: number | null;
  purchases?: number;
  purchaseValue?: number;
  children?: BreakdownChild[];
  bodyBreakdown?: BreakdownChild[];
  titleBreakdown?: BreakdownChild[];
  descriptionBreakdown?: BreakdownChild[];
}

interface AdSetInfo {
  id: string;
  name: string;
  status: string;
  createdTime?: string | null;
  spend: string;
  impressions: number;
  clicks: number;
  ctr: string;
  cpc: string;
  cpm: string;
  reach: number;
  frequency: string;
  purchases: number;
  purchaseValue: number;
  roas: number | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface StatsResponse {
  campaign: Campaign;
  adSets: AdSetInfo[];
  ads: AdStats[];
  dateRange: string;
  breakdown: string;
}

type ViewLevel = "campaigns" | "adsets" | "ads";
type SortDir = "asc" | "desc";
type SortKey = "name" | "status" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "roas" | "purchases";

const STATS_LOADING_MESSAGES = [
  { after: 0, text: "Retrieving information from Meta..." },
  { after: 4, text: "Fetching campaign statistics..." },
  { after: 8, text: "Loading ad set performance data..." },
  { after: 14, text: "Analyzing ad metrics..." },
  { after: 22, text: "Calculating performance insights..." },
  { after: 35, text: "Processing large dataset..." },
  { after: 50, text: "Almost done, finalizing results..." },
];

const dateRangeOptions = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "maximum", label: "Lifetime" },
];

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "€0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(num);
}

function formatPercent(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00%";
  return num.toFixed(2) + "%";
}

function getStatusDot(status: string) {
  if (status === "ACTIVE") return "bg-emerald-500";
  if (status === "PAUSED") return "bg-amber-400";
  return "bg-slate-300 dark:bg-slate-600";
}

function sortRows<T>(rows: T[], sortKey: SortKey, sortDir: SortDir, getter: (row: T) => Record<string, any>): T[] {
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    let cmp = 0;
    if (sortKey === "name" || sortKey === "status") {
      cmp = (av[sortKey] || "").localeCompare(bv[sortKey] || "");
    } else {
      const na = parseFloat(av[sortKey] ?? "0") || 0;
      const nb = parseFloat(bv[sortKey] ?? "0") || 0;
      cmp = na - nb;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

const columns: { key: SortKey; label: string; align?: "right" | "left" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "impressions", label: "Impr.", align: "right" },
  { key: "clicks", label: "Clicks", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "cpc", label: "CPC", align: "right" },
  { key: "cpm", label: "CPM", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "purchases", label: "Purch.", align: "right" },
];

function SortHeader({ 
  col, sortKey, sortDir, onSort 
}: { 
  col: typeof columns[number]; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void 
}) {
  const active = sortKey === col.key;
  return (
    <th
      className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors hover:text-blue-500 ${
        col.align === "right" ? "text-right" : "text-left"
      } ${active ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"}`}
      onClick={() => onSort(col.key)}
      data-testid={`sort-${col.key}`}
    >
      <span className="inline-flex items-center gap-1">
        {col.label}
        {active && (
          <span className="material-symbols-outlined text-[14px]">
            {sortDir === "asc" ? "arrow_upward" : "arrow_downward"}
          </span>
        )}
      </span>
    </th>
  );
}

function MetricCell({ value, className = "" }: { value: string; className?: string }) {
  return (
    <td className={`px-3 py-2.5 text-right text-sm tabular-nums ${className}`}>
      {value}
    </td>
  );
}

function StatusCell({ status }: { status: string }) {
  return (
    <td className="px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(status)}`} />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{status}</span>
      </span>
    </td>
  );
}

function TotalsRow({ label, spend, impressions, clicks, ctr, roas, purchases }: {
  label: string; spend: number; impressions: number; clicks: number; ctr: number; roas?: number | null; purchases?: number;
}) {
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  return (
    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 font-semibold">
      <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200">{label}</td>
      <td className="px-3 py-2.5" />
      <MetricCell value={formatCurrency(spend)} className="font-semibold text-slate-800 dark:text-slate-100" />
      <MetricCell value={formatNumber(impressions)} className="text-slate-600 dark:text-slate-300" />
      <MetricCell value={formatNumber(clicks)} className="text-slate-600 dark:text-slate-300" />
      <MetricCell value={formatPercent(ctr)} className="text-emerald-600 dark:text-emerald-400" />
      <MetricCell value={formatCurrency(cpc)} className="text-slate-600 dark:text-slate-300" />
      <MetricCell value={formatCurrency(cpm)} className="text-slate-600 dark:text-slate-300" />
      <MetricCell value={roas != null ? `${roas.toFixed(2)}x` : "—"} className="text-slate-600 dark:text-slate-300" />
      <MetricCell value={purchases != null && purchases > 0 ? String(purchases) : "—"} className="text-slate-600 dark:text-slate-300" />
    </tr>
  );
}

function BreakdownLeaderboard({ items, color, label, icon }: {
  items: BreakdownChild[];
  color: string;
  label: string;
  icon: string;
}) {
  if (!items || items.length === 0) return null;
  const sorted = [...items].sort((a, b) => parseFloat(b.ctr) - parseFloat(a.ctr));
  const best = sorted[0];
  const maxSpend = Math.max(...sorted.map(c => parseFloat(c.spend)));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[16px] ${color}`}>{icon}</span>
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label} ({sorted.length})</h4>
      </div>
      <div className="space-y-1.5">
        {sorted.map((child, idx) => {
          const spendPct = maxSpend > 0 ? (parseFloat(child.spend) / maxSpend) * 100 : 0;
          return (
            <div
              key={idx}
              className="rounded-lg p-3 border transition-all bg-white/40 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/40"
              data-testid={`breakdown-${label.toLowerCase()}-${idx}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm leading-snug flex-1 line-clamp-2 text-slate-700 dark:text-slate-200">{child.breakdownValue}</p>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700/30 rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${spendPct}%`, background: "linear-gradient(90deg, #94A3B8, #CBD5E1)" }} />
              </div>
              <div className="grid grid-cols-6 gap-1 text-center text-[11px]">
                <div><span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatPercent(child.ctr)}</span><br /><span className="text-slate-400">CTR</span></div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(child.spend)}</span><br /><span className="text-slate-400">Spend</span></div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(child.impressions)}</span><br /><span className="text-slate-400">Impr.</span></div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(child.clicks)}</span><br /><span className="text-slate-400">Clicks</span></div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(child.cpc)}</span><br /><span className="text-slate-400">CPC</span></div>
                <div><span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(child.cpm)}</span><br /><span className="text-slate-400">CPM</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdDetailPopup({
  ad,
  isOpen,
  onClose,
  allAds,
}: {
  ad: AdStats | null;
  isOpen: boolean;
  onClose: () => void;
  allAds: AdStats[];
}) {
  if (!ad) return null;

  const spend = parseFloat(ad.spend);
  const adSetAds = allAds.filter(a => a.adSetId === ad.adSetId);
  const rank = [...adSetAds]
    .sort((a, b) => parseFloat(b.ctr) - parseFloat(a.ctr))
    .findIndex(a => a.id === ad.id) + 1;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto !rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-0 gap-0" aria-describedby="ad-detail-desc">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <DialogHeader className="space-y-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words" data-testid="dialog-ad-name">
                  {ad.name}
                </DialogTitle>
                <p id="ad-detail-desc" className="text-xs text-slate-400 mt-1" data-testid="dialog-adset-name">
                  {ad.adSetName} · #{rank} of {adSetAds.length}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 shrink-0 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(ad.status)}`} />
                <span className="text-[10px] font-semibold text-slate-500">{ad.status}</span>
              </span>
            </div>
          </DialogHeader>

        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: "Spend", value: formatCurrency(spend) },
              { label: "Impressions", value: formatNumber(ad.impressions) },
              { label: "Clicks", value: formatNumber(ad.clicks) },
              { label: "CTR", value: formatPercent(ad.ctr), highlight: true },
              { label: "CPC", value: formatCurrency(ad.cpc) },
              { label: "CPM", value: formatCurrency(ad.cpm) },
            ].map((m, idx) => (
              <div key={idx} className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5 text-center border border-slate-100 dark:border-slate-700/40" data-testid={`metric-${m.label.toLowerCase()}`}>
                <div className={`text-sm font-semibold ${m.highlight ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"}`}>{m.value}</div>
                <div className="text-[10px] text-slate-400">{m.label}</div>
              </div>
            ))}
          </div>

          {(ad.roas != null || (ad.purchases != null && ad.purchases > 0)) && (
            <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/40 dark:border-emerald-500/15 p-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400" data-testid="metric-roas">
                    {ad.roas != null ? `${ad.roas.toFixed(2)}x` : "N/A"}
                  </div>
                  <div className="text-[10px] text-slate-400">ROAS</div>
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-800 dark:text-slate-100" data-testid="metric-purchases">
                    {ad.purchases || 0}
                  </div>
                  <div className="text-[10px] text-slate-400">Purchases</div>
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-800 dark:text-slate-100" data-testid="metric-purchase-value">
                    {formatCurrency(ad.purchaseValue || 0)}
                  </div>
                  <div className="text-[10px] text-slate-400">Revenue</div>
                </div>
              </div>
            </div>
          )}

          <BreakdownLeaderboard items={ad.bodyBreakdown || []} color="text-blue-500" label="Primary Text" icon="description" />
          <BreakdownLeaderboard items={ad.titleBreakdown || []} color="text-emerald-500" label="Headline" icon="title" />
          <BreakdownLeaderboard items={ad.descriptionBreakdown || []} color="text-purple-500" label="Description" icon="notes" />

          {(!ad.bodyBreakdown || ad.bodyBreakdown.length === 0) && (!ad.titleBreakdown || ad.titleBreakdown.length === 0) && (!ad.descriptionBreakdown || ad.descriptionBreakdown.length === 0) && (
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40 p-6 text-center">
              <span className="material-symbols-outlined text-[28px] text-slate-300 dark:text-slate-600 block mb-2">description</span>
              <p className="text-xs text-slate-400">No text breakdown data — ads need multiple text variants for A/B testing breakdown.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Statistics() {
  const [viewLevel, setViewLevel] = useState<ViewLevel>("campaigns");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedAdSet, setSelectedAdSet] = useState<AdSetInfo | null>(null);
  const [selectedAd, setSelectedAd] = useState<AdStats | null>(null);
  const [dateRange, setDateRange] = useState("last_30d");
  const [adPopupOpen, setAdPopupOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<"all" | "ACTIVE" | "PAUSED">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const savedFiltersRef = useRef<Record<string, { searchQuery: string; statusFilter: "all" | "ACTIVE" | "PAUSED"; sortKey: SortKey; sortDir: SortDir }>>({});

  const { data: adAccountsData } = useQuery<{ data: any[]; selectedAdAccountId: string | null }>({
    queryKey: ["/api/meta/ad-accounts"],
  });
  const selectedAdAccountId = adAccountsData?.selectedAdAccountId || "";

  const prevAdAccountRef = useRef(selectedAdAccountId);
  useEffect(() => {
    if (prevAdAccountRef.current && selectedAdAccountId && prevAdAccountRef.current !== selectedAdAccountId) {
      setSelectedCampaign(null);
      setSelectedAdSet(null);
      setSelectedAd(null);
      setViewLevel("campaigns");
    }
    prevAdAccountRef.current = selectedAdAccountId;
  }, [selectedAdAccountId]);

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<{ data: Campaign[] }>({
    queryKey: ["/api/meta/campaigns", selectedAdAccountId, "live"],
    queryFn: async () => {
      const res = await fetch("/api/meta/campaigns?live=true");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    enabled: !!selectedAdAccountId,
  });

  const campaigns = campaignsData?.data || [];

  const statsUrl = selectedCampaign
    ? `/api/meta/ad-statistics/${selectedCampaign.id}?dateRange=${dateRange}&breakdown=body_asset&adSet=all`
    : null;

  const { data: statsData, isLoading: statsLoading, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ["/api/meta/ad-statistics", selectedAdAccountId, selectedCampaign?.id, dateRange],
    queryFn: async () => {
      const res = await fetch(statsUrl!);
      if (!res.ok) throw new Error("Failed to fetch statistics");
      return res.json();
    },
    enabled: !!selectedCampaign && !!statsUrl && !!selectedAdAccountId,
  });

  const ads = statsData?.ads || [];
  const rawAdSets = statsData?.adSets || [];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedCampaigns = useMemo(() => {
    let filtered = [...campaigns];
    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => {
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.name.localeCompare(b.name);
    });
  }, [campaigns, statusFilter, searchQuery]);

  const adSets = useMemo(() => {
    let filtered = [...rawAdSets];
    if (statusFilter !== "all") {
      filtered = filtered.filter(as => as.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(as => as.name.toLowerCase().includes(q));
    }
    return sortRows(filtered, sortKey, sortDir, (as) => as as any);
  }, [rawAdSets, sortKey, sortDir, statusFilter, searchQuery]);

  const currentAdSetAds = useMemo(() => {
    let filtered = selectedAdSet ? ads.filter(ad => ad.adSetId === selectedAdSet.id) : [];
    if (statusFilter !== "all") {
      filtered = filtered.filter(a => a.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => a.name.toLowerCase().includes(q));
    }
    return sortRows(filtered, sortKey, sortDir, (a) => a as any);
  }, [ads, selectedAdSet, sortKey, sortDir, statusFilter, searchQuery]);

  const totals = useMemo(() => {
    if (viewLevel === "ads") {
      const rows = currentAdSetAds;
      const spend = rows.reduce((s, a) => s + (parseFloat(a.spend) || 0), 0);
      const impressions = rows.reduce((s, a) => s + (a.impressions || 0), 0);
      const clicks = rows.reduce((s, a) => s + (a.clicks || 0), 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const purchases = rows.reduce((s, a) => s + (a.purchases || 0), 0);
      const purchaseValue = rows.reduce((s, a) => s + (a.purchaseValue || 0), 0);
      const roas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : null;
      return { spend, impressions, clicks, ctr, purchases, roas };
    }
    const spend = adSets.reduce((s, as) => s + (parseFloat(as.spend) || 0), 0);
    const impressions = adSets.reduce((s, as) => s + (as.impressions || 0), 0);
    const clicks = adSets.reduce((s, as) => s + (as.clicks || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const purchases = adSets.reduce((s, as) => s + (as.purchases || 0), 0);
    const purchaseValue = adSets.reduce((s, as) => s + (as.purchaseValue || 0), 0);
    const roas = spend > 0 && purchaseValue > 0 ? purchaseValue / spend : null;
    return { spend, impressions, clicks, ctr, purchases, roas };
  }, [adSets, viewLevel, currentAdSetAds]);

  const saveCurrentFilters = (level: string) => {
    savedFiltersRef.current[level] = { searchQuery, statusFilter, sortKey, sortDir };
  };

  const restoreFilters = (level: string) => {
    const saved = savedFiltersRef.current[level];
    if (saved) {
      setSearchQuery(saved.searchQuery);
      setStatusFilter(saved.statusFilter);
      setSortKey(saved.sortKey);
      setSortDir(saved.sortDir);
    } else {
      setSearchQuery("");
      setStatusFilter("all");
      setSortKey("name");
      setSortDir("asc");
    }
  };

  const handleCampaignClick = (campaign: Campaign) => {
    saveCurrentFilters("campaigns");
    setSelectedCampaign(campaign);
    setSelectedAdSet(null);
    setViewLevel("adsets");
    restoreFilters("adsets");
  };

  const handleAdSetClick = (adSet: AdSetInfo) => {
    saveCurrentFilters("adsets");
    setSelectedAdSet(adSet);
    setViewLevel("ads");
    restoreFilters("ads");
  };

  const handleAdClick = (ad: AdStats) => {
    setSelectedAd(ad);
    setAdPopupOpen(true);
  };

  const handleBack = () => {
    if (viewLevel === "ads") {
      saveCurrentFilters("ads");
      setSelectedAdSet(null);
      setViewLevel("adsets");
      restoreFilters("adsets");
    } else if (viewLevel === "adsets") {
      saveCurrentFilters("adsets");
      setSelectedCampaign(null);
      setSelectedAdSet(null);
      setViewLevel("campaigns");
      restoreFilters("campaigns");
    }
  };

  const breadcrumb = useMemo(() => {
    const parts: { label: string; onClick?: () => void }[] = [];
    if (selectedCampaign) {
      parts.push({
        label: selectedCampaign.name,
        onClick: viewLevel === "ads" ? () => { saveCurrentFilters("ads"); setSelectedAdSet(null); setViewLevel("adsets"); restoreFilters("adsets"); } : undefined,
      });
    }
    if (selectedAdSet) {
      parts.push({ label: selectedAdSet.name });
    }
    return parts;
  }, [selectedCampaign, selectedAdSet, viewLevel, searchQuery, statusFilter, sortKey, sortDir]);

  if (campaignsLoading) {
    return (
      <div className="p-4 max-w-[1400px] mx-auto">
        <TypewriterProgressBar
          messages={STATS_LOADING_MESSAGES}
          estimatedTotal={20}
        />
      </div>
    );
  }

  const isLoading = statsLoading || isFetching;

  return (
    <div className="p-4 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {viewLevel !== "campaigns" && (
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 text-slate-500 hover:text-blue-500 transition-all"
              onClick={handleBack}
              data-testid="button-back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
          )}
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white" data-testid="text-page-title">
              {viewLevel === "campaigns" ? "Campaigns" : viewLevel === "adsets" ? "Ad Sets" : "Ads"}
              {(searchQuery || statusFilter !== "all") && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  ({viewLevel === "campaigns" ? sortedCampaigns.length : viewLevel === "adsets" ? adSets.length : currentAdSetAds.length} shown)
                </span>
              )}
            </h1>
            {breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                {breadcrumb.map((part, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {idx > 0 && <span className="material-symbols-outlined text-[12px]">chevron_right</span>}
                    {part.onClick ? (
                      <button onClick={part.onClick} className="hover:text-blue-500 transition-colors truncate max-w-[200px]">{part.label}</button>
                    ) : (
                      <span className="truncate max-w-[200px]">{part.label}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="material-symbols-outlined text-[16px] text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
            <Input
              type="text"
              placeholder={viewLevel === "campaigns" ? "Search campaigns..." : viewLevel === "adsets" ? "Search ad sets..." : "Search ads..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-[180px] text-xs rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 pl-8 pr-7"
              data-testid="input-search"
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "ACTIVE" | "PAUSED")}>
            <SelectTrigger className="w-[110px] h-8 text-xs rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
            </SelectContent>
          </Select>

          {viewLevel !== "campaigns" && (
            <>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateRangeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-300 text-slate-500 hover:text-blue-500 transition-all"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh-stats"
              >
                <span className={`material-symbols-outlined text-[18px] ${isFetching ? "animate-spin" : ""}`}>refresh</span>
              </button>
            </>
          )}
        </div>
      </div>

      {viewLevel === "campaigns" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          {sortedCampaigns.length === 0 ? (
            <div className="p-10 text-center">
              <span className="material-symbols-outlined text-[36px] text-slate-200 dark:text-slate-700 block mb-2">
                {(searchQuery || statusFilter !== "all") ? "filter_list_off" : "bar_chart"}
              </span>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400" data-testid="text-no-campaigns">
                {(searchQuery || statusFilter !== "all") ? "No campaigns match your filters" : "No campaigns found"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {(searchQuery || statusFilter !== "all")
                  ? "Try adjusting your search or status filter."
                  : "Create your first campaign to view statistics."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-blue-50/30 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group"
                  onClick={() => handleCampaignClick(campaign)}
                  data-testid={`row-campaign-${campaign.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#1877F2] text-[18px]">campaign</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" data-testid={`text-campaign-name-${campaign.id}`}>
                        {campaign.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(campaign.status)}`} />
                        <span className="text-[10px] text-slate-400">{campaign.status}</span>
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-slate-300 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5">chevron_right</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewLevel !== "campaigns" && (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm relative">
        {isLoading ? (
          <div className="p-4">
            <TypewriterProgressBar
              messages={STATS_LOADING_MESSAGES}
              estimatedTotal={30}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="stats-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  {columns.map((col) => (
                    <SortHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>

                {viewLevel === "adsets" && (
                  <>
                    {adSets.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-10 text-center">
                          <span className="material-symbols-outlined text-[36px] text-slate-200 dark:text-slate-700 block mb-2">
                            {(searchQuery || statusFilter !== "all") ? "filter_list_off" : "bar_chart"}
                          </span>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {(searchQuery || statusFilter !== "all") ? "No ad sets match your filters" : "No ad sets found"}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {adSets.map((adSet) => {
                          const adCount = ads.filter(a => a.adSetId === adSet.id).length;
                          const bestRoas = adSet.roas != null && adSet.roas > 2;
                          return (
                            <tr
                              key={adSet.id}
                              className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group"
                              onClick={() => handleAdSetClick(adSet)}
                              data-testid={`row-adset-${adSet.id}`}
                            >
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate max-w-[280px] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" data-testid={`text-adset-name-${adSet.id}`}>
                                      {adSet.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{adCount} ad{adCount !== 1 ? "s" : ""}</p>
                                  </div>
                                  <span className="material-symbols-outlined text-[16px] text-slate-300 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5">chevron_right</span>
                                </div>
                              </td>
                              <StatusCell status={adSet.status} />
                              <MetricCell value={formatCurrency(adSet.spend)} className="text-slate-700 dark:text-slate-200 font-medium" />
                              <MetricCell value={formatNumber(adSet.impressions)} className="text-slate-600 dark:text-slate-300" />
                              <MetricCell value={formatNumber(adSet.clicks)} className="text-slate-600 dark:text-slate-300" />
                              <MetricCell value={formatPercent(adSet.ctr)} className="text-emerald-600 dark:text-emerald-400" />
                              <MetricCell value={formatCurrency(adSet.cpc)} className="text-slate-600 dark:text-slate-300" />
                              <MetricCell value={formatCurrency(adSet.cpm)} className="text-slate-600 dark:text-slate-300" />
                              <MetricCell
                                value={adSet.roas != null ? `${adSet.roas.toFixed(2)}x` : "—"}
                                className={bestRoas ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-500 dark:text-slate-400"}
                              />
                              <MetricCell
                                value={adSet.purchases > 0 ? String(adSet.purchases) : "—"}
                                className={adSet.purchases > 0 ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400"}
                              />
                            </tr>
                          );
                        })}
                        <TotalsRow
                          label={`Total (${adSets.length} ad sets)`}
                          spend={totals.spend}
                          impressions={totals.impressions}
                          clicks={totals.clicks}
                          ctr={totals.ctr}
                          roas={totals.roas}
                          purchases={totals.purchases}
                        />
                      </>
                    )}
                  </>
                )}

                {viewLevel === "ads" && (
                  <>
                    {currentAdSetAds.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-10 text-center">
                          <span className="material-symbols-outlined text-[36px] text-slate-200 dark:text-slate-700 block mb-2">
                            {(searchQuery || statusFilter !== "all") ? "filter_list_off" : "bar_chart"}
                          </span>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            {(searchQuery || statusFilter !== "all") ? "No ads match your filters" : "No ads found"}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {(() => {
                          return currentAdSetAds.map((ad) => {
                            const hasBreakdown = (ad.bodyBreakdown && ad.bodyBreakdown.length > 0) || (ad.titleBreakdown && ad.titleBreakdown.length > 0);
                            return (
                              <tr
                                key={ad.id}
                                className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group"
                                onClick={() => handleAdClick(ad)}
                                data-testid={`row-ad-${ad.id}`}
                              >
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate max-w-[250px] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" data-testid={`text-ad-name-${ad.id}`}>
                                          {ad.name}
                                        </p>
                                        {hasBreakdown && (
                                          <span className="material-symbols-outlined text-[14px] text-blue-400" title="Has text breakdowns">description</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <StatusCell status={ad.status} />
                                <MetricCell value={formatCurrency(ad.spend)} className="text-slate-700 dark:text-slate-200 font-medium" />
                                <MetricCell value={formatNumber(ad.impressions)} className="text-slate-600 dark:text-slate-300" />
                                <MetricCell value={formatNumber(ad.clicks)} className="text-slate-600 dark:text-slate-300" />
                                <MetricCell value={formatPercent(ad.ctr)} className="text-emerald-600 dark:text-emerald-400" />
                                <MetricCell value={formatCurrency(ad.cpc)} className="text-slate-600 dark:text-slate-300" />
                                <MetricCell value={formatCurrency(ad.cpm)} className="text-slate-600 dark:text-slate-300" />
                                <MetricCell
                                  value={ad.roas != null ? `${ad.roas.toFixed(2)}x` : "—"}
                                  className={ad.roas != null && ad.roas > 2 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-slate-500 dark:text-slate-400"}
                                />
                                <MetricCell
                                  value={ad.purchases && ad.purchases > 0 ? String(ad.purchases) : "—"}
                                  className={ad.purchases && ad.purchases > 0 ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400"}
                                />
                              </tr>
                            );
                          });
                        })()}
                        <TotalsRow
                          label={`Total (${currentAdSetAds.length} ads)`}
                          spend={totals.spend}
                          impressions={totals.impressions}
                          clicks={totals.clicks}
                          ctr={totals.ctr}
                          roas={selectedAdSet?.roas}
                          purchases={totals.purchases}
                        />
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <AdDetailPopup
        ad={selectedAd}
        isOpen={adPopupOpen}
        onClose={() => {
          setAdPopupOpen(false);
          setSelectedAd(null);
        }}
        allAds={currentAdSetAds}
      />
    </div>
  );
}
