"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Check, ChevronDown, Menu, X } from "lucide-react";

// Lazy-load SplatViewer to keep landing page initial bundle small
const SplatViewer = dynamic(
  () =>
    import("@/components/viewer/splat-viewer").then((m) => ({
      default: m.SplatViewer,
    })),
  { ssr: false }
);

// ---- Types ------------------------------------------------------------------

interface FeaturedTour {
  title: string;
  slug: string;
  thumbnailUrl: string;
  category: string;
}

// ---- Data -------------------------------------------------------------------

const FEATURED_TOURS: FeaturedTour[] = [
  {
    title: "Historic Grand Palace",
    slug: "grand-palace",
    thumbnailUrl: "/images/demo-tour-1.jpg",
    category: "Tourism",
  },
  {
    title: "Modern Art Gallery",
    slug: "modern-art-gallery",
    thumbnailUrl: "/images/demo-tour-2.jpg",
    category: "Museum",
  },
  {
    title: "Luxury Penthouse Suite",
    slug: "luxury-penthouse",
    thumbnailUrl: "/images/demo-tour-3.jpg",
    category: "Real Estate",
  },
  {
    title: "University Campus Tour",
    slug: "university-campus",
    thumbnailUrl: "/images/demo-tour-4.jpg",
    category: "Education",
  },
];

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Capture",
    description:
      "Scan any space with a compatible camera or smartphone app to create a Gaussian splat point cloud.",
  },
  {
    number: "02",
    title: "Create",
    description:
      "Upload your .ply, .splat, or .spz files. Place waypoints and hotspots to build an interactive narrative.",
  },
  {
    number: "03",
    title: "Share",
    description:
      "Publish your tour with one click. Share via link, embed on your website, or experience in Apple Vision Pro.",
  },
];

const PRICING_PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out spatial tours",
    features: [
      "2 tours",
      "3 scenes per tour",
      "1 GB storage",
      "1 team member",
      "Community support",
    ],
    cta: "Start for free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For professionals and growing teams",
    features: [
      "Unlimited tours",
      "20 scenes per tour",
      "50 GB storage",
      "10 team members",
      "Priority support",
      "Custom branding",
      "Analytics dashboard",
    ],
    cta: "Start free trial",
    href: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$199",
    period: "/month",
    description: "For organizations with advanced needs",
    features: [
      "Unlimited tours",
      "Unlimited scenes",
      "500 GB storage",
      "Unlimited members",
      "Dedicated support",
      "SSO & SAML",
      "SLA guarantee",
      "Custom integrations",
    ],
    cta: "Contact sales",
    href: "/contact",
    highlighted: false,
  },
];

const FAQ_ITEMS = [
  {
    question: "What is a Gaussian splat?",
    answer:
      "Gaussian splatting is a cutting-edge 3D rendering technique that represents scenes as collections of 3D Gaussian distributions. Unlike traditional mesh-based 3D, splats capture photorealistic detail including lighting, reflections, and fine textures — making virtual tours feel like you're actually there.",
  },
  {
    question: "What file formats do you support?",
    answer:
      "CloudTour supports .ply (Polygon File Format), .splat (raw Gaussian data), and .spz (compressed format). You can generate these from popular tools like Luma AI, Polycam, Nerfstudio, or any Gaussian splatting pipeline.",
  },
  {
    question: "Can I embed tours on my website?",
    answer:
      "Yes! Every published tour comes with an embed code snippet you can paste into any website. The viewer is responsive and works across all modern browsers and devices.",
  },
  {
    question: "Does it work with Apple Vision Pro?",
    answer:
      "Yes. CloudTour includes native WebXR support. Visitors on Apple Vision Pro can tap 'View in Apple Vision Pro' to experience your tour in spatial computing — no app download required.",
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer:
      "Absolutely. You can cancel your Pro or Enterprise subscription at any time from your dashboard settings. Your tours will remain accessible on the Free plan with its limits.",
  },
  {
    question: "Is my data secure?",
    answer:
      "CloudTour uses Supabase with Row Level Security on every table. Your data is encrypted in transit and at rest. We comply with PDPA regulations and you can request full data deletion at any time.",
  },
];

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Explore", href: "/explore" },
  { label: "FAQ", href: "#faq" },
];

// ---- Components -------------------------------------------------------------

