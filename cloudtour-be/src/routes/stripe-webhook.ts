import { Hono } from "hono";
import Stripe from "stripe";
import { getEnv } from "../env.js";
import { createServiceClient } from "../auth.js";

export const stripeWebhookRoutes = new Hono();

/**
 * POST /api/webhooks/stripe
 */
stripeWebhookRoutes.post("/stripe", async (c) => {
  const env = getEnv();
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing stripe-signature header" }, 400);

  const rawBody = await c.req.arrayBuffer();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      const plan = session.metadata?.plan;
      const customerId = session.customer as string;

      if (orgId && plan) {
        await supabase.from("organizations").update({ plan, stripe_customer_id: customerId }).eq("id", orgId);
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      const plan = subscription.metadata?.plan;

      if (orgId && plan && subscription.status === "active") {
        await supabase.from("organizations").update({ plan }).eq("id", orgId);
      } else if (orgId && subscription.status === "canceled") {
        await supabase.from("organizations").update({ plan: "free" }).eq("id", orgId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      if (orgId) {
        await supabase.from("organizations").update({ plan: "free" }).eq("id", orgId);
      }
      break;
    }
  }

  return c.json({ received: true });
});

