"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { forgotPassword, type ForgotPasswordState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ForgotPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending reset link\u2026" : "Send reset link"}
    </Button>
  );
}

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(forgotPassword, initialState);

  return (
    <>
      <h1 className="mb-2 text-center font-display text-display-md text-[var(--text-primary)]">
        Forgot your password?
      </h1>
      <p className="mb-8 text-center text-sm text-[var(--text-secondary)]">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {state.error && (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--destructive)] bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {state.error}
        </div>
      )}

      {state.success ? (
        <div className="rounded-[var(--radius)] border border-[var(--brand)] bg-[var(--brand)]/10 px-4 py-3 text-sm text-[var(--text-primary)]">
          If an account exists with that email, you&apos;ll receive a password reset link shortly.
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <SubmitButton />
        </form>
      )}

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Remember your password?{" "}
        <Link href="/login" className="text-[var(--brand)] hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
