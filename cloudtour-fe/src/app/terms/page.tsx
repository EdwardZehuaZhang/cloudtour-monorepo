import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "CloudTour's terms of service outline the rules and conditions for using our virtual tour platform.",
  openGraph: {
    title: "Terms of Service — CloudTour",
    description:
      "CloudTour's terms of service outline the rules and conditions for using our virtual tour platform.",
    url: "/terms",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service — CloudTour",
    description:
      "CloudTour's terms of service outline the rules and conditions for using our virtual tour platform.",
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

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-text-secondary">
          Last updated: March 14, 2026
        </p>

        <div className="mt-12">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using CloudTour (&quot;the Platform&quot;), you
              agree to be bound by these Terms of Service (&quot;Terms&quot;).
              If you do not agree to these Terms, you may not use the Platform.
              These Terms apply to all users, including visitors, registered
              users, and organization members.
            </p>
          </Section>

          <Section title="2. Account Registration">
            <p>
              To use certain features, you must create an account. You agree to
              provide accurate, current, and complete information during
              registration. You are responsible for maintaining the
              confidentiality of your account credentials and for all activities
              that occur under your account.
            </p>
            <p>
              You must be at least 16 years old to create an account. By
              registering, you represent that you meet this age requirement.
            </p>
          </Section>

          <Section title="3. Use of the Platform">
            <p>You agree to use CloudTour only for lawful purposes. You may not:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Upload content that infringes intellectual property rights</li>
              <li>Upload malicious files, viruses, or harmful code</li>
              <li>Attempt to gain unauthorized access to other accounts or systems</li>
              <li>Use the Platform for illegal or fraudulent activities</li>
              <li>Reverse engineer, decompile, or disassemble the Platform</li>
              <li>Circumvent rate limits, plan restrictions, or security measures</li>
              <li>Scrape, crawl, or harvest data from the Platform without permission</li>
            </ul>
          </Section>

          <Section title="4. User Content">
            <p>
              You retain ownership of all content you upload to CloudTour,
              including splat files, thumbnails, and tour metadata
              (&quot;User Content&quot;). By uploading content, you grant
              CloudTour a non-exclusive, worldwide license to host, display, and
              distribute your content as necessary to operate the Platform.
            </p>
            <p>
              For published tours, you grant CloudTour the right to display your
              content publicly, include it in search results, and feature it on
              the explore page. You may unpublish or delete your tours at any
              time.
            </p>
            <p>
              You represent that you have the right to upload and share all
              content, and that your content does not violate any third-party
              rights.
            </p>
          </Section>

          <Section title="5. Plans and Billing">
            <p>
              CloudTour offers Free, Pro, and Enterprise plans. Plan limits
              (tours, scenes per tour, storage, team members) are enforced as
              described on our{" "}
              <Link
                href="/pricing"
                className="text-brand underline transition-colors duration-fast hover:text-brand-light"
              >
                pricing page
              </Link>
              .
            </p>
            <p>
              Paid subscriptions are billed monthly through Stripe. By
              subscribing, you authorize us to charge your payment method on a
              recurring basis. You may cancel your subscription at any time
              through the billing settings. Cancellation takes effect at the end
              of the current billing period.
            </p>
            <p>
              We reserve the right to modify pricing with 30 days&apos; notice.
              Existing subscribers will be notified by email before any price
              changes take effect.
            </p>
          </Section>

          <Section title="6. Organizations and Collaboration">
            <p>
              Organizations allow multiple users to collaborate on tours.
              Organization owners and admins are responsible for managing member
              access and roles. The role hierarchy is: owner &gt; admin &gt;
              editor &gt; viewer.
            </p>
            <p>
              Organization owners are responsible for ensuring all members
              comply with these Terms. Invitations to join an organization must
              be sent to individuals who consent to join.
            </p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              CloudTour and its original content, features, and functionality
              are owned by CloudTour and are protected by copyright, trademark,
              and other intellectual property laws. Our trademarks may not be
              used without prior written consent.
            </p>
          </Section>

          <Section title="8. Termination">
            <p>
              We may suspend or terminate your account if you violate these
              Terms, engage in abusive behavior, or if required by law. You may
              delete your account at any time through your account settings.
            </p>
            <p>
              Upon account deletion, your personal data will be removed within
              30 days in accordance with our{" "}
              <Link
                href="/privacy"
                className="text-brand underline transition-colors duration-fast hover:text-brand-light"
              >
                privacy policy
              </Link>
              . Tour content will be permanently deleted.
            </p>
          </Section>

          <Section title="9. Disclaimer of Warranties">
            <p>
              CloudTour is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, whether express or
              implied. We do not guarantee that the Platform will be
              uninterrupted, error-free, or secure. We make no warranties
              regarding the accuracy or reliability of any content on the
              Platform.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, CloudTour shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages arising from your use of the Platform. Our total
              liability shall not exceed the amount you paid us in the 12 months
              preceding the claim.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify and hold harmless CloudTour, its officers,
              directors, and employees from any claims, damages, or expenses
              arising from your use of the Platform, your violation of these
              Terms, or your violation of any third-party rights.
            </p>
          </Section>

          <Section title="12. Changes to Terms">
            <p>
              We may update these Terms from time to time. We will notify you of
              material changes by email or by posting a notice on the Platform.
              Your continued use of CloudTour after changes constitutes
              acceptance of the updated Terms.
            </p>
          </Section>

          <Section title="13. Governing Law">
            <p>
              These Terms are governed by the laws of the jurisdiction in which
              CloudTour operates. Any disputes arising from these Terms will be
              resolved through binding arbitration, except where prohibited by
              law.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              If you have questions about these Terms, contact us at
              legal@cloudtour.app or use our{" "}
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
