import { Link } from "wouter";
import { useState } from "react";
import { motion } from "framer-motion";

import avatarHero1 from "../assets/images/avatar-hero-1.png";
import avatarHero2 from "../assets/images/avatar-hero-2.png";
import avatarHero3 from "../assets/images/avatar-hero-3.png";
import avatarHero4 from "../assets/images/avatar-hero-4.png";
import testimonialSarah from "../assets/images/testimonial-sarah.png";
import testimonialJohn from "../assets/images/testimonial-john.png";
import testimonialMike from "../assets/images/testimonial-mike.png";
import testimonialAlice from "../assets/images/testimonial-alice.png";
import testimonialTom from "../assets/images/testimonial-tom.png";
import testimonialEmily from "../assets/images/testimonial-emily.png";

const testimonials = [
  { quote: "The Google Drive sync is a game changer. My creative team just drops files in the folder and they appear in my ads manager ready to launch. Insane.", author: "Sarah Jenkins", role: "Agency Owner", img: testimonialSarah },
  { quote: "Agency we work for use Auto-ads. WAY better than ads manager by far. The syncing is seamless.", author: "John Doe", role: "Media Buyer", img: testimonialJohn },
  { quote: "Trying to automate our TikTok creatives to Meta Ads... Tool can be super useful for my needs... other tools charge 1k for API integrations where as Auto-ads has super good pricing", author: "Mike T.", role: "eCom Brand Owner", img: testimonialMike },
  { quote: "I've been launching my ads through Auto-ads and it seems to never turn any advantage+ enhancements on! Perfect for our strict brand guidelines.", author: "Alice Wong", role: "Marketing Director", img: testimonialAlice },
  { quote: "Yeah go with Auto-ads, honestly just anything except AdsManager and Kitchn and you're good. The Drive integration is a must-have.", author: "Tom H.", role: "Growth Hacker", img: testimonialTom },
  { quote: "How am I just discovering Auto-ads? My poor employee who has been manually uploading ads to Meta all this time is going to love this.", author: "Emily R.", role: "Agency CEO", img: testimonialEmily },
];

const faqItems = [
  { q: "What is Auto-ads?", a: "Auto-ads is a tool designed to help media buyers sync and bulk upload Facebook & Instagram ads directly from Google Drive folders, saving hours of manual work." },
  { q: "How much time will it save me?", a: "On average, our users save about 13 minutes per ad launch and reduce their overall workflow time by 88% by removing manual uploads." },
  { q: "Does it support shared drives?", a: "Yes! You can connect personal Google Drive folders as well as Shared Drives used by teams." },
  { q: "Can I use different aspect ratios in the same ad?", a: "Yes! Auto-ads supports uploading multiple aspect ratios from your Drive folder and will automatically map them to the correct placements." },
];

const freePlanFeatures = ["3 launches / month", "Dashboard overview", "Google Drive sync", "No credit card required"];
const paidPlanFeatures = ["Unlimited launches", "Unlimited Drive syncs", "Auto-disable enhancements", "Google Drive integration", "Auto-naming from filenames", "Saved ad copy templates"];

