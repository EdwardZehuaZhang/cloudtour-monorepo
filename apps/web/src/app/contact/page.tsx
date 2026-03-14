"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { submitContact, type ContactState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialState: ContactState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending..." : "Send message"}
    </Button>
  );
}

export default function ContactPage() {
  const [state, formAction] = useFormState(submitContact, initialState);

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
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-light text-text-primary">
            Contact us
          </h1>
          <p className="mt-4 text-lg text-text-secondary">
            Have a question, need enterprise support, or want to learn more
            about CloudTour? We&apos;d love to hear from you.
          </p>

          {state.success ? (
            <div className="mt-10 rounded-lg border border-brand/30 bg-surface p-8 text-center">
              <h2 className="font-display text-display-sm font-normal text-text-primary">
                Message sent
              </h2>
              <p className="mt-3 text-text-secondary">
                Thank you for reaching out. We&apos;ll get back to you as soon
                as possible.
              </p>
              <Link
                href="/"
                className="mt-6 inline-block text-sm font-medium text-brand transition-colors duration-fast hover:text-brand-light"
              >
                &larr; Back to home
              </Link>
            </div>
          ) : (
            <form action={formAction} className="mt-10 space-y-6">
              {state.error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {state.error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Your name"
                  required
                />
                {state.fieldErrors?.name && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.name[0]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                />
                {state.fieldErrors?.email && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.email[0]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="How can we help?"
                  required
                />
                {state.fieldErrors?.subject && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.subject[0]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  placeholder="Tell us more about your question or project..."
                  required
                  className="flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                {state.fieldErrors?.message && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.message[0]}
                  </p>
                )}
              </div>

              <SubmitButton />
            </form>
          )}

          <div className="mt-12 border-t border-border/40 pt-8">
            <h2 className="font-display text-lg font-normal text-text-primary mb-4">
              Other ways to reach us
            </h2>
            <div className="space-y-3 text-sm text-text-secondary">
              <p>
                <span className="font-medium text-text-primary">Email:</span>{" "}
                support@cloudtour.app
              </p>
              <p>
                <span className="font-medium text-text-primary">
                  Enterprise sales:
                </span>{" "}
                sales@cloudtour.app
              </p>
            </div>
          </div>
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
