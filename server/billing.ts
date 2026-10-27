import Stripe from "stripe";
import { and, eq, isNull, or } from "drizzle-orm";

import { db, pool } from "./db.js";
import { launchCount, launchUsageWhere } from "./job-queue.js";
import { countRewardedReferrals, REFERRAL_BONUS_CREDITS } from "./referrals.js";
import {
  billingPayments,
  billingSubscriptions,
  complimentaryPro,
  globalSettings,
  jobQueue,
  type BillingSubscription,
  type InsertBillingPayment,
  type InsertBillingSubscription,
} from "../shared/schema.js";

// Free plan: a one-off allowance of successful launches, not a monthly one.
// Each launch uses one credit however many creatives it has; failed launches
// use none. Inviting a friend adds REFERRAL_BONUS_CREDITS.
export const FREE_LAUNCH_CREDITS = 5;
// Launches before this date were under the old 3-per-month plan and do not
// use up credits, so existing free users start with a full allowance.
export const FREE_CREDITS_COUNT_FROM = new Date("2026-10-26T00:00:00Z");
const FALLBACK_PRICING = {
  monthly: { interval: "month" as const, unitAmountCents: 2900 },
  yearly: { interval: "year" as const, unitAmountCents: 29000 },
};

const STRIPE_PRO_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

let stripeClient: Stripe | null = null;
const resolvedPriceIdCache = new Map<"monthly" | "yearly", string>();

export type BillingPlanType = "free" | "pro";
export type BillingInterval = "monthly" | "yearly" | null;

export interface BillingStatus {
  planType: BillingPlanType;
  billingInterval: BillingInterval;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  uploadsUsed: number;
  uploadsLimit: number | null;
  uploadsRemaining: number | null;
  referralBonusCredits: number;
  canLaunch: boolean;
}

function resolveStripeSecretKey(): string {
  const raw = process.env.STRIPE_SECRET_KEY;
  if (!raw) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  let key = raw.trim();
  const quoted =
    (key.startsWith(`"`) && key.endsWith(`"`)) ||
    (key.startsWith(`'`) && key.endsWith(`'`));
  if (quoted && key.length >= 2) {
    key = key.slice(1, -1).trim();
  }
  // Defensive sanitization for accidental copy/paste punctuation.
  if (key.endsWith(",")) {
    key = key.slice(0, -1).trim();
  }
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is empty after normalization");
  }
  if (key.startsWith("pk_")) {
    throw new Error("STRIPE_SECRET_KEY must be a secret key (sk_*), not publishable (pk_*)");
  }
  return key;
}

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(resolveStripeSecretKey());
  }
  return stripeClient;
}

function toDateOrNull(unixSeconds?: number | null): Date | null {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000);
}

