"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Explore", href: "/explore" },
  { label: "FAQ", href: "#faq" },
] as const;

function resolveHref(pathname: string, href: string) {
  if (!href.startsWith("#")) return href;
  return pathname === "/" ? href : `/${href}`;
}

export function PublicNavbar({ offset = false }: { offset?: boolean }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = useMemo(
    () => NAV_LINKS.map((link) => ({ ...link, href: resolveHref(pathname, link.href) })),
    [pathname]
  );

  return (
    <>
      <nav className="fixed left-0 right-0 top-0 z-50">
        <div
          className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4"
          style={{
            backgroundColor: "oklch(97.5% 0.006 68 / 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <Link href="/" className="font-display text-xl font-semibold tracking-tight text-text-primary">
            CLOUDTOUR
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-text-secondary transition-colors duration-fast hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

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

          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
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

        {mobileMenuOpen && (
          <div
            className="border-b border-border px-6 pb-6 pt-2 md:hidden"
            style={{
              backgroundColor: "oklch(97.5% 0.006 68 / 0.95)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex flex-col gap-4">
              {links.map((link) => (
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
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-base text-text-secondary">
                Log in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white"
              >
                Start for free
              </Link>
            </div>
          </div>
        )}
      </nav>
      {offset ? <div className="h-24" /> : null}
    </>
  );
}
