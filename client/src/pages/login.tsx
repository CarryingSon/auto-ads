import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { SiFacebook, SiMeta } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import avatarHero1 from "../assets/images/avatar-hero-1.png";
import avatarHero2 from "../assets/images/avatar-hero-2.png";
import avatarHero3 from "../assets/images/avatar-hero-3.png";
import avatarHero4 from "../assets/images/avatar-hero-4.png";

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
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1877F2]" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <main className="flex h-screen w-full bg-[#f8f9fa] text-[#191c1d] overflow-hidden">
      <section className="w-full lg:w-5/12 bg-white flex flex-col p-8 md:p-12 lg:p-16 relative overflow-y-auto">
        <div className="absolute top-8 right-8 md:top-12 md:right-12">
          <Link
            href="/"
            className="text-[#5f6673] font-medium text-sm flex items-center gap-2 hover:text-[#005bbf] transition-colors"
            data-testid="link-back-home"
          >
            Back to home
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
        </div>

        <div className="mb-14">
          <Link href="/" className="inline-flex items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900">
            <span className="w-10 h-10 rounded-2xl bg-[#f4f7fb] border border-slate-200/80 shadow-sm flex items-center justify-center">
              <img
                src="/favicon.png"
                alt="Auto-ads logo"
                className="w-6 h-6 object-contain"
              />
            </span>
            <span>Auto-ads</span>
          </Link>
        </div>

        <div className="flex-grow flex flex-col justify-center max-w-md mx-auto w-full">
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#191c1d] mb-4 tracking-tight text-center">
            Welcome back
          </h1>
          <p className="text-[#5f6673] text-lg mb-10 leading-relaxed text-center">
            Log in with Facebook to access Auto-ads.
          </p>

          <div className="space-y-6">
            <button
              onClick={handleFacebookLogin}
              className="w-full py-4 px-6 bg-[#1877F2] text-white rounded-2xl font-semibold flex items-center justify-center gap-3 transition-transform active:scale-[0.98] shadow-lg shadow-blue-500/10 hover:bg-[#166fe5]"
              data-testid="button-facebook-login"
            >
              <SiFacebook className="w-6 h-6" />
              Continue with Facebook
            </button>

            <div className="pt-2 flex justify-center">
              <div className="inline-flex items-center gap-3 bg-[#1877F2]/5 py-3 px-6 rounded-full border border-[#1877F2]/20">
                <SiMeta className="text-[#1877F2] text-base" />
                <span className="text-[#1877F2] font-bold text-sm tracking-tight">
                  Official Meta marketing partner
                </span>
              </div>
            </div>

            <p className="text-center text-xs text-[#5f6673] leading-relaxed">
              By continuing, you agree to Auto-ads&apos;{" "}
              <Link href="/terms" className="text-[#005bbf] hover:underline">
                Terms of Service
              </Link>{" "}
              &{" "}
              <Link href="/privacy-policy" className="text-[#005bbf] hover:underline">
                Privacy policy
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5f6673]/60 mb-6">
            Direct integration with
          </p>
          <div className="flex items-center gap-8 grayscale opacity-50">
            <i className="fab fa-instagram text-2xl text-black" />
            <i className="fab fa-facebook text-2xl text-black" />
            <i className="fab fa-google-drive text-2xl text-black" />
          </div>
        </div>
      </section>

      <section className="hidden lg:flex lg:w-7/12 bg-kinetic-gradient relative overflow-hidden flex-col p-16">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div className="absolute -top-24 -right-24 w-[600px] h-[600px] bg-[#1a73e8] rounded-full blur-[120px] opacity-40" />

        <div className="relative z-10 max-w-2xl mt-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/10 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              The Kinetic Authority in Automation
            </span>
          </div>

          <h2 className="text-5xl font-extrabold text-white leading-[1.1] mb-8 tracking-tight">
            Save yourself 100&apos;s of hours a month launching ad creatives.
          </h2>

          <div className="grid grid-cols-2 gap-4 mt-12">
            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#d8e2ff]">rocket_launch</span>
                <span className="text-white/70 text-sm font-medium">Auto-Ads Engine</span>
              </div>
              <p className="text-white text-xl font-bold">100&apos;s of ads launched instantly</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#d8e2ff]">speed</span>
                <span className="text-white/70 text-sm font-medium">Efficiency</span>
              </div>
              <p className="text-white text-xl font-bold">88.2% faster launch time</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#d8e2ff]">
                  account_balance_wallet
                </span>
                <span className="text-white/70 text-sm font-medium">Scalability</span>
              </div>
              <p className="text-white text-xl font-bold">Unlimited ad accounts</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="material-symbols-outlined text-[#d8e2ff]">cloud_upload</span>
                <span className="text-white/70 text-sm font-medium">Volume</span>
              </div>
              <p className="text-white text-xl font-bold">Unlimited ad uploads</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto flex flex-col xl:flex-row items-start xl:items-end justify-between gap-8">
          <div className="glass-panel p-5 rounded-2xl inline-flex items-center gap-4">
            <div className="flex -space-x-3">
              <img
                alt="Avatar 1"
                className="w-10 h-10 rounded-full border-2 border-[#005bbf] ring-2 ring-white/10 object-cover"
                src={avatarHero1}
              />
              <img
                alt="Avatar 2"
                className="w-10 h-10 rounded-full border-2 border-[#005bbf] ring-2 ring-white/10 object-cover"
                src={avatarHero2}
              />
              <img
                alt="Avatar 3"
                className="w-10 h-10 rounded-full border-2 border-[#005bbf] ring-2 ring-white/10 object-cover"
                src={avatarHero3}
              />
              <img
                alt="Avatar 4"
                className="w-10 h-10 rounded-full border-2 border-[#005bbf] ring-2 ring-white/10 object-cover"
                src={avatarHero4}
              />
              <div className="w-10 h-10 rounded-full border-2 border-[#005bbf] ring-2 ring-white/10 bg-[#1a73e8] flex items-center justify-center text-[10px] text-white font-bold">
                +2k
              </div>
            </div>
            <p className="text-white text-sm font-semibold">Trusted by marketers worldwide</p>
          </div>

        </div>

        <div className="absolute right-[-10%] top-[40%] transform rotate-[-12deg] opacity-60 pointer-events-none">
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
        .bg-kinetic-gradient {
          background: linear-gradient(135deg, #005bbf 0%, #1a73e8 100%);
        }
        .glass-panel {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .grid-overlay {
          background-image: radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>
    </main>
  );
}
