import { createClient } from "@supabase/supabase-js";
import type { Context, MiddlewareHandler } from "hono";
import { getEnv } from "./env.js";
import type { Role, Plan } from "@cloudtour/types";

export interface AuthUser {
  userId: string;
  email?: string;
}

export interface OrgContext extends AuthUser {
  orgId: string;
  role: Role;
  plan: Plan;
}

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function createServiceClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Auth middleware ¡ª extracts Bearer JWT and validates via Supabase.
 * Sets c.var.user on success.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  (c as any).set("user", { userId: data.user.id, email: data.user.email });
  (c as any).set("token", token);
  await next();
};

/**
 * Require org membership with a minimum role.
 */
export async function requireOrgRole(
  c: Context,
  orgId: string,
  minimumRole: Role
): Promise<OrgContext | Response> {
  const user = (c as any).get("user") as AuthUser;
  const token = (c as any).get("token") as string;

  const env = getEnv();
  // Use the user's token so RLS applies correctly
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: member, error: memberError } = await supabase
    .from("org_members")
    .select("role, org_id")
    .eq("org_id", orgId)
    .eq("user_id", user.userId)
    .single();

  if (memberError || !member) {
    return c.json({ error: "Forbidden" }, 403) as unknown as Response;
  }

  const memberRole = member.role as Role;
  if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minimumRole]) {
    return c.json({ error: "Forbidden" }, 403) as unknown as Response;
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .single();

  if (orgError || !org) {
    return c.json({ error: "Organization not found" }, 404) as unknown as Response;
  }

  return {
    userId: user.userId,
    email: user.email,
    orgId,
    role: memberRole,
    plan: org.plan as Plan,
  };
}

export function getSupabaseForUser(token: string) {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