function DemoVideoPlaceholder() {
  return (
    <div className="w-full max-w-none mx-auto mt-8 lg:mt-0 lg:w-[112%] relative" data-testid="demo-video-placeholder">
      <div className="absolute -inset-2 bg-gradient-to-r from-[#1877F2]/20 via-blue-400/20 to-[#1877F2]/20 rounded-3xl blur-xl opacity-40" />
      <div className="relative bg-white rounded-xl overflow-hidden shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-slate-200 aspect-video ring-1 ring-slate-900/5">
        <video
          className="w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        >
          <source src="/auto-ads-hero.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}

export default function Landing() {
  const [isYearly, setIsYearly] = useState(false);
  const [weeklyImageAds, setWeeklyImageAds] = useState(40);
  const [weeklyVideoAds, setWeeklyVideoAds] = useState(20);
  const [manualMinutesPerAd, setManualMinutesPerAd] = useState(5);

  const totalWeeklyAds = weeklyImageAds + weeklyVideoAds;
  const autoMinutesPerAd = 0.35;
  const autoSetupMinutesPerWeek = 2;
  const manualWeeklyMinutes = totalWeeklyAds * manualMinutesPerAd;
  const autoWeeklyMinutes = totalWeeklyAds * autoMinutesPerAd + autoSetupMinutesPerWeek;
  const savedWeeklyMinutes = Math.max(0, manualWeeklyMinutes - autoWeeklyMinutes);
  const manualMonthlyHours = (manualWeeklyMinutes * 4.33) / 60;
  const autoMonthlyHours = (autoWeeklyMinutes * 4.33) / 60;
  const savedMonthlyHours = (savedWeeklyMinutes * 4.33) / 60;
  const savedPercent = manualWeeklyMinutes > 0 ? Math.round((savedWeeklyMinutes / manualWeeklyMinutes) * 100) : 0;
  const savedYearlyHours = savedMonthlyHours * 12;
  const savedWorkDaysPerMonth = savedMonthlyHours / 8;
  const autoSecondsPerAd = Math.round(autoMinutesPerAd * 60);

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen scroll-smooth overflow-x-hidden relative" style={{ fontFamily: "'Inter', sans-serif", background: "#f8f9ff", color: "#1e293b" }}>
      <style>{`
        .gradient-text {
          background: linear-gradient(90deg, #1877F2 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .blob-bg {
          position: absolute;
          border-radius: 50%;
          filter: blur(64px);
          z-index: 0;
          opacity: 0.5;
          pointer-events: none;
          will-change: transform;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.05);
          position: relative;
          overflow: hidden;
          transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease;
        }
        .glass-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -50%;
          width: 100%;
          height: 100%;
          background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.3), transparent);
          transform: skewX(-25deg);
          transition: 0.5s;
          opacity: 0;
          pointer-events: none;
        }
        .glass-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 35px rgba(24, 119, 242, 0.15);
          border-color: rgba(24, 119, 242, 0.3);
          background: rgba(255, 255, 255, 0.45);
        }
        .glass-card:hover::before {
          left: 150%;
          opacity: 1;
          transition: 0.7s;
        }
        .glass-heavy {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
        details summary::-webkit-details-marker { display: none; }
        details summary { list-style: none; }
        html { scroll-behavior: smooth; }
        @media (max-width: 1024px) {
          .blob-bg { display: none; }
          .glass-card, .glass-heavy {
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }
          .glass-card::before { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .glass-card, .glass-card::before, .glass-heavy {
            transition: none !important;
          }
          .animate-slide-testimonials {
            animation: none !important;
          }
        }
      `}</style>

      <div className="blob-bg" style={{ width: 600, height: 600, background: "#1877F2", top: -150, left: -150, mixBlendMode: "multiply" }} />
      <div className="blob-bg" style={{ width: 700, height: 700, background: "#93c5fd", top: "10%", right: -300, mixBlendMode: "multiply" }} />
      <div className="blob-bg" style={{ width: 500, height: 500, background: "#1877F2", top: "40%", left: "5%", opacity: 0.3, mixBlendMode: "multiply" }} />
      <div className="blob-bg" style={{ width: 600, height: 600, background: "#e9d5ff", bottom: "5%", right: "0%", mixBlendMode: "multiply" }} />

      {/* NAV */}
      <div className="pt-6 pb-2 px-4 sm:px-6 lg:px-8 fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <nav className="pointer-events-auto mx-auto max-w-7xl rounded-2xl glass-heavy shadow-lg" style={{ boxShadow: "0 4px 30px rgba(0,0,0,0.05)", border: "1px solid rgba(255,255,255,0.5)" }}>
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16 gap-4">
              <div className="flex-shrink-0 flex items-center gap-2">
                <img
                  src="/favicon.png"
                  alt="Auto-ads logo"
                  className="w-14 h-14 object-contain relative top-[2px]"
                />
                <span className="font-bold text-xl tracking-tight text-gray-900">Auto-ads</span>
              </div>
              <div className="hidden md:flex space-x-8">
                {[
                  { label: "Home", href: "#" },
                  { label: "Features", href: "#features" },
                  { label: "Calculator", href: "#calculator" },
                  { label: "Benefits", href: "#benefits" },
                  { label: "How It Works", href: "#how-it-works" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "FAQ", href: "#faq" },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(e) => item.href !== "#" ? handleSmoothScroll(e, item.href.slice(1)) : undefined}
                    className="text-sm font-medium text-gray-800 hover:text-[#1877F2] transition-colors"
                    data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="flex items-center space-x-4">
                <Link href="/login">
                  <span className="bg-[#1877F2] hover:bg-[#1461c7] text-white px-5 py-2 rounded-full text-sm font-medium transition-all shadow-lg cursor-pointer" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.3)" }} data-testid="button-get-started-nav">
                    Get Started
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* HERO */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 xl:gap-12 items-center">
            <div className="space-y-8">
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.15]">
                Auto-launch ads from{" "}
                <span className="text-[#1877F2] inline-flex items-center gap-2">
                  <i className="fab fa-google-drive text-[0.9em]" />
                  <span className="relative inline-block">
                    Google Drive
                    <span className="absolute bottom-1 left-0 w-full h-3 bg-blue-200/50 -z-10 rounded-full blur-sm" />
                  </span>
                </span>
                <br />
                directly to{" "}
                <span className="text-[#1877F2] inline-flex items-center gap-2">
                  <i className="fab fa-meta" /> Meta Ads
                </span>
              </h1>
              <p className="text-xl text-gray-500 max-w-xl leading-relaxed font-medium">
                Stop manually downloading and uploading files. Connect a folder, and we'll auto-sync your creatives to Meta Ads manager instantly.
              </p>
              <div className="flex flex-wrap gap-3 text-sm font-medium text-gray-600">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card" style={{ boxShadow: "none", transform: "none" }}>
                  <i className="fas fa-sync text-[#1877F2]" /> Real-time sync
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card" style={{ boxShadow: "none", transform: "none" }}>
                  <i className="fas fa-folder-open text-[#1877F2]" /> No file limits
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card" style={{ boxShadow: "none", transform: "none" }}>
                  <i className="fas fa-bolt text-[#1877F2]" /> Instant launch
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Link href="/login">
                  <span className="bg-gradient-to-r from-[#1877F2] to-blue-600 hover:to-blue-700 text-white text-center px-8 py-4 rounded-full text-base font-semibold transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-105 cursor-pointer" style={{ boxShadow: "0 10px 25px rgba(37,99,235,0.3)" }} data-testid="button-try-free-hero">
                    Get Started <i className="fas fa-arrow-right" />
                  </span>
                </Link>
                <a className="glass-heavy hover:bg-white/80 text-gray-900 border border-white/40 text-center px-8 py-4 rounded-full text-base font-semibold transition-all flex items-center justify-center gap-2 hover:scale-105 cursor-pointer" href="#how-it-works" onClick={(e) => handleSmoothScroll(e, "how-it-works")} data-testid="button-watch-demo">
                  Watch demo <i className="fas fa-play text-xs" />
                </a>
              </div>
              <div className="flex items-center gap-4 pt-4">
                <div className="flex -space-x-3">
                  <img alt="User 1" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" src={avatarHero1} />
                  <img alt="User 2" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" src={avatarHero2} />
                  <img alt="User 3" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" src={avatarHero3} />
                  <img alt="User 4" className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover" src={avatarHero4} />
                </div>
                <div className="text-sm">
                  <p className="font-bold text-gray-900">1,200+ media buyers</p>
                  <p className="text-gray-500">Syncing from Google Drive daily</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center">
                  {[...Array(4)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  <div className="relative">
                    <svg className="w-4 h-4 text-gray-200 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <div className="absolute top-0 left-0 overflow-hidden w-[70%]">
                      <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900 leading-none">4.7/5</span>
                  <span className="text-[11px] text-gray-500 font-medium leading-none">(128 reviews)</span>
                </div>
              </div>
            </div>

            {/* HERO RIGHT - Demo Video */}
            <div className="relative">
              <DemoVideoPlaceholder />
              <div className="flex justify-center mt-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/30 backdrop-blur-xl border border-white/50 shadow-[0_4px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5 transition-all hover:scale-[1.02]">
                  <img
                    src="/shopify-bag-icon-symbol-logo-701751695132537nenecmhs0u.png"
                    alt="Shopify logo"
                    className="w-6 h-6 object-contain flex-shrink-0"
                  />
                  <p className="text-xs text-gray-800 font-medium tracking-tight">
                    Built by <span className="text-[#1877F2] font-extrabold">Dropshippers</span>, for <span className="text-[#1877F2] font-extrabold">Dropshippers</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex justify-center relative z-10">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass-card hover:bg-white/60 transition-colors shadow-lg" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.1)" }}>
              <i className="fab fa-meta text-[#1877F2] text-xl" />
              <span className="font-medium text-gray-700">Official Meta marketing partner</span>
            </div>
          </div>

        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 relative z-10 overflow-visible bg-white" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50 backdrop-blur-sm">
              Powerful Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 drop-shadow-sm">
              Fast lane for <span className="text-[#1877F2]">Meta Ads</span>
            </h2>
            <p className="text-lg text-gray-500">
              No more slow Meta UI. Auto-ads supercharges your workflow via Google Drive integration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { icon: "fab fa-google-drive", title: "Drive Integration", desc: "Drop files into your Google Drive folder and they automatically appear in your dashboard, ready to launch as Meta ads." },
              { icon: "fas fa-clock", title: "Save hours every week", desc: "No more downloading, renaming, and re-uploading files. Go from creative to live ad in under 2 minutes." },
              { icon: "fas fa-ban", title: "Auto-disable enhancements", desc: "Meta's Advantage+ enhancements get auto-disabled so your creatives run exactly as designed." },
              { icon: "fas fa-layer-group", title: "Multi-account support", desc: "Manage multiple Meta ad accounts from one dashboard. Assign different Drive folders to different accounts." },
              { icon: "fas fa-tag", title: "Auto-naming conventions", desc: "Your Google Drive file names become your ad names automatically. No more manual renaming in Ads Manager." },
              { icon: "fas fa-chart-line", title: "Performance insights", desc: "See which creatives perform best across all your accounts in one unified dashboard." },
            ].map((feature, index) => (
              <div key={index} className="group bg-white border border-blue-100/50 shadow-sm hover:shadow-md hover:border-blue-200 hover:-translate-y-1 transition-[transform,box-shadow,border-color,color] duration-200 p-6 rounded-2xl" data-testid={`card-feature-${index}`}>
                <div className="w-10 h-10 bg-blue-50 text-[#1877F2] rounded-xl flex items-center justify-center mb-4 text-lg shadow-inner ring-1 ring-blue-100/50">
                  <i className={feature.icon} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-[#1877F2] transition-colors">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <section className="pb-24 relative z-10 bg-white" id="calculator">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50 backdrop-blur-sm">
              Smart Estimator
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 drop-shadow-sm">
              Time Savings <span className="text-[#1877F2]">Calculator</span>
            </h2>
            <p className="text-lg text-gray-500">
              Quickly estimate how much manual upload time Auto-ads can save your team every week, month, and year.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-blue-100/70 bg-gradient-to-br from-white via-blue-50/40 to-white p-6 md:p-10 shadow-[0_24px_50px_-28px_rgba(37,99,235,0.5)]">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#1877F2]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative grid lg:grid-cols-2 gap-8 lg:gap-10 items-start">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-3">
                  Your custom savings projection
                </h3>
                <p className="text-gray-500 text-base sm:text-lg leading-relaxed mb-6">
                  Tune the values on the right to match your current workflow and see the estimated time gain instantly.
                </p>

                <div className="rounded-2xl bg-gradient-to-r from-[#1877F2] to-blue-600 text-white p-5 shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] mb-3">
                  <p className="text-xs uppercase tracking-wider text-blue-100 font-semibold mb-1">Estimated Time Saved / Month</p>
                  <p className="text-4xl font-extrabold leading-none">{savedMonthlyHours.toFixed(1)}h</p>
                  <p className="text-sm text-blue-100 mt-2">
                    ~{savedWorkDaysPerMonth.toFixed(1)} working days saved every month
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/80 border border-blue-100 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">Manual / Month</p>
                    <p className="text-xl font-extrabold text-gray-900">{manualMonthlyHours.toFixed(1)}h</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 border border-blue-100 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-1">Auto-ads / Month</p>
                    <p className="text-xl font-extrabold text-gray-900">{autoMonthlyHours.toFixed(1)}h</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  Auto-ads averages <span className="font-semibold text-[#1877F2]">~{autoSecondsPerAd}s per ad</span> after setup.
                </p>
              </div>

              <div className="rounded-2xl glass-heavy border border-white/60 p-5 md:p-6">
                <div className="space-y-5">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Images per week</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={300}
                        step={1}
                        value={weeklyImageAds}
                        onChange={(e) => setWeeklyImageAds(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full max-w-[280px] sm:max-w-[340px] accent-[#1877F2] h-1.5"
                      />
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={weeklyImageAds}
                        onChange={(e) => setWeeklyImageAds(Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 h-10 rounded-lg border border-blue-100 bg-white/80 px-2 text-sm font-semibold text-gray-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700">Videos per week</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={300}
                        step={1}
                        value={weeklyVideoAds}
                        onChange={(e) => setWeeklyVideoAds(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full max-w-[280px] sm:max-w-[340px] accent-[#1877F2] h-1.5"
                      />
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={weeklyVideoAds}
                        onChange={(e) => setWeeklyVideoAds(Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 h-10 rounded-lg border border-blue-100 bg-white/80 px-2 text-sm font-semibold text-gray-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700">Manual upload time per ad (minutes)</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0.5}
                        max={12}
                        step={0.1}
                        value={manualMinutesPerAd}
                        onChange={(e) => setManualMinutesPerAd(Math.max(0.5, Number(e.target.value) || 0.5))}
                        className="w-full max-w-[280px] sm:max-w-[340px] accent-[#1877F2] h-1.5"
                      />
                      <input
                        type="number"
                        min={0.5}
                        max={12}
                        step={0.1}
                        value={manualMinutesPerAd}
                        onChange={(e) => setManualMinutesPerAd(Math.max(0.5, Number(e.target.value) || 0.5))}
                        className="w-20 h-10 rounded-lg border border-blue-100 bg-white/80 px-2 text-sm font-semibold text-gray-900"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Default set to 5 min per ad</p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl bg-white/70 border border-blue-100 p-4">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Total ads / week</span>
                    <span className="font-bold text-gray-900">{totalWeeklyAds}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600 mt-1.5">
                    <span>Weekly time saved</span>
                    <span className="font-bold text-[#1877F2]">{savedWeeklyMinutes.toFixed(0)} min</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600 mt-1.5">
                    <span>Yearly time saved</span>
                    <span className="font-bold text-[#1877F2]">{savedYearlyHours.toFixed(0)} h</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-blue-100 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1877F2] to-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, Math.min(100, savedPercent))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#1877F2]">{savedPercent}% faster than manual uploads</p>
                </div>

                <div className="mt-5">
                  <Link href="/login">
                    <span className="w-full bg-[#1877F2] hover:bg-[#1461c7] text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer">
                      Start saving time <i className="fas fa-arrow-right" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="py-24 relative z-10 overflow-hidden bg-blue-50/40" id="benefits">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50 backdrop-blur-sm shadow-sm">
              Why advertisers choose us
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 drop-shadow-sm">
              Save precious hours with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1877F2] to-blue-500">Drive Sync</span>
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Uploading ads manually from your computer is losing you money. Switch to automated cloud syncing and reclaim your workflow.
            </p>
          </div>

          <div className="relative bg-white rounded-3xl border border-blue-100/50 p-2 shadow-2xl overflow-hidden max-w-6xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-red-50/40 via-transparent to-blue-50/40 pointer-events-none" />
            <div className="grid md:grid-cols-2 relative bg-white/30 rounded-2xl overflow-hidden">
              {/* OLD WORKFLOW */}
              <div className="relative p-8 md:p-12 border-b md:border-b-0 md:border-r border-white/30 group">
                <div className="absolute inset-0 bg-red-50/20 backdrop-blur-[2px] z-0" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-red-100/80 flex items-center justify-center text-red-500 shadow-inner border border-red-200">
                      <i className="fas fa-history text-lg" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">Old Workflow</h3>
                      <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Manual & Slow</p>
                    </div>
                  </div>
                  <div className="relative flex-1 min-h-[300px] flex items-center justify-center">
                    <div className="absolute top-0 right-10 rotate-12 p-4 bg-white/60 border border-red-200 rounded-xl shadow-lg w-48 backdrop-blur-sm transform transition-transform group-hover:rotate-6 group-hover:scale-105 duration-500">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="bg-red-100 p-1.5 rounded-md text-red-500"><i className="fas fa-download text-xs" /></div>
                        <span className="text-xs font-bold text-gray-700">Download.zip</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 w-2/3" />
                      </div>
                      <p className="text-[10px] text-red-500 mt-1 font-medium">Slow download...</p>
                    </div>
                    <div className="absolute bottom-10 left-4 -rotate-6 p-4 bg-white/60 border border-red-200 rounded-xl shadow-lg w-52 backdrop-blur-sm transform transition-transform group-hover:-rotate-3 group-hover:scale-105 duration-500">
                      <div className="flex items-center gap-3">
                        <div className="bg-red-100 p-1.5 rounded-md text-red-500"><i className="fas fa-exclamation-triangle text-xs" /></div>
                        <div>
                          <span className="text-xs font-bold text-gray-700">Meta Error #401</span>
                          <p className="text-[10px] text-gray-500">Upload failed. Try again.</p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                      <div className="bg-red-500/10 border border-red-200 rounded-full p-6 backdrop-blur-md">
                        <i className="fas fa-spinner fa-spin text-3xl text-red-500 opacity-70" />
                      </div>
                    </div>
                    <div className="absolute top-20 left-10 -rotate-12 opacity-60">
                      <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-[10px] text-red-600 font-mono">IMG_2024.jpg</div>
                    </div>
                    <div className="absolute bottom-20 right-8 rotate-6 opacity-60">
                      <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-md text-[10px] text-red-600 font-mono">Final_v2_REAL.mp4</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ARROW DIVIDER */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex flex-col items-center justify-center">
                <div className="bg-white p-2 rounded-full shadow-xl ring-4 ring-white/50" style={{ boxShadow: "0 4px 20px rgba(24,119,242,0.2)" }}>
                  <i className="fas fa-arrow-right text-[#1877F2] text-xl" />
                </div>
              </div>

              {/* NEW WORKFLOW */}
              <div className="relative p-8 md:p-12 bg-gradient-to-br from-blue-50/40 to-white/40 group">
                <div className="absolute inset-0 bg-blue-500/5 backdrop-blur-[1px] z-0" />
                <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1877F2] to-blue-500 text-white flex items-center justify-center shadow-lg" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.3)" }}>
                      <i className="fas fa-bolt text-lg" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800">Auto-ads Workflow</h3>
                      <p className="text-xs text-[#1877F2] font-medium uppercase tracking-wide">Automated & Instant</p>
                    </div>
                  </div>
                  <div className="relative flex-1 flex flex-col justify-center gap-4">
                    {[
                      { icon: "fab fa-google-drive", title: "Direct Drive Sync", desc: "Zero upload time. Files appear instantly." },
                      { icon: "fas fa-shield-alt", title: "Auto-disable Protection", desc: "Blocks unwanted enhancements automatically." },
                      { icon: "fas fa-list-ol", title: "Smart Organization", desc: "Filenames become ad names. 100% clarity." },
                    ].map((item, idx) => (
                      <div key={idx}>
                        <div className="flex items-center gap-4 p-4 rounded-xl bg-white/70 border border-blue-100 shadow-lg backdrop-blur-md transform transition-all hover:scale-[1.02] hover:bg-white/90 cursor-default group/item" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.05)" }}>
                          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-50 text-[#1877F2] flex items-center justify-center shadow-inner group-hover/item:scale-110 transition-transform">
                            <i className={`${item.icon} text-xl`} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-900 text-sm">{item.title}</h4>
                            <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
                          </div>
                          <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                            <i className="fas fa-check text-[10px]" />
                          </div>
                        </div>
                        {idx < 2 && <div className="h-6 w-0.5 border-l-2 border-dashed border-blue-200 ml-10 opacity-50" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* STATS CARD */}
          <div className="mt-12 max-w-5xl mx-auto bg-white rounded-3xl p-8 shadow-2xl border border-blue-100/50" style={{ boxShadow: "0 10px 40px rgba(24,119,242,0.1)" }}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Reduce your workflow from <br />
                  <span className="text-red-500 line-through decoration-2 opacity-75">hours</span> to <span className="text-[#1877F2]">minutes</span>
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  Join <span className="text-[#1877F2] font-bold">1,200+ advertisers</span> who've saved their precious time for higher ROI tasks.
                </p>
                <Link href="/login">
                  <span className="bg-[#1877F2] hover:bg-[#1461c7] text-white px-6 py-3 rounded-full text-sm font-semibold transition-all inline-flex items-center gap-2 shadow-lg cursor-pointer transform hover:scale-105" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.25)" }} data-testid="button-get-started-benefits">
                    Get Started <i className="fas fa-arrow-right" />
                  </span>
                </Link>
                <p className="text-xs text-gray-400 mt-2"><i className="fas fa-check-circle text-green-500 mr-1" /> No credit card required</p>
              </div>
              <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                <div className="text-center md:text-left">
                  <div className="text-[#1877F2] text-xl mb-1 drop-shadow-sm"><i className="far fa-clock" /></div>
                  <div className="text-3xl font-extrabold text-gray-900">13 <span className="text-lg font-medium text-gray-500">min</span></div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">Avg time saved</div>
                  <div className="text-[10px] text-gray-400">per ad launch</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-[#1877F2] text-xl mb-1 drop-shadow-sm"><i className="fas fa-chart-line" /></div>
                  <div className="text-3xl font-extrabold text-gray-900">88.2 <span className="text-lg font-medium text-gray-500">%</span></div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">Time saved</div>
                  <div className="text-[10px] text-gray-400">on average</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-[#1877F2] text-xl mb-1 drop-shadow-sm"><i className="fas fa-users" /></div>
                  <div className="text-3xl font-extrabold text-gray-900">1,200+</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">Happy users</div>
                  <div className="text-[10px] text-gray-400">and growing daily</div>
                </div>
                <div className="text-center md:text-left">
                  <div className="text-[#1877F2] text-xl mb-1 drop-shadow-sm"><i className="fas fa-star" /></div>
                  <div className="text-3xl font-extrabold text-gray-900">4.8</div>
                  <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">Out of 5 stars</div>
                  <div className="text-[10px] text-gray-400">on average</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 relative z-10 bg-white" id="how-it-works">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50 backdrop-blur-sm">
              Simple process
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              How <span className="text-[#1877F2]">Auto-ads</span> works
            </h2>
            <p className="text-lg text-gray-500">
              Three simple steps to save you 100's of hours every month.
            </p>
          </div>
          <div className="relative max-w-5xl mx-auto">
            <div className="hidden md:block absolute top-[3.5rem] left-[15%] right-[15%] h-[2px] z-0" style={{ background: "repeating-linear-gradient(90deg, #1877F2 0, #1877F2 8px, transparent 8px, transparent 16px)" }} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              {[
                { icon: "fab fa-google-drive", title: "Get Started", desc: "Authorize your Google Drive account safely with one click.", step: 1 },
                { icon: "far fa-folder-open", title: "Select your folder", desc: "Choose the folder containing your ad creatives. We detect new files automatically.", step: 2 },
                { icon: "fas fa-rocket", title: "Auto-launch to Meta", desc: "Hit publish and watch your Drive files turn into live Meta Ads instantly.", step: 3 },
              ].map((item, index) => (
                <div key={index} className="text-center group flex flex-col items-center" data-testid={`card-how-it-works-${index}`}>
                  <div className="relative mb-10">
                    <div className="w-28 h-28 bg-white rounded-full flex items-center justify-center text-[#1877F2] text-4xl shadow-xl ring-[12px] ring-blue-50/80 group-hover:scale-110 transition-transform duration-300 relative z-20">
                      <i className={item.icon} />
                    </div>
                    <div className="absolute -top-3 -right-3 w-10 h-10 bg-[#1877F2] rounded-full border-4 border-white flex items-center justify-center text-lg font-bold shadow-lg text-white z-30">
                      {item.step}
                    </div>
                    {index < 2 && (
                      <div className="hidden md:flex absolute top-1/2 -right-8 transform -translate-y-1/2 z-10">
                        <i className="fas fa-chevron-right text-[#1877F2] opacity-30 text-xl" />
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-blue-100/50 shadow-sm p-6 rounded-2xl w-full max-w-[280px]">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* PRICING */}
      <section className="py-24 relative z-10 bg-blue-50/40" id="pricing">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50 backdrop-blur-sm">
              Pricing Plans
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Plans & <span className="text-[#1877F2]">pricing</span>
            </h2>
            <p className="text-lg text-gray-500 mb-8">
              Choose the plan that fits your needs. No hidden fees, no commitments.
            </p>
            <div className="flex justify-center items-center gap-4 mb-8">
              <span className={`text-sm font-semibold ${!isYearly ? 'text-gray-900' : 'text-gray-500'}`}>Monthly</span>
              <button
                onClick={() => setIsYearly(!isYearly)}
                className="w-12 h-6 bg-[#1877F2] rounded-full relative focus:outline-none shadow-md cursor-pointer overflow-hidden"
              >
                <span
                  className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-out shadow-sm ${isYearly ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
              <span className={`text-sm font-medium ${isYearly ? 'text-gray-900' : 'text-gray-500'}`}>Yearly <span className="text-[#1877F2] text-xs ml-1 font-bold">(2 months free)</span></span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* FREE */}
            <div className="bg-white border border-blue-100/50 shadow-sm rounded-3xl p-8 border-t-4 border-t-gray-200 hover:border-t-[#1877F2]/50 transition-colors" data-testid="card-pricing-free">
              <h3 className="text-xl font-bold text-gray-900">Free plan</h3>
              <p className="text-sm text-gray-500 mt-2 mb-6">Try Auto-ads risk-free</p>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-extrabold text-gray-900">€0</span>
                <span className="text-gray-500 ml-2">/forever</span>
              </div>
              <p className="text-xs text-gray-500 mb-6">No credit card required</p>
              <Link href="/login">
                <span className="block w-full py-3 px-4 bg-white/50 border border-[#1877F2]/20 text-[#1877F2] font-bold text-center rounded-xl hover:bg-[#1877F2] hover:text-white transition-all mb-8 shadow-sm backdrop-blur-sm cursor-pointer" data-testid="button-try-free-pricing">
                  Try it now for free
                </span>
              </Link>
              <ul className="space-y-4 text-sm">
                {freePlanFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center text-gray-700">
                    <i className="fas fa-check text-[#1877F2] mr-3 text-xs" /> {feature}
                  </li>
                ))}
              </ul>
            </div>
            {/* PAID */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#1877F2] relative shadow-2xl transform hover:-translate-y-2 transition-transform duration-300" style={{ boxShadow: "0 10px 40px rgba(24,119,242,0.2)" }} data-testid="card-pricing-paid">
              <div className="absolute top-0 right-0 bg-[#1877F2] text-white text-xs font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl shadow-lg">Most popular</div>
              <h3 className="text-xl font-bold text-gray-900">Rapid launch</h3>
              <p className="text-sm text-gray-500 mt-2 mb-6">Perfect for scaling agencies</p>
              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-extrabold text-gray-900">{isYearly ? "€290" : "€29"}</span>
                <span className="text-gray-500 ml-2">{isYearly ? "/year" : "/month"}</span>
              </div>
              <p className="text-xs text-[#1877F2] mb-6 font-semibold">{isYearly ? "2 months free — " : ""}Unlimited launches + Drive syncing</p>
              <Link href="/login">
                <span className="block w-full py-3 px-4 bg-gradient-to-r from-[#1877F2] to-blue-600 text-white font-bold text-center rounded-xl hover:shadow-lg transition-all mb-8 shadow-md cursor-pointer" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.4)" }} data-testid="button-get-started-pricing">
                  Get Started
                </span>
              </Link>
              <ul className="space-y-4 text-sm">
                {paidPlanFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center text-gray-700">
                    <i className="fas fa-check text-[#1877F2] mr-3 text-xs" /> {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-8">All plans include 24/7 support and a 14-day money-back guarantee</p>
        </motion.div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 relative z-10 overflow-hidden bg-white" id="testimonials">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50">
              Wall of love
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Loved by <span className="text-[#1877F2]">media buyers</span>
            </h2>
            <p className="text-lg text-gray-500">
              Don't just take our word for it. See what advertisers have to say about Auto-ads.
            </p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: 0.1 }} className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="testimonials-grid">
            {testimonials.map((t, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: idx * 0.1 }} className="bg-white border border-blue-100/50 shadow-sm hover:shadow-md transition-shadow p-6 rounded-2xl" data-testid={`card-testimonial-${idx}`}>
                <div className="flex text-yellow-400 text-xs mb-3 space-x-0.5">
                  <i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" /><i className="fas fa-star" />
                </div>
                <p className="text-sm text-gray-700 mb-4 leading-relaxed font-medium">
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <img alt={t.author} className="w-10 h-10 rounded-full ring-2 ring-blue-50 object-cover" src={t.img} loading="lazy" decoding="async" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{t.author}</h4>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="py-24 relative z-10" id="faq">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider text-[#1877F2] uppercase bg-blue-50/50 rounded-full border border-blue-100/50">
              Questions Answered
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              <span className="text-[#1877F2]">Frequently</span> asked questions
            </h2>
            <p className="text-lg text-gray-500">
              Everything you need to know about Auto-ads. Can't find what you're looking for? Reach out to our support team.
            </p>
          </div>
          <div className="space-y-4">
            {faqItems.map((faq, index) => (
              <details key={index} className="group bg-white border border-blue-100/50 shadow-sm rounded-xl" data-testid={`faq-item-${index}`}>
                <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-5 text-gray-900 hover:bg-white/30 transition-colors">
                  <span>{faq.q}</span>
                  <span className="transition group-open:rotate-180">
                    <i className="fas fa-chevron-down text-gray-400 text-sm" />
                  </span>
                </summary>
                <div className="text-gray-500 mt-0 px-5 pb-5 text-sm leading-relaxed border-t border-gray-100/50 pt-4">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-12 bg-white rounded-2xl p-8 text-center shadow-lg border border-blue-100/50">
            <h4 className="font-bold text-gray-900 mb-2">Still have questions?</h4>
            <p className="text-sm text-gray-500 mb-6">Our support team is here to help, send us an email. We typically respond within 2 hours.</p>
            <div className="flex justify-center flex-wrap gap-4">
              <a href="mailto:info@flowgens.com" className="bg-[#1877F2] hover:bg-[#1461c7] text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-lg" style={{ boxShadow: "0 4px 14px rgba(24,119,242,0.3)" }} data-testid="link-contact-support">
                Contact Support
              </a>
              <a href="#how-it-works" onClick={(e) => handleSmoothScroll(e, "how-it-works")} className="text-gray-700 hover:text-[#1877F2] px-5 py-2.5 rounded-full text-sm font-medium transition-colors border border-gray-300 bg-white/50 hover:bg-white/80" data-testid="button-watch-demo-faq">
                Watch demo <i className="fas fa-play text-xs ml-1" />
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 relative z-10 border-t border-white/10 overflow-hidden">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }} className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 drop-shadow-sm">
            Join the advertising <span className="text-[#1877F2]">revolution</span>
          </h2>
          <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto">
            Stop <span className="text-red-500 font-medium line-through">wasting precious hours</span> on manual uploads. Sync your Google Drive and save time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <span className="bg-gradient-to-r from-[#1877F2] to-blue-600 hover:to-blue-700 text-white px-8 py-4 rounded-full text-base font-semibold transition-all shadow-xl hover:scale-105 cursor-pointer inline-block" style={{ boxShadow: "0 10px 25px rgba(37,99,235,0.3)" }} data-testid="button-try-free-cta">
                Get Started
              </span>
            </Link>
            <a href="#pricing" onClick={(e) => handleSmoothScroll(e, "pricing")} className="glass-heavy hover:bg-white/90 text-gray-900 px-8 py-4 rounded-full text-base font-semibold transition-all shadow-md hover:scale-105 inline-block" data-testid="button-view-pricing">
              View pricing
            </a>
          </div>
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="glass-heavy pt-16 pb-8 border-t border-white/20 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/favicon.png"
                  alt="Auto-ads logo"
                  className="w-8 h-8 object-contain"
                />
                <span className="font-bold text-lg text-gray-900">Auto-ads</span>
              </div>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                The fastest way to upload ad creatives to Meta. Transform your advertising workflow in minutes, not hours.
              </p>
              <a href="mailto:info@flowgens.com" className="text-sm text-gray-500 hover:text-[#1877F2] transition-colors flex items-center gap-2" data-testid="link-footer-email">
                <i className="far fa-envelope" /> info@flowgens.com
              </a>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Navigation</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                {["Features", "Benefits", "How It Works", "Pricing", "Testimonials", "FAQ"].map((item) => (
                  <li key={item}>
                    <a
                      href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={(e) => handleSmoothScroll(e, item.toLowerCase().replace(/\s+/g, "-"))}
                      className="hover:text-[#1877F2] transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/terms" className="hover:text-[#1877F2] transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy-policy" className="hover:text-[#1877F2] transition-colors">Privacy Policy</Link></li>
                <li><Link href="/data-deletion" className="hover:text-[#1877F2] transition-colors">Data Deletion</Link></li>
              </ul>
            </div>
            <div />
          </div>
          <div className="border-t border-gray-200/50 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-400">
            <p>2025 Auto-ads. All rights reserved.</p>
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-2 md:mt-0 hover:text-[#1877F2] transition-colors cursor-pointer">
              Back to top <i className="fas fa-arrow-up ml-1" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
