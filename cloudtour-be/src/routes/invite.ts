import { Hono } from "hono";
import { getSupabaseForUser } from "../auth.js";
import type { AuthUser } from "../auth.js";
import { createServiceClient } from "../auth.js";

export const inviteRoutes = new Hono();

/**
 * GET /api/invite/:token ¡ª Returns invite details.
 * Auth is required to accept, but invite preview can be public.
 */
inviteRoutes.get("/invite/:token", async (c) => {
  const token = c.req.param("token");
  const supabase = createServiceClient();

  const { data: invite, error } = await supabase
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, used_at, organizations(name, slug)")
    .eq("token", token)
    .single();

  if (error || !invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  if (invite.used_at) {
    return c.json({ error: "Invite already used" }, 410);
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "Invite expired" }, 410);
  }

  return c.json(invite);
});

/**
 * POST /api/invite/:token ¡ª Accept an invite.
 * Requires auth.
 */
inviteRoutes.post("/invite/:token", async (c) => {
  const inviteToken = c.req.param("token");
  const user = (c as any).get("user") as AuthUser;
  const authToken = (c as any).get("token") as string;

  const serviceClient = createServiceClient();

  const { data: invite, error } = await serviceClient
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, used_at")
    .eq("token", inviteToken)
    .single();

  if (error || !invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  if (invite.used_at) {
    return c.json({ error: "Invite already used" }, 410);
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return c.json({ error: "Invite expired" }, 410);
  }

  // Add user to org
  const { error: memberError } = await serviceClient
    .from("org_members")
    .insert({ org_id: invite.org_id, user_id: user.userId, role: invite.role });

  if (memberError && memberError.code !== "23505") {
    return c.json({ error: "Failed to join organization" }, 500);
  }

  // Mark invite as used
  await serviceClient
    .from("org_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return c.json({ success: true, org_id: invite.org_id });
});

