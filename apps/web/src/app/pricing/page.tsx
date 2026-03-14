import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for CloudTour. Start free, upgrade when you need more space, scenes, or team members.",
  openGraph: {
    title: "Pricing — CloudTour",
    description:
      "Simple, transparent pricing for CloudTour. Start free, upgrade when you need more space, scenes, or team members.",
    url: "/pricing",
  },
  twitter: {
    card: "summary",
    title: "Pricing — CloudTour",
    description:
      "Simple, transparent pricing for CloudTour. Start free, upgrade when you need more space, scenes, or team members.",
  },
};

interface PlanColumn {
  name: string;
  price: string;
  period: string;
  description: string;
  cta: string;
  href: string;
  highlighted: boolean;
}

const PLANS: PlanColumn[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out spatial tours",
    cta: "Start for free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For professionals and growing teams",
    cta: "Start free trial",
    href: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$199",
    period: "/month",
    description: "For organizations with advanced needs",
    cta: "Contact sales",
    href: "/contact",
    highlighted: false,
  },
];

interface FeatureRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
  enterprise: string | boolean;
}

const FEATURES: FeatureRow[] = [
  { label: "Tours", free: "2", pro: "Unlimited", enterprise: "Unlimited" },
  {
    label: "Scenes per tour",
    free: "3",
    pro: "20",
    enterprise: "Unlimited",
  },
  { label: "Storage", free: "1 GB", pro: "50 GB", enterprise: "500 GB" },
  {
    label: "Team members",
    free: "1",
    pro: "10",
    enterprise: "Unlimited",
  },
  {
    label: "Custom branding",
    free: false,
    pro: true,
    enterprise: true,
  },
  {
    label: "Analytics dashboard",
    free: false,
    pro: true,
    enterprise: true,
  },
  {
    label: "Priority support",
    free: false,
    pro: true,
    enterprise: true,
  },
  {
    label: "SSO & SAML",
    free: false,
    pro: false,
    enterprise: true,
  },
  {
    label: "SLA guarantee",
    free: false,
    pro: false,
    enterprise: true,
  },
  {
    label: "Custom integrations",
    free: false,
    pro: false,
    enterprise: true,
  },
  {
    label: "Dedicated support",
    free: false,
    pro: false,
    enterprise: true,
  },
];

function FeatureCell({ value }: { value: string | boolean }) {
  if (typeof value === "string") {
    return <span className="text-sm text-text-primary">{value}</span>;
  }
  if (value) {
    return <Check className="mx-auto h-4 w-4 text-brand" />;
  }
  return <Minus className="mx-auto h-4 w-4 text-text-secondary/40" />;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-display text-xl font-light tracking-tight text-text-primary"
          >
            CLOUDTOUR
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/explore"
              className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary"
            >
              Explore
            </Link>
            <Link
              href="/login"
              className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-accent-light"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <h1 className="font-display text-display-lg font-light text-text-primary">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
            Start free. Upgrade when you need more space, scenes, or team
            members.
          </p>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="pb-20">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 transition-shadow duration-base ${
                plan.highlighted
                  ? "z-10 border-brand bg-surface shadow-xl md:scale-105"
                  : "border-border bg-surface"
              }`}
            >
              <h2 className="font-display text-display-sm font-normal text-text-primary">
                {plan.name}
              </h2>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold text-text-primary">
                  {plan.price}
                </span>
                <span className="text-sm text-text-secondary">
                  {plan.period}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                {plan.description}
              </p>
              <Link
                href={plan.href}
                className={`mt-8 block rounded-lg px-4 py-3 text-center text-sm font-medium transition-colors duration-fast ${
                  plan.highlighted
                    ? "bg-accent text-text-primary hover:bg-accent-light"
                    : "bg-surface-alt text-text-primary hover:bg-border"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="border-t border-border bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center font-display text-display-md font-light text-text-primary">
            Compare plans
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-base text-text-secondary">
            Everything you need to know about each plan at a glance.
          </p>

          <div className="mt-16 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-4 pr-6 text-sm font-medium text-text-secondary">
                    Feature
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.name}
                      className={`pb-4 text-center text-sm font-medium ${
                        plan.highlighted ? "text-brand" : "text-text-secondary"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr
                    key={feature.label}
                    className="border-b border-border/50"
                  >
                    <td className="py-4 pr-6 text-sm text-text-primary">
                      {feature.label}
                    </td>
                    <td className="py-4 text-center">
                      <FeatureCell value={feature.free} />
                    </td>
                    <td className="py-4 text-center">
                      <FeatureCell value={feature.pro} />
                    </td>
                    <td className="py-4 text-center">
                      <FeatureCell value={feature.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA Row below table */}
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.name} className="text-center">
                <Link
                  href={plan.href}
                  className={`inline-block rounded-lg px-6 py-3 text-sm font-medium transition-colors duration-fast ${
                    plan.highlighted
                      ? "bg-accent text-text-primary hover:bg-accent-light"
                      : "bg-surface-alt text-text-primary hover:bg-border"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-6 text-center text-sm text-text-secondary">
          <p>&copy; {new Date().getFullYear()} CloudTour. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
