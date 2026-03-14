"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@cloudtour/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OnboardingWizardProps {
  open: boolean;
  displayName: string;
  orgId: string;
}

const TOTAL_STEPS = 3;

export function OnboardingWizard({
  open,
  displayName,
  orgId,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(open);
  const [name, setName] = useState(displayName);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const completeOnboarding = useCallback(async () => {
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true }),
    });
  }, []);

  const handleSkip = useCallback(async () => {
    await completeOnboarding();
    setIsOpen(false);
    router.refresh();
  }, [completeOnboarding, router]);

  const handleNext = useCallback(async () => {
    if (step === 0) {
      // Save profile updates if changed
      const updates: Record<string, string> = {};
      if (name && name !== displayName) updates.display_name = name;
      if (bio) updates.bio = bio;

      if (Object.keys(updates).length > 0) {
        setSaving(true);
        await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        setSaving(false);
      }
    }

    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      // Final step — complete onboarding
      await completeOnboarding();
      setIsOpen(false);
      router.refresh();
    }
  }, [step, name, displayName, bio, completeOnboarding, router]);

  const handleCreateTour = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/tours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "My First Tour" }),
      });
      if (res.ok) {
        const tour = await res.json() as { id: string };
        await completeOnboarding();
        setIsOpen(false);
        router.push(`/editor/${tour.id}`);
      } else {
        // If tour creation fails, just move to next step
        setStep(step + 1);
      }
    } catch {
      setStep(step + 1);
    } finally {
      setSaving(false);
    }
  }, [orgId, completeOnboarding, router, step]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        void handleSkip();
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold">
            {step === 0 && "Welcome to CloudTour"}
            {step === 1 && "Create your first tour"}
            {step === 2 && "Add a scene"}
          </DialogTitle>
          <DialogDescription>
            {step === 0 && "Let\u2019s get your profile set up so you\u2019re ready to create."}
            {step === 1 && "Tours are immersive 3D experiences built from Gaussian splat scenes."}
            {step === 2 && "Scenes are the building blocks of your tour. Upload .ply, .splat, or .spz files to bring spaces to life."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="onboarding-name">Display name</Label>
                <Input
                  id="onboarding-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-bio">Bio (optional)</Label>
                <Input
                  id="onboarding-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white text-sm font-medium">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Name your tour</p>
                    <p className="text-sm text-[var(--text-secondary)]">Give it a descriptive title like &ldquo;Downtown Office Space&rdquo;</p>
                  </div>
                </div>
                <div className="ml-11 mt-3 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white text-sm font-medium">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Upload splat files</p>
                    <p className="text-sm text-[var(--text-secondary)]">Add .ply, .splat, or .spz files as scenes</p>
                  </div>
                </div>
                <div className="ml-[5.5rem] mt-3 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white text-sm font-medium">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">Publish and share</p>
                    <p className="text-sm text-[var(--text-secondary)]">Your tour gets a public link and embed code</p>
                  </div>
                </div>
              </div>
              <Button
                variant="accent"
                className="w-full"
                onClick={handleCreateTour}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create your first tour"}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]/10">
                  <svg className="h-6 w-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <p className="font-medium text-[var(--text-primary)]">Upload a Gaussian splat file</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Supported formats: .ply, .splat, .spz
                </p>
                <p className="mt-3 text-xs text-[var(--text-secondary)]">
                  You can do this from the tour editor after creating a tour.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Progress dots + actions */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors duration-base ${
                  i === step
                    ? "bg-[var(--brand)]"
                    : i < step
                      ? "bg-[var(--brand)]/40"
                      : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
            {step !== 1 && (
              <Button size="sm" onClick={handleNext} disabled={saving}>
                {saving
                  ? "Saving..."
                  : step === TOTAL_STEPS - 1
                    ? "Get started"
                    : "Next"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
