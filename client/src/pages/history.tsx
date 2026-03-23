import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, ChevronDown, ChevronRight, Clock, Image, Film, Layers } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BulkUploadJob } from "@shared/schema";

type JobWithAssets = BulkUploadJob & {
  assetCount?: number;
  videoAssetCount?: number;
  imageAssetCount?: number;
  queueId?: string | null;
  queueStatus?: string | null;
  queueAttempts?: number;
  nextRunAt?: string | null;
  queueError?: string | null;
};

interface UploadBatch {
  date: Date;
  adAccountId: string;
  adAccountName: string;
  adsLaunched: number;
  mediaCount: number;
  mediaType: "video" | "image" | "mixed";
  timeSaved: number;
  totalAssets: number;
  totalVideoAssets: number;
  totalImageAssets: number;
  jobs: JobWithAssets[];
}

function formatDuration(startDate: Date | string, endDate: Date | string | null): string {
  if (!endDate) return "—";
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diffMs = end - start;
  if (diffMs < 0) return "—";
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

const IN_PROGRESS_STATUSES = ["queued", "processing", "retrying", "validating", "uploading", "creating_campaign", "creating_adsets", "uploading_creatives", "creating_ads", "scheduled"];

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending": return "Pending";
    case "queued": return "Queued";
    case "processing": return "Processing";
    case "retrying": return "Retrying";
    case "validating": return "Validating";
    case "uploading": return "Uploading";
    case "creating_campaign": return "Creating Campaign";
    case "creating_adsets": return "Creating Ad Sets";
    case "uploading_creatives": return "Uploading Creatives";
    case "creating_ads": return "Creating Ads";
    case "scheduled": return "Scheduled";
    case "failed": return "Failed";
    case "completed": return "Completed";
    case "error": return "Error";
    case "done": return "Done";
    default: return status;
  }
}

function getStatusColor(status: string): string {
  if (status === "error" || status === "failed") return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
  if (status === "done" || status === "completed") return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
  if (status === "retrying") return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800";
  if (status === "scheduled") return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
  return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
}