function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="font-sans text-base font-medium text-text-primary">
          {question}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-text-secondary transition-transform duration-base ease-out ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-base ease-out ${open ? "max-h-96 pb-5" : "max-h-0"}`}
      >
        <p className="text-sm leading-relaxed text-text-secondary">{answer}</p>
      </div>
    </div>
  );
}

// ---- Main Landing Page ------------------------------------------------------

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const featuredScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger hero fade-in
    const timer = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="fixed left-0 right-0 top-0 z-50">
        <div
          className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"
          style={{
            backgroundColor: "oklch(97.5% 0.006 68 / 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          {/* Logo */}
          <Link href="/" className="font-display text-xl font-semibold tracking-tight text-text-primary">
            CLOUDTOUR
          </Link>

          {/* Center links — desktop */}
          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA — desktop */}
          <div className="hidden items-center gap-4 md:flex">
            <Link
              href="/login"
              className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors duration-fast hover:bg-brand-light"
            >
              Start for free
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-text-primary" />
            ) : (
              <Menu className="h-6 w-6 text-text-primary" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div
            className="border-b border-border px-6 pb-6 pt-2 md:hidden"
            style={{
              backgroundColor: "oklch(97.5% 0.006 68 / 0.95)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base text-text-secondary transition-colors duration-fast hover:text-text-primary"
                >
                  {link.label}
                </Link>
              ))}
              <hr className="border-border" />
              <Link
                href="/login"
                className="text-base text-text-secondary"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white"
              >
                Start for free
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative h-screen w-full overflow-hidden">
        {/* Live SplatViewer — full bleed, interactive on all devices */}
        <div className="absolute inset-0">
          <SplatViewer
            src="/demo/featured-tour.splat"
            sceneTitle="Explore in 3D"
            initialCameraPosition={[0, -3, 8]}
            initialCameraLookAt={[0, 0, 0]}
            className="h-full w-full"
          />
          {/* Bottom gradient so text stays readable without killing the splat */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, oklch(15% 0.015 68 / 0.85) 0%, oklch(15% 0.015 68 / 0.35) 35%, transparent 60%)",
            }}
          />
        </div>

        {/* Hero content — bottom-left, pointer-events-none so orbit still works */}
        <div
          className={`pointer-events-none relative z-10 flex h-screen items-end transition-all duration-700 ${heroVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          style={{ transitionTimingFunction: "var(--ease-out)" }}
        >
          <div className="mx-auto w-full max-w-7xl px-6 pb-20 pt-32">
            <p className="mb-3 font-sans text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              CLOUDTOUR · Drag to explore
            </p>
            <h1 className="font-display text-display-hero font-light text-white">
              Spatial tours for the
              <br className="hidden sm:block" />
              places worth remembering.
            </h1>
            <div className="pointer-events-auto mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-medium text-text-primary transition-all duration-base hover:bg-accent-light"
              >
                Start for free
                <ArrowRight className="h-4 w-4 transition-transform duration-base group-hover:translate-x-1" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors duration-fast hover:text-white"
              >
                Explore tours
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Tours — horizontal scroll ──────────────────────────── */}
      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="font-display text-display-md font-light text-text-primary">
            Featured tours
          </h2>
          <p className="mt-3 max-w-xl text-base text-text-secondary">
            Explore what creators are building with CloudTour — from historic
            landmarks to luxury real estate.
          </p>
        </div>
        <div
          ref={featuredScrollRef}
          className="mt-10 flex gap-6 overflow-x-auto px-6 pb-4 md:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {FEATURED_TOURS.map((tour) => (
            <Link
              key={tour.slug}
              href={`/tours/${tour.slug}`}
              className="group relative shrink-0 overflow-hidden rounded-xl"
              style={{
                width: "clamp(280px, 40vw, 480px)",
                aspectRatio: "3/2",
                scrollSnapAlign: "start",
              }}
            >
              <div
                className="absolute inset-0 bg-surface-alt transition-transform duration-slow ease-out group-hover:scale-105"
                style={{
                  backgroundImage: `url(${tour.thumbnailUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              {/* Title overlay */}
              <div
                className="absolute inset-0 flex flex-col justify-end p-6"
                style={{
                  background:
                    "linear-gradient(to top, oklch(22% 0.02 68 / 0.6) 0%, transparent 50%)",
                }}
              >
                <span className="text-xs font-medium uppercase tracking-wider text-white/60">
                  {tour.category}
                </span>
                <span className="mt-1 font-display text-xl font-light text-white">
                  {tour.title}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── How it Works — editorial 3-column ───────────────────────────── */}
      <section className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="font-display text-display-md font-light text-text-primary">
            How it works
          </h2>
          <p className="mt-3 max-w-xl text-base text-text-secondary">
            From capture to share in three simple steps.
          </p>

          <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.number} className="relative">
                {/* Large translucent Cormorant numeral — background texture */}
                <span
                  className="pointer-events-none absolute -top-8 left-0 select-none font-display font-light text-text-primary"
                  style={{
                    fontSize: "clamp(100px, 12vw, 160px)",
                    opacity: 0.06,
                    lineHeight: 1,
                  }}
                >
                  {step.number}
                </span>
                <div className="relative z-10 pt-16 md:pt-20">
                  <h3 className="font-display text-display-sm font-normal text-text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="font-display text-display-md font-light text-text-primary">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-text-secondary">
              Start free. Upgrade when you need more space, scenes, or
              team members.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-8 transition-shadow duration-base ${
                  plan.highlighted
                    ? "z-10 border-brand bg-surface shadow-xl md:scale-105"
                    : "border-border bg-surface"
                }`}
              >
                <h3 className="font-display text-display-sm font-normal text-text-primary">
                  {plan.name}
                </h3>
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

                <ul className="mt-8 flex flex-1 flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <span className="text-sm text-text-primary">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

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
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="bg-surface py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center font-display text-display-md font-light text-text-primary">
            Frequently asked questions
          </h2>
          <div className="mt-12">
            {FAQ_ITEMS.map((item) => (
              <FAQItem
                key={item.question}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-10 md:grid-cols-4">
            {/* Brand */}
            <div>
              <span className="font-display text-lg font-semibold tracking-tight text-text-primary">
                CLOUDTOUR
              </span>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Spatial tours for the places
                <br />
                worth remembering.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                Product
              </h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                <li>
                  <Link href="/explore" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Explore
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Blog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                Company
              </h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                <li>
                  <Link href="/about" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-secondary">
                Legal
              </h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                <li>
                  <Link href="/privacy" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-text-primary transition-colors duration-fast hover:text-brand">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-border pt-6">
            <p className="text-xs text-text-secondary">
              &copy; {new Date().getFullYear()} CloudTour. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
