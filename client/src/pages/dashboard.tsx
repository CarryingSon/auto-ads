import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SpendCpaChart = lazy(() => import("@/components/spend-cpa-chart"));

function WaveLoadingDots({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : size === "lg" ? "w-3 h-3" : "w-2 h-2";
  const gap = size === "sm" ? "gap-1" : size === "lg" ? "gap-2" : "gap-1.5";
  const bounce = size === "sm" ? "-4px" : size === "lg" ? "-8px" : "-6px";
  return (
    <span className={`inline-flex items-center ${gap}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dotSize} rounded-full bg-primary`}
          style={{
            animation: `waveDot 1.2s ease-in-out ${i * 0.15}s infinite`,
            ["--wave-bounce" as string]: bounce,
          }}
        />
      ))}
      <style>{`
        @keyframes waveDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(var(--wave-bounce, -6px)); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

interface InsightData {
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  date_start?: string;
  date_stop?: string;
}

interface InsightsResponse {
  data: InsightData | InsightData[];
  source: string;
  activeAdsCount?: number;
  dailyInsights?: InsightData[];
  previousPeriod?: InsightData;
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState("last_7d");

  const { data: adAccountsData } = useQuery<{ data: any[]; selectedAdAccountId: string | null }>({
    queryKey: ["/api/meta/ad-accounts"],
  });
  const selectedAdAccountId = adAccountsData?.selectedAdAccountId || "";

  const { data: insightsData, isLoading: insightsLoading } = useQuery<InsightsResponse>({
    queryKey: ["/api/meta/insights", selectedAdAccountId, dateRange],
    queryFn: async () => {
      const res = await fetch(`/api/meta/insights?live=true&datePreset=${dateRange}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
    enabled: !!selectedAdAccountId,
  });

  const insights = Array.isArray(insightsData?.data) ? insightsData.data[0] : insightsData?.data;
  const activeAdsCount = insightsData?.activeAdsCount || 0;
  const previousPeriod = insightsData?.previousPeriod;

  const getActionValue = (actionType: string, data?: InsightData): number => {
    const source = data || insights;
    if (!source?.actions) return 0;
    const action = source.actions.find(a => a.action_type === actionType);
    return action ? parseInt(action.value, 10) : 0;
  };

  const getCostPerAction = (actionType: string, data?: InsightData): number => {
    const source = data || insights;
    if (!source?.cost_per_action_type) return 0;
    const cost = source.cost_per_action_type.find(a => a.action_type === actionType);
    return cost ? parseFloat(cost.value) : 0;
  };

  const purchases = getActionValue("purchase") || getActionValue("omni_purchase");
  const spend = insights?.spend ? parseFloat(insights.spend) : 0;
  const impressions = insights?.impressions ? parseInt(insights.impressions, 10) : 0;
  
  let cpa = getCostPerAction("purchase") || getCostPerAction("omni_purchase");
  if (cpa === 0 && purchases > 0 && spend > 0) {
    cpa = spend / purchases;
  }

  const prevPurchases = previousPeriod ? (getActionValue("purchase", previousPeriod) || getActionValue("omni_purchase", previousPeriod)) : 0;
  const prevSpend = previousPeriod?.spend ? parseFloat(previousPeriod.spend) : 0;
  let prevCpa = previousPeriod ? (getCostPerAction("purchase", previousPeriod) || getCostPerAction("omni_purchase", previousPeriod)) : 0;
  if (prevCpa === 0 && prevPurchases > 0 && prevSpend > 0) {
    prevCpa = prevSpend / prevPurchases;
  }

  const calcChange = (current: number, previous: number): { value: number; isPositive: boolean } => {
    if (previous === 0) return { value: 0, isPositive: true };
    const change = ((current - previous) / previous) * 100;
    return { value: Math.abs(change), isPositive: change >= 0 };
  };

  const purchaseChange = calcChange(purchases, prevPurchases);
  const spendChange = calcChange(spend, prevSpend);
  const cpaChange = calcChange(cpa, prevCpa);

  const dailyInsights = insightsData?.dailyInsights || [];
  const chartData = dailyInsights.map((day) => {
    const daySpend = day.spend ? parseFloat(day.spend) : 0;
    const dayPurchases = day.actions?.find(a => a.action_type === "purchase" || a.action_type === "omni_purchase");
    const dayPurchaseCount = dayPurchases ? parseInt(dayPurchases.value, 10) : 0;
    let dayCpa = day.cost_per_action_type?.find(a => a.action_type === "purchase" || a.action_type === "omni_purchase");
    let dayCpaValue = dayCpa ? parseFloat(dayCpa.value) : 0;
    if (dayCpaValue === 0 && dayPurchaseCount > 0 && daySpend > 0) {
      dayCpaValue = daySpend / dayPurchaseCount;
    }
    
    const dateStr = day.date_start || "";
    const date = new Date(dateStr);
    const formattedDate = isNaN(date.getTime()) ? dateStr : `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    
    return {
      name: formattedDate,
      spend: daySpend,
      cpa: dayCpaValue
    };
  });

  const dateRangeLabel: Record<string, string> = {
    last_7d: "Last 7 days",
    last_14d: "Last 14 days",
    last_30d: "Last 30 days",
    this_month: "This month",
    last_month: "Last month",
  };

  const hasData = spend > 0 || impressions > 0 || purchases > 0;

  const kpis = [
    {
      title: "Active Creatives",
      value: insightsLoading ? null : activeAdsCount.toString(),
      icon: "upload",
      subtitle: `Active ads in ${dateRangeLabel[dateRange].toLowerCase()}`,
      change: null as { value: number; isPositive: boolean } | null,
      invertColors: false,
    },
    {
      title: "Complete Purchases",
      value: insightsLoading ? null : purchases.toString(),
      icon: "shopping_cart",
      subtitle: prevPurchases > 0 ? `${purchases - prevPurchases >= 0 ? '+' : ''}${purchases - prevPurchases} from previous period` : undefined,
      change: purchaseChange,
      invertColors: false,
      progressBar: true,
    },
    {
      title: "Cost Per Acquisition",
      value: insightsLoading ? null : `€${cpa.toFixed(2)}`,
      icon: "attach_money",
      subtitle: prevCpa > 0 ? `${cpa - prevCpa >= 0 ? '+' : ''}€${(cpa - prevCpa).toFixed(2)} from previous period` : undefined,
      change: cpaChange,
      invertColors: true,
    },
    {
      title: "Ad Spend",
      value: insightsLoading ? null : `€${spend.toFixed(2)}`,
      icon: "bar_chart",
      subtitle: prevSpend > 0 ? `+€${(spend - prevSpend).toFixed(2)} from previous period` : undefined,
      change: spendChange,
      invertColors: false,
    },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-1" data-testid="text-page-title">Dashboard Overview</h2>
          <p className="text-muted-foreground text-sm">Overview of your ad creative performance</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px] h-11 rounded-xl glass-card border-white/40 dark:border-white/10 font-medium text-foreground" data-testid="select-date-range">
              <span className="material-symbols-outlined text-muted-foreground text-lg mr-2">calendar_today</span>
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7d">Last 7 days</SelectItem>
              <SelectItem value="last_14d">Last 14 days</SelectItem>
              <SelectItem value="last_30d">Last 30 days</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => {
          const isPositive = kpi.invertColors ? !kpi.change?.isPositive : kpi.change?.isPositive;
          return (
            <div
              key={kpi.title}
              className="glass-card rounded-2xl p-6 hover:translate-y-[-2px] transition-transform duration-300"
              data-testid={`card-kpi-${kpi.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">{kpi.title}</h3>
                <span className="material-symbols-outlined text-muted-foreground text-lg">{kpi.icon}</span>
              </div>
              <div className="flex flex-col">
                {kpi.value === null ? (
                  <div className="mb-1"><WaveLoadingDots size="sm" /></div>
                ) : (
                  <span className="text-3xl font-bold text-foreground mb-1">{kpi.value}</span>
                )}
                {kpi.change && kpi.change.value > 0 ? (
                  <div className="flex items-center mt-1">
                    <span className={`material-symbols-outlined text-xs mr-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {isPositive ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                    <span className={`text-xs font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                      {kpi.change.value.toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">vs last period</span>
                  </div>
                ) : kpi.subtitle ? (
                  <span className="text-xs text-muted-foreground">{kpi.subtitle}</span>
                ) : null}

                {kpi.progressBar && (
                  <div className="h-1 w-full mt-2 bg-gradient-to-r from-green-400/20 to-green-500/0 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, purchases > 0 ? Math.max(15, Math.min(100, purchases * 3)) : 0)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Performance Chart */}
      <div className="glass-panel rounded-3xl p-6 lg:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">Ad Performance</h3>
            <p className="text-sm text-muted-foreground">Spend and cost per acquisition</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <span className="text-sm text-muted-foreground">Ad Spend</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
              <span className="text-sm text-muted-foreground">CPA</span>
            </div>
          </div>
        </div>

        {!hasData && !insightsLoading ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            No data available for the selected date range
          </div>
        ) : insightsLoading ? (
          <div className="flex flex-col items-center justify-center h-[300px] gap-3">
            <WaveLoadingDots size="lg" />
            <span className="text-xs text-muted-foreground">Loading performance data</span>
          </div>
        ) : (
          <div className="h-[300px]">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <WaveLoadingDots size="lg" />
                </div>
              }
            >
              <SpendCpaChart
                data={chartData.length > 0 ? chartData : [{ name: dateRangeLabel[dateRange], spend: spend, cpa: cpa }]}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
