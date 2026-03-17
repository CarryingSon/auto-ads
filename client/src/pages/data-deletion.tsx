import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Zap, Trash2, Mail, Settings, ExternalLink } from "lucide-react";
import { SiFacebook } from "react-icons/si";

export default function DataDeletion() {
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
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="w-8 h-8 text-destructive" />
          <h1 className="text-3xl font-bold">Data Deletion Instructions (Auto Ads)</h1>
        </div>
        <p className="text-muted-foreground mb-8">How to request deletion of your data from Auto Ads</p>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">How to Delete Your Data</h2>
            <p className="text-muted-foreground mb-6">
              Follow these steps to remove Auto Ads access and request deletion of your stored data.
            </p>

            <div className="space-y-4">
              <Card className="p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <SiFacebook className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Step 1: Remove Auto Ads from Facebook</h3>
                    <p className="text-muted-foreground mb-3">
                      Disconnect Auto Ads from your Facebook/Meta account to stop future access:
                    </p>
                    <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                      <li>Go to Facebook <strong>Settings & Privacy</strong></li>
                      <li>Click <strong>Settings</strong></li>
                      <li>Navigate to <strong>Apps and Websites</strong></li>
                      <li>Find <strong>Auto Ads</strong> in the list</li>
                      <li>Click <strong>Remove</strong> to revoke access</li>
                    </ol>
                    <a 
                      href="https://www.facebook.com/settings?tab=applications" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
                    >
                      Open Facebook App Settings
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </Card>

              <Card className="p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Step 2: Email Us to Delete Your Data</h3>
                    <p className="text-muted-foreground mb-3">
                      Send an email to request deletion of all your data stored in Auto Ads:
                    </p>
                    <div className="bg-muted/50 rounded-lg p-4 mb-3">
                      <p className="text-sm mb-2"><strong>To:</strong> <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a></p>
                      <p className="text-sm mb-2"><strong>Subject:</strong> Auto Ads - Data Deletion Request</p>
                      <p className="text-sm"><strong>Include:</strong></p>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground mt-1">
                        <li>Your email address used in Auto Ads</li>
                        <li>Your Meta Ad Account ID (if known)</li>
                        <li>Your Facebook Page ID (if known)</li>
                      </ul>
                    </div>
                    <a 
                      href="mailto:info@flowgens.com?subject=Auto%20Ads%20-%20Data%20Deletion%20Request&body=Please%20delete%20all%20my%20data%20from%20Auto%20Ads.%0A%0AEmail%20used%3A%20%0AMeta%20Ad%20Account%20ID%3A%20%0AFacebook%20Page%20ID%3A%20"
                      className="inline-flex items-center gap-2"
                    >
                      <Button size="sm" variant="outline" className="gap-2" data-testid="button-send-deletion-email">
                        <Mail className="w-4 h-4" />
                        Send Deletion Request Email
                      </Button>
                    </a>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">What Data We Delete</h2>
            <Card className="p-6 shadow-sm">
              <p className="text-muted-foreground mb-4">
                When you request data deletion, we will remove the following from Auto Ads:
              </p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>Your account email and profile information</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>Saved configuration and default settings</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>Stored Meta account IDs, page IDs, and pixel IDs</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>Access tokens (if stored)</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-destructive" />
                  <span>Upload history and job logs</span>
                </li>
              </ul>
            </Card>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Important Notes</h2>
            <Card className="p-6 border-amber-500/20 bg-amber-500/5 shadow-sm">
              <div className="flex items-start gap-3">
                <Settings className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300 mb-2">
                    Ads Created on Meta Are Not Deleted
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Auto Ads only deletes data stored within our application. Any campaigns, ad sets, ads, or creatives created on Meta (Facebook/Instagram) through our app remain in your Meta Ads Manager. To delete those, you must manage them directly in Meta Ads Manager.
                  </p>
                </div>
              </div>
            </Card>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Processing Time</h2>
            <p className="text-muted-foreground">
              We will process your deletion request and remove your data within <strong>30 days</strong> of receiving your email. You will receive a confirmation email once your data has been deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Questions?</h2>
            <p className="text-muted-foreground">
              If you have any questions about data deletion, please contact us at{" "}
              <a href="mailto:info@flowgens.com" className="text-primary hover:underline">info@flowgens.com</a>.
            </p>
            <p className="text-muted-foreground mt-2">
              You can also reach me directly at{" "}
              <a href="mailto:martin@flowgens.com" className="text-primary hover:underline">martin@flowgens.com</a>.
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
