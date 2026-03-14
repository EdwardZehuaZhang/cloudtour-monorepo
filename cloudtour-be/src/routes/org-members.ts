import { Hono } from "hono";
import { requireOrgRole, getSupabaseForUser, createServiceClient } from "../auth.js";
import { z } from "zod";
import type { Plan } from "@cloudtour/types";

export const orgMemberRoutes = new Hono();

const PLAN_MEMBER_LIMITS: Record<Plan, number | null> = {
  free: 1,
  pro: 10,
  enterprise: null,
};

/**
 * GET /api/orgs/:orgId/members
 */
orgMemberRoutes.get("/orgs/:orgId/members", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;

  const token = (c as any).get("token") as string;
  const supabase = getSupabaseForUser(token);

  const { data: members, error } = await supabase
    .from("org_members")
    .select("id, user_id, role, created_at, profiles(display_name, avatar_url, id)")
    .eq("org_id", orgId);

  if (error) {
    return c.json({ error: "Failed to fetch members" }, 500);
  }

  return c.json(members ?? []);
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor", "admin"]),
});

/**
 * POST /api/orgs/:orgId/members ¡ª Invite a new member.
 */
orgMemberRoutes.post("/orgs/:orgId/members", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { email, role } = parsed.data;

  // Check member limit
  const limit = PLAN_MEMBER_LIMITS[auth.plan];
  const token = (c as any).get("token") as string;
  const supabase = getSupabaseForUser(token);

  if (limit !== null) {
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    if ((count ?? 0) >= limit) {
      return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "members", upgrade_url: "/pricing" }, 403);
    }
  }

  // Create invite token
  const serviceClient = createServiceClient();
  const inviteToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error } = await serviceClient
    .from("org_invites")
    .insert({ org_id: orgId, email, role, token: inviteToken, expires_at: expiresAt })
    .select()
    .single();

  if (error || !invite) {
    return c.json({ error: "Failed to create invite" }, 500);
  }

  return c.json(invite, 201);
});

/**
 * DELETE /api/orgs/:orgId/members/:memberId
 */
orgMemberRoutes.delete("/orgs/:orgId/members/:memberId", async (c) => {
  const { orgId, memberId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;

  const token = (c as any).get("token") as string;
  const supabase = getSupabaseForUser(token);

  const { data: member, error: fetchError } = await supabase
    .from("org_members")
    .select("id, role")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (fetchError || !member) {
    return c.json({ error: "Member not found" }, 404);
  }

  if (member.role === "owner") {
    return c.json({ error: "Cannot remove the organization owner" }, 403);
  }

  const { error: deleteError } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (deleteError) {
    return c.json({ error: "Failed to remove member" }, 500);
  }

  return c.json({ success: true });
});

