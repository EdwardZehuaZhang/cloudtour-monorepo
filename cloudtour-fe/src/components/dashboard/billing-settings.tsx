"use client";

import { useState } from "react";
import { Crown, ExternalLink, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface BillingSettingsProps {
  orgId: string;
  orgName: string;
  plan: "free" | "pro" | "enterprise";
  hasStripeCustomer: boolean;
  hasSubscription: boolean;
  isOwner: boolean;
}

const PLAN_DETAILS = {
  free: {
    label: "Free",
    price: "$0",
    description: "2 tours, 3 scenes/tour, 1 GB storage, 1 member",
  },
  pro: {
    label: "Pro",
    price: "$29/mo",
    description:
      "Unlimited tours, 20 scenes/tour, 50 GB storage, 10 members",
  },
  enterprise: {
    label: "Enterprise",
    price: "$199/mo",
    description:
      "Unlimited tours & scenes, 500 GB storage, unlimited members",
  },
} as const;

export function BillingSettings({
  orgId,
  orgName,
  plan,
  hasStripeCustomer,
  hasSubscription,
  isOwner,
}: BillingSettingsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const details = PLAN_DETAILS[plan];

  async function handleUpgrade(targetPlan: "pro" | "enterprise") {
    setIsLoading(targetPlan);
    setError(null);

    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create checkout session");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(null);
    }
  }

  async function handleManageBilling() {
    setIsLoading("portal");
    setError(null);

    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/billing`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to open billing portal");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Current Plan */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Current Plan
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {orgName}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium capitalize",
              plan === "free" && "bg-[var(--surface-alt)] text-[var(--text-secondary)]",
              plan === "pro" && "bg-[var(--brand)]/10 text-[var(--brand)]",
              plan === "enterprise" && "bg-[var(--accent)]/10 text-[var(--accent)]"
            )}
          >
            {plan !== "free" && <Crown className="h-3.5 w-3.5" />}
            {details.label}
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-2xl font-semibold text-[var(--text-primary)]">
            {details.price}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {details.description}
        </p>

        {/* Manage billing portal button */}
        {hasStripeCustomer && hasSubscription && isOwner && (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={isLoading === "portal"}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-fast hover:bg-[var(--surface-alt)] disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {isLoading === "portal" ? "Opening..." : "Manage billing"}
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </button>
        )}
      </section>

      {/* Upgrade Options */}
      {plan === "free" && isOwner && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Upgrade your plan
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Get more tours, scenes, storage, and team members.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {/* Pro */}
            <div className="rounded-lg border border-[var(--brand)]/30 bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-[var(--brand)]" />
                <span className="font-semibold text-[var(--text-primary)]">
                  Pro
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-xl font-semibold text-[var(--text-primary)]">
                  $29
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  /month
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Unlimited tours, 20 scenes/tour, 50 GB, 10 members
              </p>
              <button
                type="button"
                onClick={() => handleUpgrade("pro")}
                disabled={isLoading !== null}
                className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-fast hover:bg-[var(--accent-light)] disabled:opacity-50"
              >
                {isLoading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
              </button>
            </div>

            {/* Enterprise */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-[var(--accent)]" />
                <span className="font-semibold text-[var(--text-primary)]">
                  Enterprise
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-xl font-semibold text-[var(--text-primary)]">
                  $199
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  /month
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Unlimited everything, 500 GB, unlimited members
              </p>
              <button
                type="button"
                onClick={() => handleUpgrade("enterprise")}
                disabled={isLoading !== null}
                className="mt-4 w-full rounded-lg bg-[var(--surface-alt)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-fast hover:bg-[var(--border)] disabled:opacity-50"
              >
                {isLoading === "enterprise"
                  ? "Redirecting..."
                  : "Upgrade to Enterprise"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Pro user can upgrade to Enterprise */}
      {plan === "pro" && isOwner && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Need more?
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Upgrade to Enterprise for unlimited scenes, storage, and team
            members.
          </p>
          <button
            type="button"
            onClick={() => handleUpgrade("enterprise")}
            disabled={isLoading !== null}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-fast hover:bg-[var(--accent-light)] disabled:opacity-50"
          >
            {isLoading === "enterprise"
              ? "Redirecting..."
              : "Upgrade to Enterprise"}
          </button>
        </section>
      )}

      {/* Non-owner notice */}
      {!isOwner && plan === "free" && (
        <p className="text-sm text-[var(--text-secondary)]">
          Only the organization owner can manage billing. Contact your org
          owner to upgrade.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

