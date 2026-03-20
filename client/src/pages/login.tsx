import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { SiFacebook, SiMeta } from "react-icons/si";
import { useAuth } from "@/hooks/use-auth";
import avatarHero1 from "../assets/images/avatar-hero-1.png";
import avatarHero2 from "../assets/images/avatar-hero-2.png";
import avatarHero3 from "../assets/images/avatar-hero-3.png";

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
    <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden bg-white">
      {/* LEFT SIDE */}
      <div className="w-full md:w-1/2 h-full bg-white relative flex flex-col p-6 md:p-8 lg:p-12 overflow-y-auto">
        <div className="flex justify-between items-center w-full mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-[#1877F2] text-white p-1.5 rounded-lg">
              <i className="fas fa-bolt text-lg" />
            </div>
            <span className="font-bold text-xl tracking-tight text-gray-900">Auto-ads</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-500 hover:text-[#1877F2] transition-colors" data-testid="link-back-home">
            Back to home
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10 z-10 relative">
              <div className="flex justify-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg text-xs font-semibold text-gray-600 border border-gray-100">
                  <i className="fas fa-rocket text-[#1877F2]" />
                  Launch 15 ads free, no card required!
                </div>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Welcome back</h1>
              <p className="text-gray-500 text-center mb-8 text-sm">Log in with Facebook to access Auto-ads</p>

              <button
                onClick={handleFacebookLogin}
                className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold py-3 px-4 rounded-lg transition-all shadow-sm mb-8"
                data-testid="button-facebook-login"
              >
                <SiFacebook className="w-5 h-5" />
                <span>Continue with Facebook</span>
              </button>

              <div className="bg-blue-50/50 rounded-xl p-4 flex items-center gap-4 border border-blue-50">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#1877F2] flex-shrink-0">
                  <span className="material-symbols-outlined text-xl">bar_chart</span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Trusted by marketers worldwide</p>
                  <p className="text-sm font-bold text-blue-600">5,356 ads uploaded so far today!</p>
                </div>
              </div>

              <div className="mt-8 text-center text-xs text-gray-400 leading-relaxed">
                By continuing, you agree to Auto-ads'{" "}
                <Link href="/terms" className="underline hover:text-gray-600">Terms of Service</Link>
                {" & "}
                <Link href="/privacy-policy" className="underline hover:text-gray-600">Privacy Policy</Link>
              </div>
            </div>
          </div>

          {/* Scrolling integrations carousel */}
          <div className="w-full max-w-md relative">
            <div className="absolute -z-10 w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl opacity-60 blur-xl scale-110" />
            <div className="text-center pt-2 pb-4">
              <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 mb-6">Direct Integration With</h3>
              <div className="relative w-full overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
                <div className="flex items-center gap-12 animate-scroll w-max py-2">
                  {[0, 1, 2].map((set) => (
                    <div key={set} className="flex items-center gap-12">
                      <div className="flex items-center gap-2 cursor-default" title="Google Drive">
                        <i className="fab fa-google-drive text-xl text-green-500" />
                        <span className="text-sm font-semibold text-gray-600">Drive</span>
                      </div>
                      <div className="flex items-center gap-2 cursor-default" title="Meta Ads">
                        <i className="fab fa-meta text-xl text-[#1877F2]" />
                        <span className="text-sm font-semibold text-gray-600">Meta</span>
                      </div>
                      <div className="flex items-center gap-2 cursor-default" title="Instagram">
                        <i className="fab fa-instagram text-xl text-[#E1306C]" />
                        <span className="text-sm font-semibold text-gray-600">Instagram</span>
                      </div>
                      <div className="flex items-center gap-2 cursor-default" title="Facebook">
                        <i className="fab fa-facebook text-xl text-[#1877F2]" />
                        <span className="text-sm font-semibold text-gray-600">Facebook</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 flex justify-center md:hidden">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm border border-gray-200">
            <SiMeta className="text-lg text-[#1877F2]" />
            <span className="font-medium text-gray-600 text-xs">Official Meta marketing partner</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="hidden md:flex md:w-1/2 h-full bg-[#1877F2] relative flex-col justify-center p-12 lg:p-16 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="login-grid" patternUnits="userSpaceOnUse" width="40" height="40">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#login-grid)" />
          </svg>
        </div>

        <div className="relative z-10 max-w-xl mx-auto w-full">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight text-white">
            Save yourself 100's of hours a month launching ad creatives
          </h2>
          <p className="text-blue-100 text-lg mb-12 max-w-md leading-relaxed">
            Auto-ads helps you upload, manage, and monitor your Facebook ad campaigns with powerful automation tools.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-12">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
              <div className="text-3xl font-bold mb-1">100's</div>
              <div className="text-sm text-blue-100">Ads launched instantly</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
              <div className="text-3xl font-bold mb-1">88.2%</div>
              <div className="text-sm text-blue-100">Faster launch time</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
              <div className="mb-1">
                <span className="material-symbols-outlined text-3xl align-middle">all_inclusive</span>
              </div>
              <div className="text-sm text-blue-100">Unlimited ad accounts</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-6">
              <div className="mb-1">
                <span className="material-symbols-outlined text-3xl align-middle">all_inclusive</span>
              </div>
              <div className="text-sm text-blue-100">Unlimited ad uploads</div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3">
                <img alt="User 1" className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm object-cover" src={avatarHero1} />
                <img alt="User 2" className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm object-cover" src={avatarHero2} />
                <img alt="User 3" className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm object-cover" src={avatarHero3} />
              </div>
              <span className="text-sm font-medium text-blue-50">Trusted by ad managers worldwide</span>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white/90 shadow-sm">
              <SiMeta className="text-white text-lg" />
              <span className="font-medium text-xs">Official Meta marketing partner</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .animate-scroll {
          animation: scroll 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
