import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";
import { createServiceClient } from "@cloudtour/db";
import type { Json } from "@cloudtour/db";
import type { Plan } from "@cloudtour/types";

/**
 * POST /api/webhooks/stripe — Handles Stripe webhook events.
 * Verifies stripe-signature header before processing.
 * Uses service role client to bypass RLS for billing_events writes.
 */
export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const stripe = getStripe();

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Record billing event with idempotency via unique constraint on stripe_event_id
  const orgId = extractOrgId(event);

  if (orgId) {
    const { error: insertError } = await supabase
      .from("billing_events")
      .insert({
        org_id: orgId,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: JSON.parse(JSON.stringify(event.data.object)) as Json,
      });

    // 23505 = unique constraint violation — event already processed (idempotent)
    if (insertError && insertError.code !== "23505") {
      console.error("Failed to record billing event:", insertError);
    }

    // If duplicate, skip processing
    if (insertError?.code === "23505") {
      return NextResponse.json({ received: true });
    }
  }

  // Handle specific event types
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(supabase, subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(supabase, subscription);
      break;
    }
    case "invoice.payment_succeeded": {
      // Subscription payment succeeded — plan already updated via subscription events
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.error(
        `Payment failed for customer ${invoice.customer}`
      );
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(supabase, session);
      break;
    }
    default:
      // Unhandled event type — acknowledge receipt
      break;
  }

  return NextResponse.json({ received: true });
}

/**
 * Extract org_id from Stripe event metadata.
 */
function extractOrgId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;

  // Check metadata directly
  const metadata = obj.metadata as Record<string, string> | undefined;
  if (metadata?.org_id) return metadata.org_id;

  // For invoice events, subscription metadata may be nested
  const subscriptionDetails = obj.subscription_details as
    | { metadata?: Record<string, string> }
    | undefined;
  if (subscriptionDetails?.metadata?.org_id)
    return subscriptionDetails.metadata.org_id;

  return null;
}

/**
 * Map Stripe price to plan name.
 */
function planFromSubscription(subscription: Stripe.Subscription): Plan | null {
  const metadata = subscription.metadata;
  if (metadata?.plan && ["pro", "enterprise"].includes(metadata.plan)) {
    return metadata.plan as Plan;
  }
  return null;
}

/**
 * Handle subscription created or updated — update org plan.
 */
async function handleSubscriptionChange(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: Stripe.Subscription
) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const plan = planFromSubscription(subscription);
  if (!plan) return;

  // Only update plan if subscription is active or trialing
  if (
    subscription.status === "active" ||
    subscription.status === "trialing"
  ) {
    const { error } = await supabase
      .from("organizations")
      .update({
        plan,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        stripe_subscription_id: subscription.id,
      })
      .eq("id", orgId);

    if (error) {
      console.error(`Failed to update org ${orgId} plan to ${plan}:`, error);
    }
  }
}

/**
 * Handle subscription deleted — downgrade org to free.
 */
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createServiceClient>,
  subscription: Stripe.Subscription
) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const { error } = await supabase
    .from("organizations")
    .update({
      plan: "free",
      stripe_subscription_id: null,
    })
    .eq("id", orgId);

  if (error) {
    console.error(`Failed to downgrade org ${orgId} to free:`, error);
  }
}

/**
 * Handle checkout session completed — store Stripe customer ID on org.
 */
async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createServiceClient>,
  session: Stripe.Checkout.Session
) {
  const orgId = session.metadata?.org_id;
  if (!orgId || !session.customer) return;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer.id;

  const { error } = await supabase
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
    })
    .eq("id", orgId);

  if (error) {
    console.error(
      `Failed to store Stripe customer ID for org ${orgId}:`,
      error
    );
  }
}
