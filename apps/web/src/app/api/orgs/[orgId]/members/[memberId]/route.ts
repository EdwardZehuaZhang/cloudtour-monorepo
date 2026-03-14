import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";

/**
 * DELETE /api/orgs/[orgId]/members/[memberId] — Removes a member.
 * Requires org membership (admin+). Cannot remove the owner.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  const { orgId, memberId } = await params;
  const auth = await requireOrgRole(orgId, "admin");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  // Fetch the member to be removed
  const { data: member, error: fetchError } = await supabase
    .from("org_members")
    .select("id, role, org_id")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (fetchError || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Cannot remove the owner
  if (member.role === "owner") {
    return NextResponse.json(
      { error: "Cannot remove the organization owner" },
      { status: 403 }
    );
  }

  const { error: deleteError } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
