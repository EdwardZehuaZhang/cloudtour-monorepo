import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@cloudtour/db";

/**
 * GET /api/invite/[token] — Returns invite details (org name, role).
 * Public endpoint — no auth required to view invite.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createServerClient();

  // Find the pending invite by token
  const { data: invite, error } = await supabase
    .from("org_members")
    .select("id, org_id, invited_email, role, user_id")
    .eq("invite_token", token)
    .single();

  if (error || !invite) {
    return NextResponse.json(
      { error: "Invitation not found or expired" },
      { status: 404 }
    );
  }

  if (invite.user_id !== null) {
    return NextResponse.json(
      { error: "Invitation has already been accepted" },
      { status: 410 }
    );
  }

  // Get org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .single();

  return NextResponse.json({
    org_name: org?.name ?? "Unknown Organization",
    role: invite.role,
    invited_email: invite.invited_email,
  });
}

/**
 * POST /api/invite/[token] — Accepts the invitation.
 * Requires authentication — user must be logged in.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the pending invite
  const { data: invite, error: inviteError } = await supabase
    .from("org_members")
    .select("id, org_id, user_id, invited_email")
    .eq("invite_token", token)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { error: "Invitation not found or expired" },
      { status: 404 }
    );
  }

  if (invite.user_id !== null) {
    return NextResponse.json(
      { error: "Invitation has already been accepted" },
      { status: 410 }
    );
  }

  // Check if user is already a member of this org
  const { data: existingMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("org_id", invite.org_id)
    .eq("user_id", user.id)
    .single();

  if (existingMember) {
    // User is already a member — clean up the invite
    await supabase.from("org_members").delete().eq("id", invite.id);
    return NextResponse.json(
      { error: "You are already a member of this organization" },
      { status: 409 }
    );
  }

  // Accept the invite: set user_id and joined_at
  const { error: updateError } = await supabase
    .from("org_members")
    .update({
      user_id: user.id,
      joined_at: new Date().toISOString(),
      invite_token: null,
    })
    .eq("id", invite.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, org_id: invite.org_id });
}
