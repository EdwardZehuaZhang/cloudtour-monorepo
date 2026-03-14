"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resetPassword, type ResetPasswordState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ResetPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Updating password\u2026" : "Update password"}
    </Button>
  );
}

export default function ResetPasswordPage() {
  const [state, formAction] = useFormState(resetPassword, initialState);

  return (
    <>
      <h1 className="mb-2 text-center font-display text-display-md text-[var(--text-primary)]">
        Set a new password
      </h1>
      <p className="mb-8 text-center text-sm text-[var(--text-secondary)]">
        Choose a new password for your account.
      </p>

      {state.error && (
        <div className="mb-4 rounded-[var(--radius)] border border-[var(--destructive)] bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>

        <SubmitButton />
      </form>
    </>
  );
}
