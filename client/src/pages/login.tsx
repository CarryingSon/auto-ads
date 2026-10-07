import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { SiFacebook, SiInstagram, SiMeta } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import avatarHero1 from "../assets/images/avatar-hero-1.png";
import avatarHero2 from "../assets/images/avatar-hero-2.png";
import avatarHero3 from "../assets/images/avatar-hero-3.png";
import avatarHero4 from "../assets/images/avatar-hero-4.png";

const capabilities = [
  { icon: "rocket_launch", label: "Auto-Ads Engine", value: "100's of ads launched instantly" },
  { icon: "speed", label: "Efficiency", value: "88.2% faster launch time" },
  { icon: "account_balance_wallet", label: "Scalability", value: "Unlimited ad accounts" },
  { icon: "cloud_upload", label: "Volume", value: "Unlimited ad uploads" },
];

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/bulk-ads");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  const handleFacebookLogin = () => {
    window.location.href = "/auth/meta/start";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-border border-b-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <main className="flex h-screen w-full bg-muted text-foreground overflow-hidden">
      <section className="w-full lg:w-5/12 bg-background flex flex-col p-8 md:p-12 lg:p-16 relative overflow-y-auto">
        <div className="absolute top-8 right-8 md:top-12 md:right-12">
          <Link
            href="/"
            className="text-muted-foreground font-medium text-sm inline-flex items-center gap-2 hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="link-back-home"
          >
            Back to home
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
        </div>

        <div className="mb-14">
          <Link
            href="/"
            className="inline-flex items-center gap-3 text-2xl font-extrabold tracking-tight text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <img
              src="/favicon.png"
              alt="Auto-ads logo"
              className="h-8 w-auto object-contain shrink-0"
            />
            <span>Auto-ads</span>
          </Link>
        </div>

        <div className="flex-grow flex flex-col justify-center max-w-md mx-auto w-full">
          <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 tracking-tight text-center text-balance">
            Welcome back
          </h1>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed text-center">
            Log in with Facebook to access Auto-ads.
          </p>

          <div className="space-y-6">
            {/* Meta's blue, because this button is Meta's. Every other action
                in the app uses our own primary. */}
            <button
              onClick={handleFacebookLogin}
              className="w-full py-4 px-6 bg-meta hover:bg-meta-hover text-meta-foreground rounded-2xl font-semibold flex items-center justify-center gap-3 shadow-lg shadow-meta/20 transition-[background-color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meta focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              data-testid="button-facebook-login"
            >
              <SiFacebook className="w-6 h-6" aria-hidden="true" />
              Continue with Facebook
            </button>

            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-3 bg-meta-subtle py-3 px-6 rounded-full border border-meta/20">
                <SiMeta className="text-meta text-base" aria-hidden="true" />
                <span className="text-meta font-semibold text-sm tracking-tight">
                  Official Meta marketing partner
                </span>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              By continuing, you agree to Auto-ads&apos;{" "}
              <Link href="/terms" className="text-primary hover:underline underline-offset-2">
                Terms of Service
              </Link>{" "}
              &{" "}
              <Link href="/privacy-policy" className="text-primary hover:underline underline-offset-2">
                Privacy policy
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 mb-6">
            Direct integration with
          </p>
          <div className="flex items-center gap-8 text-muted-foreground/60">
            <SiInstagram className="text-2xl" aria-label="Instagram" />
            <SiFacebook className="text-2xl" aria-label="Facebook" />
            <SiMeta className="text-2xl" aria-label="Meta" />
          </div>
        </div>
      </section>

      <section className="hidden lg:flex lg:w-7/12 bg-brand-gradient relative overflow-hidden flex-col p-16">
        <div className="absolute inset-0 grid-overlay opacity-30" />

        <div className="relative z-10 max-w-2xl mt-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/15 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              The Kinetic Authority in Automation
            </span>
          </div>

          <h2 className="text-5xl font-extrabold text-white leading-[1.1] mb-8 tracking-tight text-balance">
            Save yourself 100&apos;s of hours a month launching ad creatives.
          </h2>

          <div className="grid grid-cols-2 gap-4 mt-12">
            {capabilities.map((item) => (
              <div key={item.label} className="glass-panel p-6 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-white/80">{item.icon}</span>
                  <span className="text-white/70 text-sm font-medium">{item.label}</span>
                </div>
                <p className="text-white text-xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-auto flex flex-col xl:flex-row items-start xl:items-end justify-between gap-8">
          <div className="glass-panel p-5 rounded-2xl inline-flex items-center gap-4">
            <div className="flex -space-x-3">
              {[avatarHero1, avatarHero2, avatarHero3, avatarHero4].map((src, index) => (
                <img
                  key={src}
                  alt=""
                  aria-hidden="true"
                  className="w-10 h-10 rounded-full border-2 border-white/25 ring-2 ring-black/10 object-cover"
                  src={src}
                />
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-white/25 ring-2 ring-black/10 bg-white/20 backdrop-blur flex items-center justify-center text-[10px] text-white font-bold">
                +2k
              </div>
            </div>
            <p className="text-white text-sm font-semibold">Trusted by marketers worldwide</p>
          </div>
        </div>

        <div className="absolute right-[-10%] top-[40%] rotate-[-12deg] opacity-60 pointer-events-none">
          <div className="w-[500px] h-[350px] bg-white/10 rounded-3xl border border-white/20 backdrop-blur-xl p-8 flex flex-col gap-6">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20" />
              <div className="flex-grow space-y-2">
                <div className="h-4 bg-white/20 rounded w-1/3" />
                <div className="h-4 bg-white/10 rounded w-2/3" />
              </div>
            </div>
            <div className="flex-grow flex items-end gap-2">
              <div className="w-full bg-white/20 h-1/2 rounded-t-lg" />
              <div className="w-full bg-white/40 h-3/4 rounded-t-lg" />
              <div className="w-full bg-white/20 h-2/3 rounded-t-lg" />
              <div className="w-full bg-white/10 h-1/3 rounded-t-lg" />
              <div className="w-full bg-white/60 h-full rounded-t-lg" />
            </div>
          </div>
        </div>
      </section>

      <style>{`
        /* Committed to one look in both themes: always a deep indigo ground
           carrying white text, so it reads the same however the OS is set. */
        .bg-brand-gradient {
          background:
            radial-gradient(120% 110% at 100% 0%, hsl(224 84% 58% / 0.5) 0%, transparent 55%),
            linear-gradient(135deg, hsl(224 72% 24%) 0%, hsl(224 68% 45%) 100%);
        }
        .glass-panel {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .grid-overlay {
          background-image: radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>
    </main>
  );
}
