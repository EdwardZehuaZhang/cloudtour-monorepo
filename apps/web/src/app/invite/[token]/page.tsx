"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@cloudtour/ui";

interface InviteDetails {
  org_name: string;
  role: string;
  invited_email: string;
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/invite/${token}`);
        if (!res.ok) {
          const data = await res.json() as { error: string };
          setError(data.error);
          return;
        }
        const data = await res.json() as InviteDetails;
        setInvite(data);
      } catch {
        setError("Failed to load invitation");
      } finally {
        setLoading(false);
      }
    }
    fetchInvite();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/invite/${token}`, { method: "POST" });
      const data = await res.json() as { success?: boolean; error?: string; org_id?: string };

      if (!res.ok) {
        if (res.status === 401) {
          // Not logged in — redirect to login with return URL
          router.push(`/login?next=/invite/${token}`);
          return;
        }
        setError(data.error ?? "Failed to accept invitation");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--text-secondary)]">Loading invitation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="mx-auto max-w-md space-y-4 text-center">
          <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
            Invitation Error
          </h1>
          <p className="text-[var(--text-secondary)]">{error}</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            Go to Home
          </Button>
        </div>
      </div>
    );
  }

  if (!invite) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
      <div className="mx-auto max-w-md space-y-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
            You&apos;re Invited
          </h1>
          <p className="text-[var(--text-secondary)]">
            You&apos;ve been invited to join{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {invite.org_name}
            </span>{" "}
            as a <span className="font-medium">{invite.role}</span>.
          </p>
        </div>

        <div className="rounded-md bg-[var(--bg)] p-4 text-sm text-[var(--text-secondary)]">
          <p>
            Invitation sent to:{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {invite.invited_email}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full"
          >
            {accepting ? "Accepting..." : "Accept Invitation"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="w-full"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