function mapStripeInterval(interval: string | null | undefined): BillingInterval {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

function normalizeEnvValue(raw: string | undefined | null): string {
  if (!raw) return "";
  let value = raw.trim();
  const quoted =
    (value.startsWith(`"`) && value.endsWith(`"`)) ||
    (value.startsWith(`'`) && value.endsWith(`'`));
  if (quoted && value.length >= 2) {
    value = value.slice(1, -1).trim();
  }
  if (value.endsWith(",")) {
    value = value.slice(0, -1).trim();
  }
  return value;
}

function parsePriceAmountCents(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

async function resolvePriceId(interval: "monthly" | "yearly"): Promise<string> {
  const cached = resolvedPriceIdCache.get(interval);
  if (cached) return cached;

  const monthlyRaw = process.env.STRIPE_PRICE_MONTHLY_EUR || process.env.STRIPE_PRICE_MONTHLY_ID;
  const yearlyRaw = process.env.STRIPE_PRICE_YEARLY_EUR || process.env.STRIPE_PRICE_YEARLY_ID;
  const configuredValue = normalizeEnvValue(interval === "monthly" ? monthlyRaw : yearlyRaw);
  const fallbackConfig = FALLBACK_PRICING[interval];

  let configuredAmountCents: number | null = null;
  if (configuredValue) {
    if (configuredValue.startsWith("price_")) {
      resolvedPriceIdCache.set(interval, configuredValue);
      return configuredValue;
    }
    configuredAmountCents = parsePriceAmountCents(configuredValue);
    if (configuredAmountCents === null) {
      throw new Error(
        interval === "monthly"
          ? "Stripe monthly price must be a price id (price_...) or numeric amount (e.g. 29)."
          : "Stripe yearly price must be a price id (price_...) or numeric amount (e.g. 290).",
      );
    }
  }

  const stripe = getStripe();
  const prices = await stripe.prices.list({
    active: true,
    currency: "eur",
    type: "recurring",
    recurring: { interval: fallbackConfig.interval },
    limit: 100,
  });

  const candidates = prices.data
    .filter((price) =>
      price.recurring?.interval === fallbackConfig.interval &&
      price.unit_amount === (configuredAmountCents ?? fallbackConfig.unitAmountCents),
    )
    .sort((a, b) => b.created - a.created);

  const expectedAmountCents = configuredAmountCents ?? fallbackConfig.unitAmountCents;
  const expectedAmount = (expectedAmountCents / 100).toFixed(2);

  if (candidates.length === 0) {
    throw new Error(
      interval === "monthly"
        ? `Stripe monthly price id is missing. Set STRIPE_PRICE_MONTHLY_EUR or create one active recurring EUR ${expectedAmount}/month price.`
        : `Stripe yearly price id is missing. Set STRIPE_PRICE_YEARLY_EUR or create one active recurring EUR ${expectedAmount}/year price.`,
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      interval === "monthly"
        ? `Multiple active monthly EUR ${expectedAmount} prices found. Set STRIPE_PRICE_MONTHLY_EUR explicitly.`
        : `Multiple active yearly EUR ${expectedAmount} prices found. Set STRIPE_PRICE_YEARLY_EUR explicitly.`,
    );
  }

  const resolvedId = candidates[0].id;
  resolvedPriceIdCache.set(interval, resolvedId);
  return resolvedId;
}

function isStripeSubscriptionPro(row: BillingSubscription | null | undefined, now = new Date()): boolean {
  if (!row) return false;
  if (STRIPE_PRO_STATUSES.has((row.status || "").toLowerCase())) return true;
  if (
    (row.status || "").toLowerCase() === "canceled" &&
    row.currentPeriodEnd &&
    row.currentPeriodEnd > now
  ) {
    return true;
  }
  return false;
}

function isLegacyPro(globalPlanType: string | null | undefined): boolean {
  return (globalPlanType || "").toLowerCase() === "pro";
}

let ensureComplimentaryTablePromise: Promise<void> | null = null;

// Same table as migrations/0010_complimentary_pro.sql, so a deploy works
// before the migration has been run.
async function ensureComplimentaryTable(): Promise<void> {
  if (!ensureComplimentaryTablePromise) {
    ensureComplimentaryTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS complimentary_pro (
          user_id varchar PRIMARY KEY NOT NULL,
          note text,
          granted_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
          revoked_at timestamp
        );
      `);
      await pool.query(`ALTER TABLE complimentary_pro ENABLE ROW LEVEL SECURITY;`);
    })().catch((error) => {
      ensureComplimentaryTablePromise = null;
      throw error;
    });
  }
  await ensureComplimentaryTablePromise;
}

export async function hasComplimentaryPro(userId: string): Promise<boolean> {
  await ensureComplimentaryTable();
  const [row] = await db
    .select({ userId: complimentaryPro.userId })
    .from(complimentaryPro)
    .where(and(eq(complimentaryPro.userId, userId), isNull(complimentaryPro.revokedAt)))
    .limit(1);
  return Boolean(row);
}

export async function countFreeLaunchesUsed(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: launchCount })
    .from(jobQueue)
    .where(launchUsageWhere(userId, FREE_CREDITS_COUNT_FROM));
  return Number(row?.count || 0);
}

export function freeLaunchLimit(rewardedReferrals: number): number {
  return FREE_LAUNCH_CREDITS + REFERRAL_BONUS_CREDITS * rewardedReferrals;
}

export async function getBillingSubscriptionForUser(userId: string): Promise<BillingSubscription | null> {
  const [row] = await db
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .limit(1);
  return row || null;
}

export async function findBillingSubscriptionByStripeRefs(params: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}): Promise<BillingSubscription | null> {
  const { stripeCustomerId, stripeSubscriptionId } = params;
  if (!stripeCustomerId && !stripeSubscriptionId) return null;

  const clauses = [];
  if (stripeCustomerId) clauses.push(eq(billingSubscriptions.stripeCustomerId, stripeCustomerId));
  if (stripeSubscriptionId) clauses.push(eq(billingSubscriptions.stripeSubscriptionId, stripeSubscriptionId));

  const [row] = await db
    .select()
    .from(billingSubscriptions)
    .where(clauses.length > 1 ? or(...clauses) : clauses[0])
    .limit(1);

  return row || null;
}

export async function upsertBillingSubscriptionForUser(
  userId: string,
  updates: Partial<InsertBillingSubscription>,
): Promise<BillingSubscription> {
  const existing = await getBillingSubscriptionForUser(userId);
  if (existing) {
    const [updated] = await db
      .update(billingSubscriptions)
      .set({
        ...updates,
        userId,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(billingSubscriptions)
    .values({
      userId,
      ...updates,
    })
    .returning();
  return created;
}

async function resolveStripeCustomerUserId(
  stripeCustomerId: string | null | undefined,
): Promise<string | null> {
  if (!stripeCustomerId) return null;

  const existing = await findBillingSubscriptionByStripeRefs({ stripeCustomerId });
  if (existing?.userId) return existing.userId;

  const stripe = getStripe();
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (!("deleted" in customer) && customer.metadata?.userId) {
      return customer.metadata.userId;
    }
  } catch (error) {
    console.warn("[Billing] Failed to resolve customer metadata:", error);
  }
  return null;
}

export async function getBillingStatusForUser(userId: string, now = new Date()): Promise<BillingStatus> {
  const [subscription, settings, uploadsUsed, rewardedReferrals, complimentary] = await Promise.all([
    getBillingSubscriptionForUser(userId),
    db
      .select({
        planType: globalSettings.planType,
      })
      .from(globalSettings)
      .where(eq(globalSettings.userId, userId))
      .limit(1),
    countFreeLaunchesUsed(userId),
    // Invite bonuses only add to the free allowance. If they cannot be read,
    // the status (and paying users' Pro) must still load, so count none.
    countRewardedReferrals(userId).catch((error) => {
      console.warn("[Billing] Could not read referral bonuses", { userId, error: error instanceof Error ? error.message : error });
      return 0;
    }),
    hasComplimentaryPro(userId).catch((error) => {
      console.warn("[Billing] Could not read complimentary Pro", { userId, error: error instanceof Error ? error.message : error });
      return false;
    }),
  ]);

  const globalPlanType = settings[0]?.planType || "free";
  const hasStripePro = isStripeSubscriptionPro(subscription, now);
  const hasComplimentary = !hasStripePro && complimentary;
  // A hand-set "pro" in global_settings predates Stripe billing. It only
  // counts for accounts that never had a Stripe subscription: the webhook
  // also writes "pro" there while a cancelled subscription runs out, and
  // nothing sets it back afterwards, so honouring it would keep Pro forever.
  const hasLegacyPro =
    !hasStripePro && !hasComplimentary && !subscription?.stripeSubscriptionId && isLegacyPro(globalPlanType);
  const planType: BillingPlanType = hasStripePro || hasComplimentary || hasLegacyPro ? "pro" : "free";
  const referralBonusCredits = REFERRAL_BONUS_CREDITS * rewardedReferrals;
  const uploadsLimit = planType === "free" ? freeLaunchLimit(rewardedReferrals) : null;
  const uploadsRemaining = uploadsLimit === null ? null : Math.max(0, uploadsLimit - uploadsUsed);

  return {
    planType,
    billingInterval: hasStripePro ? (subscription?.interval as BillingInterval) || null : null,
    subscriptionStatus: hasStripePro
      ? subscription?.status || null
      : hasComplimentary
        ? "complimentary"
        : hasLegacyPro
          ? "legacy_pro"
          : "free",
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    uploadsUsed,
    uploadsLimit,
    uploadsRemaining,
    referralBonusCredits,
    canLaunch: planType === "pro" || (uploadsRemaining ?? 0) > 0,
  };
}

async function getOrCreateStripeCustomerForUser(userId: string, email?: string | null): Promise<string> {
  const existing = await getBillingSubscriptionForUser(userId);
  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { userId },
  });

  await upsertBillingSubscriptionForUser(userId, {
    stripeCustomerId: customer.id,
  });

  return customer.id;
}

export async function createCheckoutSessionForUser(params: {
  userId: string;
  email?: string | null;
  interval: "monthly" | "yearly";
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomerForUser(params.userId, params.email);
  const priceId = await resolvePriceId(params.interval);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    metadata: {
      userId: params.userId,
      interval: params.interval,
    },
    subscription_data: {
      metadata: {
        userId: params.userId,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session URL is missing");
  }
  return session.url;
}

export async function createPortalSessionForUser(params: {
  userId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const subscription = await getBillingSubscriptionForUser(params.userId);
  const customerId = subscription?.stripeCustomerId;
  if (!customerId) {
    throw new Error("No Stripe customer found for this user");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: params.returnUrl,
  });

  return portal.url;
}

function resolveStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id || null;
}

function resolveStripeSubscriptionId(
  subscription: string | Stripe.Subscription | null,
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id || null;
}

export async function syncSubscriptionFromStripeEvent(
  subscription: Stripe.Subscription,
): Promise<BillingSubscription | null> {
  const stripeCustomerId = resolveStripeCustomerId(subscription.customer as any);
  const stripeSubscriptionId = subscription.id;

  const existing = await findBillingSubscriptionByStripeRefs({
    stripeCustomerId,
    stripeSubscriptionId,
  });

  let userId =
    existing?.userId ||
    subscription.metadata?.userId ||
    (await resolveStripeCustomerUserId(stripeCustomerId));

  if (!userId) {
    console.warn("[Billing] Unable to map subscription webhook to user", {
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return null;
  }

  const interval = mapStripeInterval(subscription.items.data[0]?.price?.recurring?.interval || null);
  const currentPeriodStartUnix =
    (subscription as any).current_period_start ??
    (subscription.items.data[0] as any)?.current_period_start ??
    null;
  const currentPeriodEndUnix =
    (subscription as any).current_period_end ??
    (subscription.items.data[0] as any)?.current_period_end ??
    null;
  const updates: Partial<InsertBillingSubscription> = {
    stripeCustomerId: stripeCustomerId || undefined,
    stripeSubscriptionId,
    status: subscription.status,
    interval: interval || undefined,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodStart: toDateOrNull(currentPeriodStartUnix),
    currentPeriodEnd: toDateOrNull(currentPeriodEndUnix),
  };

  const upserted = await upsertBillingSubscriptionForUser(userId, updates);

  // Keep global settings aligned for non-legacy users while preserving legacy fallback.
  await db
    .update(globalSettings)
    .set({
      planType: isStripeSubscriptionPro(upserted) ? "pro" : "free",
      updatedAt: new Date(),
    })
    .where(eq(globalSettings.userId, userId))
    .catch(() => undefined);

  return upserted;
}

function normalizeInvoiceStatus(status: Stripe.Invoice.Status | null): string {
  if (!status) return "paid";
  return status;
}

function normalizeInvoiceCurrency(currency: string | null | undefined): string {
  return currency ? currency.toUpperCase() : "EUR";
}

export async function recordInvoicePaymentFromStripeEvent(
  invoice: Stripe.Invoice,
): Promise<void> {
  const stripeInvoiceId = invoice.id;
  const stripeCustomerId = resolveStripeCustomerId(invoice.customer as any);
  const stripeSubscriptionId = resolveStripeSubscriptionId((invoice as any).subscription as any);

  const mapped = await findBillingSubscriptionByStripeRefs({
    stripeCustomerId,
    stripeSubscriptionId,
  });

  const userId =
    mapped?.userId ||
    invoice.metadata?.userId ||
    (await resolveStripeCustomerUserId(stripeCustomerId));

  if (!userId) {
    console.warn("[Billing] Unable to map invoice webhook to user", {
      stripeInvoiceId,
      stripeCustomerId,
      stripeSubscriptionId,
    });
    return;
  }

  const line = invoice.lines?.data?.[0];
  const linePeriod = line?.period;
  const periodStartUnix = linePeriod?.start ?? (invoice as any).period_start ?? invoice.created;
  const periodEndUnix = linePeriod?.end ?? (invoice as any).period_end ?? invoice.created;

  const amountPaid = Number(invoice.amount_paid ?? invoice.amount_due ?? 0) / 100;
  const normalizedAmount = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;
  const paymentRecord: InsertBillingPayment = {
    userId,
    stripeInvoiceId,
    amount: normalizedAmount,
    currency: normalizeInvoiceCurrency(invoice.currency),
    status: normalizeInvoiceStatus(invoice.status),
    periodStart: new Date(Number(periodStartUnix) * 1000),
    periodEnd: new Date(Number(periodEndUnix) * 1000),
    planType: "pro",
    invoiceUrl: invoice.invoice_pdf || invoice.hosted_invoice_url || null,
  };

  await db
    .insert(billingPayments)
    .values(paymentRecord)
    .onConflictDoNothing();
}

export async function backfillBillingPaymentsFromStripeForUser(params: {
  userId: string;
  maxInvoices?: number;
}): Promise<number> {
  const stripe = getStripe();
  const subscription = await getBillingSubscriptionForUser(params.userId);
  const customerId = subscription?.stripeCustomerId;
  if (!customerId) return 0;

  const maxInvoices = Math.max(1, Math.min(params.maxInvoices ?? 100, 500));
  let processed = 0;
  let cursor: string | undefined;

  while (processed < maxInvoices) {
    const remaining = maxInvoices - processed;
    const invoices = await stripe.invoices.list({
      customer: customerId,
      status: "paid",
      limit: Math.min(100, remaining),
      ...(cursor ? { starting_after: cursor } : {}),
    });

    if (!invoices.data.length) break;

    for (const invoice of invoices.data) {
      const amountPaid = Number(invoice.amount_paid ?? invoice.amount_due ?? 0) / 100;
      const normalizedAmount = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;

      const line = invoice.lines?.data?.[0];
      const linePeriod = line?.period;
      const periodStartUnix = linePeriod?.start ?? (invoice as any).period_start ?? invoice.created;
      const periodEndUnix = linePeriod?.end ?? (invoice as any).period_end ?? invoice.created;
      const paymentRecord: InsertBillingPayment = {
        userId: params.userId,
        stripeInvoiceId: invoice.id,
        amount: normalizedAmount,
        currency: normalizeInvoiceCurrency(invoice.currency),
        status: normalizeInvoiceStatus(invoice.status),
        periodStart: new Date(Number(periodStartUnix) * 1000),
        periodEnd: new Date(Number(periodEndUnix) * 1000),
        planType: "pro",
        invoiceUrl: invoice.invoice_pdf || invoice.hosted_invoice_url || null,
      };

      await db
        .insert(billingPayments)
        .values(paymentRecord)
        .onConflictDoNothing();

      processed += 1;
      if (processed >= maxInvoices) break;
    }

    if (!invoices.has_more) break;
    cursor = invoices.data[invoices.data.length - 1]?.id;
    if (!cursor) break;
  }

  return processed;
}

export function verifyStripeWebhookSignature(params: {
  rawBody: Buffer;
  signature: string;
}): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(params.rawBody, params.signature, webhookSecret);
}
