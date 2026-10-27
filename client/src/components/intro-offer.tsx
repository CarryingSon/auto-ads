import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";

// Mirrors INTRO_OFFER in server/billing.ts; the prices match the monthly plan
// shown elsewhere in the app (€29/month).
export const INTRO_OFFER_COPY = {
  headline: "4 months of Pro for the price of 3",
  price: "€87",
  thenPrice: "€29/month",
};

// A visitor who picks the offer on the landing page goes through login first;
// this flag sends them on to the offer in Settings once they are signed in.
const PENDING_OFFER_KEY = "aa_pending_offer";

function setPendingOffer() {
  try {
    localStorage.setItem(PENDING_OFFER_KEY, "1");
  } catch {
    // Storage blocked: they land on the app as usual and find the offer in Settings.
  }
}

export function usePendingOfferRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    let pending = false;
    try {
      pending = localStorage.getItem(PENDING_OFFER_KEY) === "1";
      if (pending) localStorage.removeItem(PENDING_OFFER_KEY);
    } catch {
      return;
    }
    if (pending) setLocation("/settings#offer");
  }, [setLocation]);
}

// Landing page pricing: shown above the plans whichever billing period is picked.
export function IntroOfferBanner() {
  return (
    <div
      className="max-w-4xl mx-auto mb-8 rounded-2xl p-[1.5px] bg-gradient-to-r from-amber-400 via-primary to-[hsl(224_84%_66%)] shadow-lg"
      data-testid="banner-intro-offer"
    >
      <div className="rounded-[15px] bg-white px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <i className="fas fa-gift text-xl" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">One-time offer · 1 month free</p>
            <p className="text-lg font-extrabold text-foreground leading-tight">{INTRO_OFFER_COPY.headline}</p>
            <p className="text-sm text-muted-foreground">
              Pay {INTRO_OFFER_COPY.price} once, get 4 months of Rapid launch. Then {INTRO_OFFER_COPY.thenPrice}, cancel anytime.
            </p>
          </div>
        </div>
        <Link href="/login" onClick={setPendingOffer}>
          <span
            className="block shrink-0 text-center px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-[hsl(224_84%_66%)] text-white font-bold shadow-md cursor-pointer hover:shadow-lg transition-all"
            data-testid="button-claim-offer-landing"
          >
            Claim offer
          </span>
        </Link>
      </div>
    </div>
  );
}

// Settings plan card: shown to free accounts that have not used the offer,
// whichever billing period is picked. /settings#offer scrolls here.
export function IntroOfferBox({ onClaim, isPending }: { onClaim: () => void; isPending: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.location.hash === "#offer") {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  return (
    <div
      id="offer"
      ref={ref}
      className="mt-3 rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/10 dark:to-transparent dark:border-amber-500/30 p-3 scroll-mt-4"
      data-testid="box-intro-offer"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">redeem</span>
        One-time offer · 1 month free
      </p>
      <p className="text-xs font-bold text-foreground mt-1">{INTRO_OFFER_COPY.headline}</p>
      <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
        {INTRO_OFFER_COPY.price} today for 4 months, then {INTRO_OFFER_COPY.thenPrice}. Cancel anytime.
      </p>
      <button
        type="button"
        onClick={onClaim}
        disabled={isPending}
        className="mt-2.5 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-60"
        data-testid="button-claim-offer"
      >
        {isPending ? "Redirecting..." : `Claim offer · ${INTRO_OFFER_COPY.price}`}
      </button>
    </div>
  );
}
