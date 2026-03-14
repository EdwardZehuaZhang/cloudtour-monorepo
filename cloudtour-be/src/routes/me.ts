import { Hono } from "hono";
import { requireOrgRole, getSupabaseForUser } from "../auth.js";
import type { AuthUser } from "../auth.js";

export const meRoutes = new Hono();

/**
 * GET /api/me ¡ª Returns the authenticated user profile and their org memberships.
 */
meRoutes.get("/me", async (c) => {
  const user = (c as any).get("user") as AuthUser;
  const token = (c as any).get("token") as string;
  const supabase = getSupabaseForUser(token);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, created_at")
    .eq("id", user.userId)
    .single();

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role, organizations(id, name, slug, plan)")
    .eq("user_id", user.userId);

  return c.json({ profile, memberships: memberships ?? [] });
});

/**
 * PATCH /api/me ¡ª Updates the authenticated user profile.
 */
meRoutes.patch("/me", async (c) => {
  const user = (c as any).get("user") as AuthUser;
  const token = (c as any).get("token") as string;
  const supabase = getSupabaseForUser(token);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { display_name, avatar_url } = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof display_name === "string") updates.display_name = display_name;
  if (typeof avatar_url === "string" || avatar_url === null) updates.avatar_url = avatar_url;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.userId)
    .select()
    .single();

  if (error || !data) {
    return c.json({ error: "Failed to update profile" }, 500);
  }

  return c.json(data);
});

