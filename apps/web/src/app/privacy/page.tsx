import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "CloudTour's privacy policy explains how we collect, use, and protect your personal data in compliance with PDPA.",
  openGraph: {
    title: "Privacy Policy — CloudTour",
    description:
      "CloudTour's privacy policy explains how we collect, use, and protect your personal data in compliance with PDPA.",
    url: "/privacy",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy — CloudTour",
    description:
      "CloudTour's privacy policy explains how we collect, use, and protect your personal data in compliance with PDPA.",
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl font-normal text-text-primary mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
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

      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <h1 className="font-display text-display-lg font-light text-text-primary">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-text-secondary">
          Last updated: March 14, 2026
        </p>

        <div className="mt-12">
          <Section title="1. Introduction">
            <p>
              CloudTour (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
              respects your privacy and is committed to protecting your personal
              data. This privacy policy explains how we collect, use, store, and
              share your information when you use our platform, in compliance
              with the Personal Data Protection Act (PDPA) and applicable data
              protection laws.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p>We collect the following categories of personal data:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-text-primary">Account information:</strong>{" "}
                name, email address, display name, and profile picture when you
                create an account.
              </li>
              <li>
                <strong className="text-text-primary">Authentication data:</strong>{" "}
                passwords (stored as hashed values) and OAuth tokens when using
                third-party login providers (Google, Apple).
              </li>
              <li>
                <strong className="text-text-primary">Content data:</strong>{" "}
                virtual tour content you create, including splat files,
                thumbnails, scene metadata, waypoints, and hotspots.
              </li>
              <li>
                <strong className="text-text-primary">Usage data:</strong> page
                views, tour views (anonymized via IP hashing), browser type,
                device information, and interaction patterns.
              </li>
              <li>
                <strong className="text-text-primary">Billing data:</strong>{" "}
                payment information processed securely through Stripe. We do not
                store credit card numbers directly.
              </li>
              <li>
                <strong className="text-text-primary">Communications:</strong>{" "}
                information you provide when contacting us through our contact
                form or support channels.
              </li>
            </ul>
          </Section>

          <Section title="3. Consent">
            <p>
              By creating an account, you consent to the collection and
              processing of your personal data as described in this policy. You
              provide explicit consent during signup by accepting this privacy
              policy via the consent checkbox.
            </p>
            <p>
              You may withdraw your consent at any time by deleting your account
              or contacting us at privacy@cloudtour.app. Withdrawal of consent
              does not affect the lawfulness of processing based on consent
              before its withdrawal.
            </p>
          </Section>

          <Section title="4. How We Use Your Data">
            <p>We use your personal data for the following purposes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>To provide, maintain, and improve our platform and services</li>
              <li>To authenticate your identity and manage your account</li>
              <li>To process payments and manage billing</li>
              <li>To send transactional emails (welcome, invitations, password resets)</li>
              <li>To enforce plan limits and usage quotas</li>
              <li>To analyze platform usage and improve user experience</li>
              <li>To respond to your inquiries and support requests</li>
              <li>To comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="5. Data Sharing">
            <p>
              We do not sell your personal data. We share data only with the
              following third parties, strictly as necessary to operate the
              platform:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-text-primary">Supabase:</strong>{" "}
                database hosting, authentication, and file storage.
              </li>
              <li>
                <strong className="text-text-primary">Stripe:</strong> payment
                processing for subscriptions.
              </li>
              <li>
                <strong className="text-text-primary">Resend:</strong>{" "}
                transactional email delivery.
              </li>
              <li>
                <strong className="text-text-primary">Vercel:</strong>{" "}
                application hosting and edge delivery.
              </li>
            </ul>
            <p>
              Published tour content is publicly accessible by design. All other
              data is accessible only to authenticated organization members with
              appropriate roles.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain your personal data for as long as your account is
              active. If you delete your account, we will delete or anonymize
              your personal data within 30 days, except where we are required by
              law to retain certain information.
            </p>
            <p>
              Tour content associated with deleted accounts will be permanently
              removed, including all splat files, thumbnails, and metadata
              stored in our systems.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>
              Under PDPA and applicable data protection laws, you have the
              following rights:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-text-primary">Right of access:</strong>{" "}
                request a copy of the personal data we hold about you.
              </li>
              <li>
                <strong className="text-text-primary">Right to rectification:</strong>{" "}
                update or correct inaccurate personal data via your profile
                settings.
              </li>
              <li>
                <strong className="text-text-primary">Right to erasure:</strong>{" "}
                request deletion of your account and personal data. We will
                process deletion requests within 30 days.
              </li>
              <li>
                <strong className="text-text-primary">Right to withdraw consent:</strong>{" "}
                withdraw consent for data processing at any time.
              </li>
              <li>
                <strong className="text-text-primary">Right to data portability:</strong>{" "}
                request your data in a commonly used, machine-readable format.
              </li>
              <li>
                <strong className="text-text-primary">Right to complain:</strong>{" "}
                lodge a complaint with the relevant data protection authority.
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at
              privacy@cloudtour.app.
            </p>
          </Section>

          <Section title="8. Data Security">
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal data, including:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Encryption in transit (TLS) and at rest</li>
              <li>Row-level security (RLS) on all database tables</li>
              <li>JWT-based authentication with secure session management</li>
              <li>Stripe-verified webhook signatures for payment processing</li>
              <li>Rate limiting on all API endpoints</li>
              <li>Magic byte validation for file uploads (not file extension trust)</li>
            </ul>
          </Section>

          <Section title="9. Cookies">
            <p>
              We use essential cookies for authentication and session management.
              We do not use advertising or tracking cookies. Authentication
              cookies are strictly necessary for the platform to function and do
              not require separate consent.
            </p>
          </Section>

          <Section title="10. Children&apos;s Privacy">
            <p>
              CloudTour is not directed at children under 16. We do not
              knowingly collect personal data from children. If you believe we
              have collected data from a child, please contact us at
              privacy@cloudtour.app and we will promptly delete it.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. We will
              notify you of material changes by email or by posting a notice on
              the platform. Your continued use of CloudTour after changes
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              If you have questions about this privacy policy or wish to
              exercise your data protection rights, contact us at:
            </p>
            <p>
              Email: privacy@cloudtour.app
              <br />
              Or use our{" "}
              <Link
                href="/contact"
                className="text-brand underline transition-colors duration-fast hover:text-brand-light"
              >
                contact form
              </Link>
              .
            </p>
          </Section>
        </div>
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