function getProgressPercent(job: BulkUploadJob): number {
  const total = job.totalAds || 0;
  const completed = job.completedAds || 0;
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export default function History() {
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [mediaFilter, setMediaFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const [expandedQueueJob, setExpandedQueueJob] = useState<string | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      setDeletingJobId(jobId);
      await apiRequest("DELETE", `/api/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Job deleted", description: "The job has been removed from the queue." });
      setDeletingJobId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete the job.", variant: "destructive" });
      setDeletingJobId(null);
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/jobs/bulk/queue");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Queue cleared", description: "All queue items have been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear the queue.", variant: "destructive" });
    },
  });
  
  const { data: jobs = [], isLoading } = useQuery<JobWithAssets[]>({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000,
  });

  const completedJobs = jobs.filter(j => j.status === "done" || j.status === "completed");
  const queueJobs = jobs.filter((j) => {
    if (j.queueStatus) {
      return ["queued", "processing", "retrying", "failed"].includes(j.queueStatus);
    }

    if (j.status === "draft" || j.status === "pending") {
      return false;
    }

    return IN_PROGRESS_STATUSES.includes(j.status) || j.status === "error" || j.status === "failed";
  });
  
  const totalAdsLaunched = completedJobs.reduce((sum, j) => sum + (j.totalAds || 0), 0);
  const last30DaysJobs = completedJobs.filter(j => {
    const jobDate = new Date(j.createdAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return jobDate >= thirtyDaysAgo;
  });
  const latestAdsLaunched = last30DaysJobs.reduce((sum, j) => sum + (j.totalAds || 0), 0);
  const totalTimeSaved = totalAdsLaunched * 2;
  
  const batches = useMemo(() => {
    const batchMap = new Map<string, UploadBatch>();
    
    completedJobs.forEach(job => {
      const date = new Date(job.createdAt);
      const hourKey = `${date.toDateString()}-${date.getHours()}-${job.adAccountId || 'unknown'}`;
      
      if (!batchMap.has(hourKey)) {
        batchMap.set(hourKey, {
          date,
          adAccountId: job.adAccountId || 'unknown',
          adAccountName: (job as any).adAccountName || job.adAccountId || 'Unknown',
          adsLaunched: 0,
          mediaCount: 0,
          mediaType: "image",
          timeSaved: 0,
          totalAssets: 0,
          totalVideoAssets: 0,
          totalImageAssets: 0,
          jobs: [],
        });
      }
      
      const batch = batchMap.get(hourKey)!;
      batch.adsLaunched += job.totalAds || 0;
      batch.mediaCount += job.totalAdSets || 0;
      batch.timeSaved += (job.totalAds || 0) * 2;
      batch.totalAssets += job.assetCount || 0;
      batch.totalVideoAssets += job.videoAssetCount || 0;
      batch.totalImageAssets += job.imageAssetCount || 0;
      batch.jobs.push(job);
    });
    
    batchMap.forEach(batch => {
      let hasVideo = false;
      let hasImage = false;
      
      batch.jobs.forEach(job => {
        const folderName = (job.driveRootFolderName || job.campaignName || '').toLowerCase();
        if (folderName.includes('video') || folderName.includes('vid')) {
          hasVideo = true;
        } else {
          hasImage = true;
        }
      });
      
      if (hasVideo && hasImage) {
        batch.mediaType = "mixed";
      } else if (hasVideo) {
        batch.mediaType = "video";
      } else {
        batch.mediaType = "image";
      }
    });
    
    return Array.from(batchMap.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [completedJobs]);
  
  const uniqueAccounts = useMemo(() => {
    const accounts = new Map<string, string>();
    completedJobs.forEach(job => {
      if (job.adAccountId) {
        accounts.set(job.adAccountId, (job as any).adAccountName || job.adAccountId);
      }
    });
    return Array.from(accounts.entries());
  }, [completedJobs]);
  
  const filteredBatches = useMemo(() => {
    return batches.filter(batch => {
      if (accountFilter !== "all" && batch.adAccountId !== accountFilter) return false;
      if (mediaFilter !== "all" && batch.mediaType !== mediaFilter) return false;
      return true;
    });
  }, [batches, accountFilter, mediaFilter]);

  const displayedBatches = showAll ? filteredBatches : filteredBatches.slice(0, 10);
  
  const chartData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const dayJobs = completedJobs.filter(job => {
        const jobDate = new Date(job.createdAt);
        return jobDate.toDateString() === date.toDateString();
      });
      
      days.push({
        date: dateStr,
        count: dayJobs.reduce((sum, j) => sum + (j.totalAds || 0), 0),
      });
    }
    return days;
  }, [completedJobs]);
  
  const maxChartValue = Math.max(...chartData.map(d => d.count), 1);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight" data-testid="text-page-title">History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Upload history and performance overview</p>
        </div>
        <Link href="/bulk-ads">
          <Button 
            className="bg-[#1877F2] hover:bg-[#1565C0] text-white px-5 h-9 rounded-xl text-xs font-semibold shadow-md shadow-[#1877F2]/20 hover:shadow-[#1877F2]/30 transition-all"
            data-testid="button-new-upload"
          >
            <span className="material-symbols-outlined text-sm mr-1.5">upload</span>
            New Upload
          </Button>
        </Link>
      </header>

      {isLoading ? (
        <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1877F2]" />
        </div>
      ) : (
        <>
          {/* Queue Section */}
          {queueJobs.length > 0 && (
            <div className="glass-panel rounded-xl overflow-hidden" data-testid="section-queue">
              <div className="p-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1877F2] text-lg">queue</span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">Queue</h3>
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#1877F2]/10 text-[#1877F2] text-[10px] font-bold border border-[#1877F2]/20" data-testid="badge-queue-count">
                      {queueJobs.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 dark:text-red-400"
                    data-testid="button-clear-queue"
                    disabled={clearQueueMutation.isPending}
                    onClick={() => clearQueueMutation.mutate()}
                  >
                    {clearQueueMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                    Clear All
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jobs currently in progress or waiting</p>
              </div>
              <div className="divide-y divide-slate-200/50 dark:divide-white/5">
                {queueJobs.map((job) => {
                  const isExpanded = expandedQueueJob === job.id;
                  const progress = getProgressPercent(job);
                  
                  return (
                    <div key={job.id} data-testid={`queue-job-${job.id}`}>
                      <div
                        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover-elevate transition-colors"
                        onClick={() => setExpandedQueueJob(isExpanded ? null : job.id)}
                        data-testid={`queue-job-row-${job.id}`}
                      >
                        <span className={`material-symbols-outlined text-sm text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          chevron_right
                        </span>
                        
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${getStatusColor(job.status)}`} data-testid={`queue-status-${job.id}`}>
                          {job.status !== "done" && job.status !== "completed" && job.status !== "error" && job.status !== "failed" && job.status !== "scheduled" && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                          )}
                          {getStatusLabel(job.status)}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" data-testid={`queue-campaign-${job.id}`}>
                            {job.campaignName || job.driveRootFolderName || "Untitled Campaign"}
                          </p>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                          <span className="flex items-center gap-1" data-testid={`queue-creatives-${job.id}`}>
                            <span className="material-symbols-outlined text-[14px]">collections</span>
                            {job.completedAds || 0}/{job.totalAds || 0} ads
                          </span>
                          <span className="flex items-center gap-1" data-testid={`queue-adsets-${job.id}`}>
                            <span className="material-symbols-outlined text-[14px]">folder</span>
                            {job.totalAdSets || 0} ad sets
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-slate-400 dark:text-slate-500"
                            data-testid={`button-delete-job-${job.id}`}
                            disabled={deletingJobId === job.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteJobMutation.mutate(job.id);
                            }}
                          >
                            {deletingJobId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 ml-7 mr-4" data-testid={`queue-details-${job.id}`}>
                          <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-4 space-y-3 border border-slate-200/50 dark:border-white/10">
                            {/* Progress bar */}
                            {job.totalAds && job.totalAds > 0 && (
                              <div>
                                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                                  <span>Progress</span>
                                  <span>{progress}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-[#1877F2] rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Ad Sets</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`detail-adsets-${job.id}`}>
                                  {job.completedAdSets || 0} / {job.totalAdSets || 0}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Ads Created</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`detail-ads-${job.id}`}>
                                  {job.completedAds || 0} / {job.totalAds || 0}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Started</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {new Date(job.createdAt).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                                  })}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Upload Mode</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {job.adUploadMode === "dynamic" ? "Dynamic" : "Single"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Drive Folder</p>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                  {job.driveRootFolderName || "—"}
                                </p>
                              </div>
                            </div>

                            {job.errorMessage && (
                              <div className="p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Error: {job.errorMessage}</p>
                              </div>
                            )}

                            {job.logs && (job.logs as string[]).length > 0 && (
                              <div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                                  Terminal Output ({(job.logs as string[]).length} lines)
                                </p>
                                <div className="bg-slate-950 text-slate-100 rounded-md p-3 max-h-72 overflow-y-auto border border-slate-700/70">
                                  {(job.logs as string[]).map((log, i) => (
                                    <p key={i} className="text-[11px] leading-5 font-mono whitespace-pre-wrap break-words">
                                      {log}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="glass-panel p-4 rounded-xl relative overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300">
              <div className="flex justify-between items-start mb-1 relative z-10">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Ads Launched</p>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-base">file_upload</span>
              </div>
              <div className="relative z-10">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white drop-shadow-sm" data-testid="text-total-ads">{totalAdsLaunched}</h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Launched via Auto-ads</p>
              </div>
              <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-[#1877F2]/10 rounded-full blur-xl group-hover:bg-[#1877F2]/20 transition-colors" />
            </div>

            <div className="glass-panel p-4 rounded-xl relative overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300">
              <div className="flex justify-between items-start mb-1 relative z-10">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Latest Ads Launched</p>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-base">bar_chart</span>
              </div>
              <div className="relative z-10">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white drop-shadow-sm" data-testid="text-latest-ads">{latestAdsLaunched}</h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Created in past 30 days</p>
              </div>
              <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-colors" />
            </div>

            <div className="glass-panel p-4 rounded-xl relative overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300">
              <div className="flex justify-between items-start mb-1 relative z-10">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Time Saved</p>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-base">schedule</span>
              </div>
              <div className="relative z-10">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white drop-shadow-sm" data-testid="text-time-saved">
                  {totalTimeSaved} <span className="text-lg font-semibold text-slate-400">min</span>
                </h2>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Estimated productivity gain</p>
              </div>
              <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors" />
            </div>
          </div>

          {/* Upload Activity Chart */}
          <div className="glass-panel p-4 rounded-xl">
            <div className="mb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Upload Activity</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ads launched over time</p>
            </div>
            <div className="h-36 w-full flex items-end gap-3 relative pl-7 pb-5">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-500 pb-5 pr-1">
                <span>{maxChartValue}</span>
                <span>{Math.floor(maxChartValue / 2)}</span>
                <span>0</span>
              </div>
              {/* Grid lines */}
              <div className="absolute inset-0 pb-5 pl-7 flex flex-col justify-between pointer-events-none z-0">
                <div className="w-full h-px border-t border-dashed border-slate-300 dark:border-slate-700 opacity-50" />
                <div className="w-full h-px border-t border-dashed border-slate-300 dark:border-slate-700 opacity-50" />
                <div className="w-full h-px border-b border-slate-300 dark:border-slate-700 opacity-50" />
              </div>
              {/* Bars */}
              <div className="flex-1 h-full flex items-end justify-between z-10 pl-1">
                {chartData.map((day, idx) => {
                  const barHeight = day.count > 0 
                    ? Math.max((day.count / maxChartValue) * 120, 3) 
                    : 3;
                  const isActive = day.count > 3;
                  
                  return (
                    <div key={idx} className="w-full mx-1 flex flex-col justify-end group cursor-pointer">
                      <div 
                        className={`rounded-t-lg transition-all duration-500 relative ${
                          isActive 
                            ? "bg-[#1877F2] shadow-[0_0_15px_rgba(24,119,242,0.4)] group-hover:shadow-[0_0_20px_rgba(24,119,242,0.6)]" 
                            : "bg-[#1877F2]/20 group-hover:bg-[#1877F2]/40"
                        }`}
                        style={{ height: `${barHeight}px` }}
                        data-testid={`bar-chart-${idx}`}
                      >
                        <div className="invisible group-hover:visible absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-20">
                          {day.count}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">{day.date}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Upload Batches Table */}
          <div className="glass-panel rounded-xl overflow-hidden pb-2">
            <div className="p-4 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200/50 dark:border-white/5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Upload Batches</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Grouped by upload hour across all ad accounts</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger 
                    className="w-[160px] h-8 bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:shadow transition-all" 
                    data-testid="select-account-filter"
                  >
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Accounts</SelectItem>
                    {uniqueAccounts.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={mediaFilter} onValueChange={setMediaFilter}>
                  <SelectTrigger 
                    className="w-[140px] h-8 bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:shadow transition-all" 
                    data-testid="select-media-filter"
                  >
                    <SelectValue placeholder="All Media" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All Media</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  className="h-8 bg-white/60 dark:bg-white/5 border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:shadow hover:bg-white/80 dark:hover:bg-white/10 transition-all gap-1.5"
                  data-testid="button-ads-range-filter"
                >
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  Ads Range
                </Button>
              </div>
            </div>

            {filteredBatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4">history</span>
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No uploads yet</h3>
                <p className="text-slate-500 dark:text-slate-400 text-center mb-6 max-w-sm">
                  Your bulk upload jobs will appear here after you create them.
                </p>
                <Link href="/bulk-ads">
                  <Button 
                    className="bg-[#1877F2] hover:bg-[#1565C0] text-white px-5 h-9 rounded-xl text-xs font-semibold shadow-md shadow-[#1877F2]/20 hover:shadow-[#1877F2]/30 transition-all"
                    data-testid="button-first-upload"
                  >
                    <span className="material-symbols-outlined text-sm mr-1.5">upload</span>
                    Create First Upload
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-200/50 dark:divide-white/5">
                  {displayedBatches.map((batch, idx) => {
                    const isExpanded = expandedBatch === idx;
                    return (
                      <div key={idx} data-testid={`row-batch-${idx}`}>
                        <div 
                          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover-elevate transition-colors"
                          onClick={() => setExpandedBatch(isExpanded ? null : idx)}
                          data-testid={`batch-row-toggle-${idx}`}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                              {batch.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                              {batch.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0 flex-wrap">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] font-bold">
                                {batch.adAccountName.charAt(0).toUpperCase()}
                              </div>
                              <span>{batch.adAccountName}</span>
                            </div>
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {batch.adsLaunched} ads
                            </span>
                            <span className="flex items-center gap-1">
                              {batch.totalVideoAssets > 0 && batch.totalImageAssets > 0 ? (
                                <><Film className="h-3 w-3" /> {batch.totalAssets} creatives</>
                              ) : batch.totalVideoAssets > 0 ? (
                                <><Film className="h-3 w-3" /> {batch.totalVideoAssets} videos</>
                              ) : (
                                <><Image className="h-3 w-3" /> {batch.totalImageAssets || batch.totalAssets} images</>
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">folder</span>
                              {batch.mediaCount} ad sets
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 ml-6" data-testid={`batch-details-${idx}`}>
                            <div className="space-y-2">
                              {batch.jobs.map((job) => {
                                const duration = formatDuration(job.createdAt, job.completedAt);
                                const actId = job.adAccountId?.replace(/^act_/, '') || '';
                                const metaUrl = actId && job.campaignId
                                  ? `https://www.facebook.com/adsmanager/manage/campaigns?act=${actId}&selected_campaign_ids=${job.campaignId}`
                                  : actId
                                    ? `https://www.facebook.com/adsmanager/manage/campaigns?act=${actId}`
                                    : 'https://www.facebook.com/adsmanager';

                                return (
                                  <div 
                                    key={job.id} 
                                    className="bg-slate-50 dark:bg-white/5 rounded-lg p-3 border border-slate-200/50 dark:border-white/10"
                                    data-testid={`batch-job-${job.id}`}
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2.5 flex-wrap">
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" data-testid={`batch-job-campaign-${job.id}`}>
                                          {job.campaignName || job.driveRootFolderName || "Untitled Campaign"}
                                        </p>
                                        {job.driveRootFolderName && job.campaignName && job.driveRootFolderName !== job.campaignName && (
                                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                            {job.driveRootFolderName}
                                          </p>
                                        )}
                                      </div>
                                      <a 
                                        href={metaUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Button size="sm" variant="outline" className="text-[10px] gap-1" data-testid={`button-view-meta-${job.id}`}>
                                          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                          View in Meta
                                        </Button>
                                      </a>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
                                      <div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Creatives</p>
                                        <div className="flex items-center gap-1.5">
                                          {(job.videoAssetCount || 0) > 0 && (
                                            <span className="flex items-center gap-0.5 text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`batch-videos-${job.id}`}>
                                              <Film className="h-3 w-3 text-blue-500" />
                                              {job.videoAssetCount}
                                            </span>
                                          )}
                                          {(job.imageAssetCount || 0) > 0 && (
                                            <span className="flex items-center gap-0.5 text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`batch-images-${job.id}`}>
                                              <Image className="h-3 w-3 text-emerald-500" />
                                              {job.imageAssetCount}
                                            </span>
                                          )}
                                          {(job.assetCount || 0) === 0 && (
                                            <span className="text-xs text-slate-400">—</span>
                                          )}
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Ads Created</p>
                                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`batch-ads-${job.id}`}>
                                          {job.completedAds || 0} / {job.totalAds || 0}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Ad Sets</p>
                                        <p className="text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`batch-adsets-${job.id}`}>
                                          {job.totalAdSets || 0}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">Duration</p>
                                        <p className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300" data-testid={`batch-duration-${job.id}`}>
                                          <Clock className="h-3 w-3 text-slate-400" />
                                          {duration}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {filteredBatches.length > 10 && (
                  <div className="p-6 pt-4 text-center">
                    <button 
                      className="text-sm text-slate-500 hover:text-[#1877F2] dark:text-slate-400 dark:hover:text-white transition-colors"
                      onClick={() => setShowAll(!showAll)}
                      data-testid="button-show-more"
                    >
                      {showAll ? "Show less" : "Show more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
