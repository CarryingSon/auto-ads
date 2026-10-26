import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReferralInfo {
  code: string;
  invited: number;
  rewarded: number;
  bonusPerReferral: number;
  bonusCreditsEarned: number;
}

// The settings page's invite section: the user's link, and how their invites
// are doing. /settings#invite (linked from the sidebar) scrolls here.
export function InviteFriendsCard() {
  const { toast } = useToast();
  const sectionRef = useRef<HTMLElement>(null);
  const { data, isLoading, isError } = useQuery<ReferralInfo>({
    queryKey: ["/api/referrals"],
    staleTime: 60_000,
  });

  useEffect(() => {
    if (window.location.hash === "#invite") {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const link = data ? `${window.location.origin}/?ref=${data.code}` : "";
  const bonus = data?.bonusPerReferral ?? 5;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Could not copy the link", description: link, variant: "destructive" });
    }
  };

  return (
    <section id="invite" ref={sectionRef} className="glass-card rounded-2xl overflow-hidden scroll-mt-4" data-testid="section-invite">
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-meta">
            <span className="material-symbols-outlined text-lg">redeem</span>
          </div>
          <div>
            <h2 className="text-base font-extrabold tracking-tight">Invite friends</h2>
            <p className="text-[10px] font-medium text-muted-foreground">
              Get {bonus} free launches for every friend who signs up with your link and launches their first ads.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !data ? (
          <p className="text-xs text-muted-foreground py-4">Your invite link could not be loaded. Refresh the page to try again.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-border bg-white/40 dark:bg-black/20 px-3 py-2">
                <span className="material-symbols-outlined text-[16px] text-muted-foreground">link</span>
                <code className="truncate text-xs font-semibold text-foreground select-all" data-testid="text-invite-link">{link}</code>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
                data-testid="button-copy-invite-link"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                Copy link
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Signed up", value: data.invited, testId: "text-invites-signed-up" },
                { label: "Launched", value: data.rewarded, testId: "text-invites-launched" },
                { label: "Launches earned", value: `+${data.bonusCreditsEarned}`, testId: "text-invites-earned" },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl bg-white/40 dark:bg-white/5 border border-white/20 dark:border-white/10 px-3 py-2.5">
                  <p className="text-base font-bold" data-testid={stat.testId}>{stat.value}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] font-medium text-muted-foreground">
              A friend counts once they sign up for the first time through your link and their first launch succeeds.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
