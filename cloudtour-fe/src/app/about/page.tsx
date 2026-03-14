import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "CloudTour makes immersive Gaussian splatting virtual tours accessible to everyone. Learn about our mission, team, and technology.",
  openGraph: {
    title: "About — CloudTour",
    description:
      "CloudTour makes immersive Gaussian splatting virtual tours accessible to everyone. Learn about our mission, team, and technology.",
    url: "/about",
  },
  twitter: {
    card: "summary",
    title: "About — CloudTour",
    description:
      "CloudTour makes immersive Gaussian splatting virtual tours accessible to everyone. Learn about our mission, team, and technology.",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-display text-xl font-semibold text-text-primary"
          >
            CloudTour
          </Link>
          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link
              href="/explore"
              className="transition-colors duration-fast hover:text-text-primary"
            >
              Explore
            </Link>
            <Link
              href="/pricing"
              className="transition-colors duration-fast hover:text-text-primary"
            >
              Pricing
            </Link>
            <Link
              href="/blog"
              className="transition-colors duration-fast hover:text-text-primary"
            >
              Blog
            </Link>
            <Link
              href="/login"
              className="transition-colors duration-fast hover:text-text-primary"
            >
              Log in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        {/* Hero */}
        <div className="mb-16">
          <h1 className="font-display text-display-lg font-light text-text-primary">
            About CloudTour
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-secondary">
            We believe every space has a story worth experiencing. CloudTour
            makes it possible to capture, share, and explore places through
            immersive Gaussian splatting virtual tours.
          </p>
        </div>

        {/* Mission */}
        <section className="mb-16">
          <h2 className="font-display text-display-sm font-normal text-text-primary mb-4">
            Our mission
          </h2>
          <p className="max-w-3xl text-text-secondary leading-relaxed">
            CloudTour is building the platform for spatial storytelling. Using
            Gaussian splatting technology, we enable anyone to create
            photorealistic 3D tours that can be explored from any device — from
            a desktop browser to Apple Vision Pro. Whether you&apos;re a real
            estate agent showcasing properties, a museum preserving cultural
            heritage, or an educator creating interactive learning environments,
            CloudTour gives you the tools to bring spaces to life.
          </p>
        </section>

        {/* What we do */}
        <section className="mb-16">
          <h2 className="font-display text-display-sm font-normal text-text-primary mb-6">
            What we do
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h3 className="mb-2 text-base font-medium text-text-primary">
                Capture
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                Upload Gaussian splat files (.ply, .splat, .spz) created with
                any 3D capture tool. Our platform handles the rest.
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-base font-medium text-text-primary">
                Create
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                Build multi-scene tours with waypoints, hotspots, and floor
                plans using our intuitive editor. No coding required.
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-base font-medium text-text-primary">
                Share
              </h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                Publish tours with a single click. Embed them on your website,
                share via link, or experience them in spatial computing.
              </p>
            </div>
          </div>
        </section>

        {/* Technology */}
        <section className="mb-16">
          <h2 className="font-display text-display-sm font-normal text-text-primary mb-4">
            The technology
          </h2>
          <p className="max-w-3xl text-text-secondary leading-relaxed">
            Gaussian splatting is a breakthrough in 3D scene representation that
            renders photorealistic environments in real time. Unlike traditional
            mesh-based 3D or 360-degree photos, Gaussian splats capture the full
            volumetric detail of a space — lighting, reflections, and depth —
            delivering an experience that feels like being there. CloudTour
            brings this technology to the web, making it accessible without any
            plugins or app downloads.
          </p>
        </section>

        {/* Use cases */}
        <section className="mb-16">
          <h2 className="font-display text-display-sm font-normal text-text-primary mb-6">
            Built for every industry
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: "Real Estate",
                description:
                  "Give prospective buyers and tenants an immersive walkthrough before they visit in person.",
              },
              {
                title: "Tourism & Hospitality",
                description:
                  "Let guests explore hotels, resorts, and destinations from anywhere in the world.",
              },
              {
                title: "Museums & Culture",
                description:
                  "Preserve and share cultural heritage sites, galleries, and exhibitions digitally.",
              },
              {
                title: "Education",
                description:
                  "Create interactive learning environments for remote students and virtual field trips.",
              },
            ].map((useCase) => (
              <div
                key={useCase.title}
                className="rounded-lg border border-border/40 bg-surface p-6"
              >
                <h3 className="mb-2 text-base font-medium text-text-primary">
                  {useCase.title}
                </h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-border/40 bg-surface p-8 text-center md:p-12">
          <h2 className="font-display text-display-sm font-normal text-text-primary">
            Ready to create your first tour?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-text-secondary">
            Start for free — no credit card required. Create up to two tours
            with three scenes each.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-accent-light"
          >
            Get started for free &rarr;
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-5xl px-6 text-sm text-text-secondary">
          &copy; {new Date().getFullYear()} CloudTour. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
