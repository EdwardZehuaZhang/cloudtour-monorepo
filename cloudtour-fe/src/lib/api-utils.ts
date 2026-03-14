import { NextResponse } from "next/server";
import { createServerClient } from "@cloudtour/db";
import type { Role, Plan } from "@cloudtour/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createServerClient>>;

/** Minimum role required for an operation, ordered by privilege. */
const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export interface AuthContext {
  supabase: SupabaseServerClient;
  userId: string;
  orgId: string;
  role: Role;
  plan: Plan;
}

/**
 * Authenticates the user and checks org membership + minimum role.
 * Returns an AuthContext on success or a NextResponse error.
 */
export async function requireOrgRole(
  orgId: string,
  minimumRole: Role
): Promise<AuthContext | NextResponse> {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get org membership and org plan in one query
  const { data: member, error: memberError } = await supabase
    .from("org_members")
    .select("role, org_id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (memberError || !member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberRole = member.role as Role;

  if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minimumRole]) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get org plan
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  return {
    supabase,
    userId: user.id,
    orgId,
    role: memberRole,
    plan: org.plan as Plan,
  };
}

/**
 * Generate a URL-safe slug from a title string.
 * trim → lowercase → non-alphanumeric to hyphens → collapse hyphens → trim hyphens
 */
export function slugify(title: string): string {
  let slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    slug = "tour";
  }

  return slug;
}
