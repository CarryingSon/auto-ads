import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-xl overflow-hidden shadow-lg ring-1 ring-border/40">
                <img src="/favicon.png" alt="Auto Ads logo" className="w-full h-full object-cover" />
              </div>
              <span className="font-semibold">Auto Ads</span>
            </div>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy (Auto Ads)</h1>
        <p className="text-muted-foreground mb-8">Last Updated: 5.1.2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <p>
            Welcome to Auto Ads ("we," "our," or "us"). This Privacy Policy explains how we collect, use, and protect information when you use our web-based application (the "App"). The App helps users create and manage advertising assets on Meta platforms (Facebook/Instagram) by uploading ad creatives (images/videos) and creating campaigns, ad sets, ads, and creatives through the Meta Marketing API.
          </p>
          <p>
            By using the App, you agree to this Privacy Policy. If you do not agree, do not use the App.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-4">1) Information We Collect</h2>
            <p className="mb-4">We collect only the information needed to provide the App.</p>
            
            <h3 className="text-lg font-medium mb-2">1.1 Account Information</h3>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Email address (if you create an account with email): used for account access and support communications.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">1.2 Meta (Facebook/Instagram) Account & Advertising Data</h3>
            <p className="mb-2">When you connect your Meta account (OAuth / "Login with Facebook"), we may process:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Meta Business / Ad Account identifiers (e.g., ad account ID)</li>
              <li>Page identifiers (Facebook Page ID) and Instagram actor identifiers (if used)</li>
              <li>Campaign / ad set / ad / creative identifiers created by the App</li>
              <li>Ad configuration inputs you provide (objective, targeting basics, placements, budgets settings depending on your setup)</li>
              <li>Media identifiers (e.g., uploaded image hash, video ID) required to publish creatives</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">1.3 Files / Media You Provide</h3>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Images and videos you upload or link for ad creation.</li>
              <li>The App may temporarily download or process media to upload it to Meta.</li>
            </ul>

            <h3 className="text-lg font-medium mb-2">1.4 Technical & Log Data (Minimal)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Basic logs needed to debug failures (e.g., request status, error messages, timestamps).</li>
              <li>We do not use tracking cookies for advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2) How We Use Your Information</h2>
            <p className="mb-4">We use your information only to operate and improve the core functionality of the App:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Account management:</strong> provide sign-in and support.</li>
              <li><strong>Meta ad operations:</strong> create and manage campaigns, ad sets, ads, and creatives on your behalf.</li>
              <li><strong>Media processing:</strong> upload images/videos to Meta for use in ads.</li>
              <li><strong>Troubleshooting:</strong> diagnose API errors and fix delivery issues (e.g., ad creative creation failures).</li>
            </ul>
            <p>We do not sell your data. We do not use your data for third-party advertising or profiling.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3) Meta Permissions ("Login with Facebook")</h2>
            <p className="mb-4">
              If you connect your Meta account, you authorize the App to access Meta resources needed for the App to function (for example, reading ad accounts and creating ads/creatives, depending on permissions you grant).
            </p>
            <p className="mb-2">We use Meta access only to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>access the ad account/page you select,</li>
              <li>create and manage ad assets you request,</li>
              <li>retrieve technical info necessary to confirm results.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">4) Data Sharing & Third-Party Services</h2>
            <p className="mb-4">We share data only with service providers required to run the App:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Meta Platforms, Inc.</strong> (Facebook/Instagram) — to create and manage advertising assets using the Meta Marketing API.</li>
              <li><strong>Hosting / infrastructure provider</strong> (e.g., Replit and associated cloud infrastructure) — to host the App.</li>
              <li><strong>Database / storage provider:</strong> we store App data using Replit's database/storage (as part of our infrastructure).</li>
              <li><strong>Payment processor</strong> (e.g., Stripe, if subscriptions are enabled) — payments are processed by the payment provider; we do not store full card details.</li>
            </ul>
            <p>We do not share your personal information with third parties for their own marketing.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">5) Data Retention</h2>
            <p className="mb-4">We retain data only as long as necessary:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Account data is kept while your account is active.</li>
              <li>Operational identifiers (ad IDs, creative IDs, etc.) may be stored to show results and allow future management.</li>
              <li>Logs are kept for a limited period to debug issues and maintain reliability.</li>
            </ul>
            <p>You may request deletion as described below.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">6) Security</h2>
            <p>We use reasonable technical and organizational measures to protect your information. However, no online service can guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">7) Your Choices & Rights</h2>
            <p className="mb-4">You can:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Request access to your stored account data.</li>
              <li>Request deletion of your App data (see Section 10).</li>
              <li>Disconnect Meta access by removing the App in your Facebook settings (this stops future access).</li>
            </ul>
            <p>Depending on your location, you may have rights under applicable data protection laws (e.g., GDPR/UK GDPR). We will honor valid requests as required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">8) International Transfers</h2>
            <p>Your data may be processed in countries where our service providers operate (for example where hosting and Meta infrastructure is located). We take steps to use reputable providers and process data in accordance with applicable law.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">9) Children's Privacy</h2>
            <p>The App is not intended for children under 13, and we do not knowingly collect their personal information.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10) Data Deletion Instructions</h2>
            <p className="mb-4">To request deletion of your App data, email us at:</p>
            <p className="mb-4"><strong>Email:</strong> <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a></p>
            <p className="mb-2">Include:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>the email address used in the App,</li>
              <li>the Meta ad account ID (if applicable),</li>
              <li>and a clear request to delete your data.</li>
            </ul>
            <p>We will respond and delete applicable App-stored data within a reasonable timeframe. Note: advertising assets created on Meta (campaigns, ads, creatives) are managed within your Meta account; deletion on Meta may require actions inside Meta Ads Manager.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">11) Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Updates will be posted on this page with a new "Last Updated" date.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">12) Contact</h2>
            <p className="mb-2">For privacy questions or requests:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Email:</strong> <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a></li>
              <li><strong>Website:</strong> <a href="https://www.auto-ads.co" className="text-primary hover:underline">https://www.auto-ads.co</a></li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
          2025 Auto Ads. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
