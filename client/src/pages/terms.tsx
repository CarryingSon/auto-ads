import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Zap } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/70 rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                <Zap className="w-4 h-4 text-primary-foreground" />
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service (Auto Ads)</h1>
        <p className="text-muted-foreground mb-8">Last Updated: 5 Jan 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <p>
            Welcome to Auto Ads, a software-as-a-service (SaaS) platform designed to facilitate the connection of Meta (Facebook/Instagram) advertising accounts and the efficient creation and upload of ad creatives to Meta Ads. By accessing or using Auto Ads (the "Service"), you agree to be legally bound by these Terms of Service (the "Terms"). If you do not agree to these Terms, you must not use the Service.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-4">1. Definitions</h2>
            <p className="mb-4">For the purposes of these Terms, the following definitions apply:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service:</strong> The Auto Ads platform and all associated services provided by Auto Ads.</li>
              <li><strong>User or You:</strong> Any individual or entity using the Service.</li>
              <li><strong>Content:</strong> Any images, videos, text, ad copy, or other materials uploaded by Users to the Service.</li>
              <li><strong>Ad Account ID:</strong> The unique identifier assigned to a User's Meta advertising account.</li>
              <li><strong>Meta:</strong> Meta Platforms, Inc., including Facebook and Instagram and their APIs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">2. Acceptance of Terms</h2>
            <p>
              By registering for an account or using the Service, you confirm that you are at least 18 years old and have the legal capacity to enter into this binding agreement. You also confirm that you have read, understood, and agree to comply with these Terms and our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">3. Account Registration and Security</h2>
            <p className="mb-4">
              Access to the Service may require account registration. You agree to provide accurate and complete information and to keep it up to date.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activities conducted under your account. You must notify Auto Ads immediately of any unauthorized use of your account by contacting <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">4. Description of the Service</h2>
            <p className="mb-4">Auto Ads provides tools that may include:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Connecting Meta advertising accounts through Meta's authentication/authorization flows (where applicable)</li>
              <li>Creating campaigns, ad sets, ads, and ad creatives via Meta's APIs</li>
              <li>Uploading images and videos for use in ad creatives</li>
              <li>Managing and organizing ad creation workflows</li>
            </ul>
            <p>Auto Ads may update, modify, suspend, or discontinue features at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">5. Pricing and Payment Terms</h2>
            <p className="mb-4">
              Auto Ads may offer free or paid subscription plans. If you purchase a subscription, you agree to pay the applicable fees and taxes for your plan.
            </p>
            <p className="mb-4">
              Payments (if enabled) are processed by third-party payment providers. Auto Ads does not store full payment card details.
            </p>
            <p>
              Auto Ads may change pricing or plan structures at any time. If changes affect an active subscription, we will provide notice where required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">6. Refund Policy</h2>
            <p>
              If Auto Ads offers paid subscriptions, refunds (if any) will be handled according to the refund rules shown at the time of purchase and/or required by applicable law. For refund requests, contact <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">7. User Content and Ownership</h2>
            <p className="mb-4">You retain full ownership of your Content.</p>
            <p className="mb-4">
              By submitting Content to the Service, you grant Auto Ads a non-exclusive, worldwide, royalty-free license to use, store, process, and display such Content solely to provide and operate the Service (including uploading it to Meta when you request ad creation).
            </p>
            <p>
              You represent and warrant that you have all necessary rights to upload and use the Content and that it does not violate any laws or third-party rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">8. Privacy</h2>
            <p>
              Auto Ads collects and processes only the information necessary to provide the Service, such as account information and Meta advertising identifiers. Details are described in our <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">9. Third-Party Services and Meta API Use</h2>
            <p className="mb-4">
              The Service integrates with third-party platforms and services, including Meta's APIs and hosting/infrastructure providers (e.g., Replit).
            </p>
            <p className="mb-4">
              Your use of Meta products and APIs is also governed by Meta's terms, policies, and platform rules. You are responsible for complying with all applicable Meta policies when using the Service.
            </p>
            <p>
              Auto Ads is not responsible for third-party downtime, API changes, account restrictions, policy enforcement actions, or other third-party decisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">10. Intellectual Property</h2>
            <p className="mb-4">
              All elements of Auto Ads, excluding User Content, are the property of Auto Ads or its licensors and are protected by applicable intellectual property laws.
            </p>
            <p>
              You may not copy, modify, distribute, sell, lease, reverse engineer, or create derivative works of the Service (except to the extent allowed by mandatory law) without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">11. Prohibited Conduct</h2>
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service for unlawful, harmful, or fraudulent purposes</li>
              <li>Violate Meta's advertising policies or platform rules using the Service</li>
              <li>Infringe the rights of any third party</li>
              <li>Attempt unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the operation of the Service</li>
              <li>Upload malware, malicious code, or harmful content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">12. Disclaimers</h2>
            <p className="mb-4">
              The Service is provided on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
            </p>
            <p>Auto Ads does not guarantee that:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>ads will be approved by Meta,</li>
              <li>campaigns will perform or deliver,</li>
              <li>the Service will be uninterrupted or error-free.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">13. Limitation of Liability</h2>
            <p className="mb-4">
              To the maximum extent permitted by law, Auto Ads shall not be liable for indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill.
            </p>
            <p>
              To the maximum extent permitted by law, Auto Ads' total aggregate liability for any claims relating to the Service shall not exceed the amount paid by you to Auto Ads in the 12 months preceding the event giving rise to the claim (or, if you have not paid anything, a nominal amount).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">14. Indemnification</h2>
            <p className="mb-4">
              You agree to indemnify, defend, and hold harmless Auto Ads from and against any claims, damages, liabilities, losses, and expenses (including reasonable legal fees) arising out of:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>your use of the Service,</li>
              <li>your Content,</li>
              <li>your violation of these Terms,</li>
              <li>your violation of Meta policies or third-party rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">15. Termination</h2>
            <p className="mb-4">
              Auto Ads may suspend or terminate your access to the Service at any time if we reasonably believe you have violated these Terms, Meta policies, or applicable law.
            </p>
            <p>
              You may stop using the Service at any time. Upon termination, your right to use the Service ends immediately. We may delete your data in accordance with our Privacy Policy and applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">16. Governing Law and Dispute Resolution (Global)</h2>
            <p className="mb-4">These Terms are intended to apply worldwide.</p>
            <p className="mb-4">
              To the extent permitted by law, these Terms and any dispute, claim, or controversy arising out of or relating to the Service shall be governed by the laws of the jurisdiction in which the Service operator is established, without regard to conflict of law principles.
            </p>
            <p className="mb-4">
              If you are a consumer, nothing in these Terms limits any mandatory consumer protection rights you may have under the laws of your country of residence.
            </p>
            <p>
              Before initiating any formal proceedings, you agree to first contact us at <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a> and attempt to resolve the dispute informally. If the dispute is not resolved within a reasonable time, either party may bring a claim in the competent courts of the Service operator's jurisdiction, unless mandatory local law provides otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">17. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will post the updated Terms on our website and update the "Last Updated" date. Continued use of the Service after changes means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">18. Contact</h2>
            <p className="mb-2">For questions about these Terms, contact us at:</p>
            <p>
              <strong>Email:</strong> <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a>
            </p>
          </section>
        </div>
      </main>

      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border/50">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <span>2025 Auto Ads. All rights reserved.</span>
          <span className="hidden sm:inline">|</span>
          <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
