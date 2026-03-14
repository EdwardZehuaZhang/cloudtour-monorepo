import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { sendInviteEmail } from "@/lib/email";

/**
 * GET /api/orgs/[orgId]/members — Returns org members with roles.
 * Requires org membership (viewer+).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const { data: members, error } = await supabase
    .from("org_members")
    .select("id, org_id, user_id, invited_email, role, joined_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }

  // Fetch profile info for members with user_id
  const userIds = members
    .map((m) => m.user_id)
    .filter((id): id is string => id !== null);

  let profiles: { id: string; display_name: string; avatar_url: string | null; username: string }[] = [];
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .in("id", userIds);
    profiles = profileRows ?? [];
  }

  const enrichedMembers = members.map((m) => {
    const profile = profiles.find((p) => p.id === m.user_id);
    return {
      ...m,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      username: profile?.username ?? null,
    };
  });

  return NextResponse.json({ data: enrichedMembers });
}

const inviteMemberSchema = z.object({
  invited_email: z
    .string()
    .email("Invalid email address")
    .max(255, "Email must be at most 255 characters"),
  role: z.enum(["admin", "editor", "viewer"], "Role is required"),
});

/**
 * POST /api/orgs/[orgId]/members — Sends an invitation.
 * Requires org membership (admin+). Enforces plan limits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgRole(orgId, "admin");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { supabase, plan } = auth;
  const { invited_email, role } = parsed.data;
  const limits = PLAN_LIMITS[plan];

  // Check if user is already a member (by email in profiles or pending invite)
  const { data: existingMembers } = await supabase
    .from("org_members")
    .select("id, invited_email, user_id")
    .eq("org_id", orgId);

  const alreadyInvited = (existingMembers ?? []).some(
    (m) => m.invited_email?.toLowerCase() === invited_email.toLowerCase()
  );
  if (alreadyInvited) {
    return NextResponse.json(
      { error: "This email has already been invited" },
      { status: 409 }
    );
  }

  // Check if user is already an active member by looking up their profile email
  // We check profiles for users who might already be members
  const memberUserIds = (existingMembers ?? [])
    .map((m) => m.user_id)
    .filter((id): id is string => id !== null);

  if (memberUserIds.length > 0) {
    // We can't easily query auth.users emails via the anon client,
    // but the duplicate email check via invited_email above handles pending invites.
    // Active members who signed up with the same email will be caught when they try to accept.
  }

  // Enforce plan limit on member count
  const currentMemberCount = (existingMembers ?? []).length;
  if (limits.members !== null && currentMemberCount >= limits.members) {
    return NextResponse.json(
      {
        error: "PLAN_LIMIT_EXCEEDED",
        limit: "members",
        upgrade_url: "/pricing",
      },
      { status: 403 }
    );
  }

  // Create pending invite
  const { data: member, error } = await supabase
    .from("org_members")
    .insert({
      org_id: orgId,
      invited_email: invited_email.toLowerCase(),
      role,
      user_id: null,
      joined_at: null,
    })
    .select("id, org_id, invited_email, invite_token, role, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }

  // Get org name for the email
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  // Send invite email (fire-and-forget, don't block on email failure)
  if (member.invite_token) {
    sendInviteEmail({
      to: invited_email,
      orgName: org?.name ?? "an organization",
      inviteToken: member.invite_token,
      role,
    }).catch(() => {
      // Email send failure is non-critical — the invite still exists in the DB
    });
  }

  return NextResponse.json(
    {
      id: member.id,
      org_id: member.org_id,
      invited_email: member.invited_email,
      role: member.role,
      created_at: member.created_at,
    },
    { status: 201 }
  );
}
