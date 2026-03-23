import Stripe from "stripe";
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "./db.js";
import {
  billingPayments,
  billingSubscriptions,
  globalSettings,
  jobQueue,
  type BillingSubscription,
  type InsertBillingPayment,
  type InsertBillingSubscription,
} from "../shared/schema.js";

export const FREE_MONTHLY_UPLOAD_LIMIT = 3;
export const COUNTED_QUEUE_STATUSES = ["queued", "processing", "retrying", "completed"] as const;
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
  canLaunch: boolean;
}

interface UtcMonthBounds {
  start: Date;
  end: Date;
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

export function getUtcMonthBounds(now = new Date()): UtcMonthBounds {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

export async function countLaunchSlotsForUtcMonth(
  userId: string,
  bounds: UtcMonthBounds = getUtcMonthBounds(),
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.userId, userId),
        inArray(jobQueue.status, COUNTED_QUEUE_STATUSES as unknown as string[]),
        gte(jobQueue.createdAt, bounds.start),
        lt(jobQueue.createdAt, bounds.end),
      ),
    );
  return Number(row?.count || 0);
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
  const [subscription, settings, uploadsUsed] = await Promise.all([
    getBillingSubscriptionForUser(userId),
    db
      .select({
        planType: globalSettings.planType,
      })
      .from(globalSettings)
      .where(eq(globalSettings.userId, userId))
      .limit(1),
    countLaunchSlotsForUtcMonth(userId),
  ]);

  const globalPlanType = settings[0]?.planType || "free";
  const hasStripePro = isStripeSubscriptionPro(subscription, now);
  const hasLegacyPro = !hasStripePro && isLegacyPro(globalPlanType);
  const planType: BillingPlanType = hasStripePro || hasLegacyPro ? "pro" : "free";
  const uploadsLimit = planType === "free" ? FREE_MONTHLY_UPLOAD_LIMIT : null;
  const uploadsRemaining = uploadsLimit === null ? null : Math.max(0, uploadsLimit - uploadsUsed);

  return {
    planType,
    billingInterval: hasStripePro ? (subscription?.interval as BillingInterval) || null : null,
    subscriptionStatus: hasStripePro
      ? subscription?.status || null
      : hasLegacyPro
        ? "legacy_pro"
        : "free",
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    uploadsUsed,
    uploadsLimit,
    uploadsRemaining,
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
    subscription.metadata?.userId ||
    existing?.userId ||
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
    invoice.metadata?.userId ||
    mapped?.userId ||
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
  const paymentRecord: InsertBillingPayment = {
    userId,
    stripeInvoiceId,
    amount: Number.isFinite(amountPaid) ? amountPaid : 0,
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
    .onConflictDoNothing({
      target: billingPayments.stripeInvoiceId,
    });
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
