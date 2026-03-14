"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Button,
  Badge,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Skeleton,
} from "@cloudtour/ui";
import { UserPlus, Trash2, Mail } from "lucide-react";
import type { Role } from "@cloudtour/types";

interface MemberRow {
  id: string;
  org_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: Role;
  joined_at: string | null;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface MembersPanelProps {
  orgId: string;
  currentUserRole: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<Role, string> = {
  owner: "bg-[var(--brand)] text-white",
  admin: "bg-[var(--accent)] text-[var(--text-primary)]",
  editor: "bg-[var(--surface-alt,#e8e3dd)] text-[var(--text-primary)]",
  viewer: "bg-[var(--bg)] text-[var(--text-secondary)]",
};

export function MembersPanel({ orgId, currentUserRole }: MembersPanelProps) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const canManageMembers = currentUserRole === "owner" || currentUserRole === "admin";

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/members`);
      if (res.ok) {
        const data = await res.json() as { data: MemberRow[] };
        setMembers(data.data);
      }
    } catch {
      // Silently fail 鈥?member list will remain empty
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchMembers();
  }, [orgId, fetchMembers]);

  async function handleInvite() {
    setInviting(true);
    setInviteError(null);

    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invited_email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await res.json() as { error?: string; limit?: string; upgrade_url?: string };

      if (!res.ok) {
        if (data.error === "PLAN_LIMIT_EXCEEDED") {
          setInviteError("Member limit reached. Upgrade your plan to invite more members.");
        } else {
          setInviteError(data.error ?? "Failed to send invitation");
        }
        return;
      }

      setSheetOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
      fetchMembers();
    } catch {
      setInviteError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/members/${memberId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch {
      // Silently fail
    } finally {
      setDeleteConfirm(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {canManageMembers && (
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </p>
          <Button onClick={() => setSheetOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors duration-fast hover:bg-[var(--bg)]"
          >
            {/* Avatar */}
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-medium text-white">
              {member.display_name
                ? member.display_name.charAt(0).toUpperCase()
                : member.invited_email
                  ? member.invited_email.charAt(0).toUpperCase()
                  : "?"}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {member.user_id ? (
                <>
                  <p className="truncate font-medium text-[var(--text-primary)]">
                    {member.display_name ?? member.username ?? "Unknown"}
                  </p>
                  {member.username && (
                    <p className="truncate text-sm text-[var(--text-secondary)]">
                      @{member.username}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <p className="truncate text-sm text-[var(--text-secondary)]">
                      {member.invited_email}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--accent)]">Pending invitation</p>
                </>
              )}
            </div>

            {/* Role badge */}
            <Badge
              className={`${ROLE_COLORS[member.role]} border-0 text-xs`}
            >
              {ROLE_LABELS[member.role]}
            </Badge>

            {/* Remove button */}
            {canManageMembers && member.role !== "owner" && (
              <>
                {deleteConfirm === member.id ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(member.id)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(member.id)}
                    className="text-[var(--text-secondary)] hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Invite slide-over (Sheet, NOT modal per design spec) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Invite Member</SheetTitle>
            <SheetDescription>
              Send an invitation to join your organization.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "editor" | "viewer")}
                className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm ring-offset-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                <option value="viewer">Viewer 鈥?Can view tours</option>
                <option value="editor">Editor 鈥?Can create and edit tours</option>
                <option value="admin">Admin 鈥?Can manage members and settings</option>
              </select>
            </div>

            {inviteError && (
              <p className="text-sm text-red-600">{inviteError}</p>
            )}
          </div>

          <SheetFooter className="mt-8">
            <Button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail}
              className="w-full"
            >
              {inviting ? "Sending..." : "Send Invitation"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
