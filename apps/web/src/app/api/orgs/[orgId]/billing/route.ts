import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { requireOrgRole } from "@/lib/api-utils";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";

const createCheckoutSchema = z.object({
  plan: z.enum(["pro", "enterprise"]),
});

/**
 * POST /api/orgs/[orgId]/billing — Creates a Stripe Checkout session.
 * Requires org ownership.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgRole(orgId, "owner");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { plan } = parsed.data;
  const priceId = STRIPE_PRICE_IDS[plan];

  if (!priceId) {
    return NextResponse.json(
      { error: "Invalid plan" },
      { status: 400 }
    );
  }

  const env = getServerEnv();
  const stripe = getStripe();

  // Get org details for Stripe metadata
  const { supabase } = auth;
  const { data: org } = await supabase
    .from("organizations")
    .select("name, stripe_customer_id")
    .eq("id", orgId)
    .single();

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=cancelled`,
    metadata: {
      org_id: orgId,
      plan,
    },
    subscription_data: {
      metadata: {
        org_id: orgId,
        plan,
      },
    },
  };

  // Reuse existing Stripe customer if available
  if (org?.stripe_customer_id) {
    sessionParams.customer = org.stripe_customer_id;
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url }, { status: 201 });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orgs/[orgId]/billing — Creates a Stripe Billing Portal session.
 * Requires org ownership.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgRole(orgId, "owner");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;
  const env = getServerEnv();

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .single();

  if (!org?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 404 }
    );
  }

  const stripe = getStripe();

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("Stripe billing portal session creation failed:", err);
    return NextResponse.json(
      { error: "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
