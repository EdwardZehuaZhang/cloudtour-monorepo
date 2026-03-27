import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { z } from "zod";
import { createServiceClient } from "@cloudtour/db";
import type { Json } from "@cloudtour/db";
import type { Role, Plan, SplatFileFormat, PlanLimitsMap } from "@cloudtour/types";
import { createHash } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const stripe = new Stripe(STRIPE_SECRET_KEY);

const STRIPE_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_monthly",
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? "price_enterprise_monthly",
};

const STORAGE_BUCKETS = { SPLAT_FILES: "splat-files", THUMBNAILS: "thumbnails", ASSETS: "assets" } as const;

function splatFilePath(orgId: string, tourId: string, sceneId: string, format: string) { return `${orgId}/${tourId}/${sceneId}/scene.${format}`; }
function thumbnailPath(orgId: string, tourId: string, sceneId: string) { return `${orgId}/${tourId}/${sceneId}/thumbnail.webp`; }
function assetPath(orgId: string, type: string, filename: string) { return `${orgId}/${type}/${filename}`; }

const PLAN_LIMITS: PlanLimitsMap = {
  free: { tours: 2, scenes_per_tour: 3, storage_bytes: 1 * 1024 * 1024 * 1024, members: 1 },
  pro: { tours: null, scenes_per_tour: 20, storage_bytes: 50 * 1024 * 1024 * 1024, members: 10 },
  enterprise: { tours: null, scenes_per_tour: null, storage_bytes: 500 * 1024 * 1024 * 1024, members: null },
};

const ROLE_HIERARCHY: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

function slugify(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  return slug || "tour";
}

type SClient = ReturnType<typeof createServiceClient>;
interface AuthContext { supabase: SClient; userId: string; orgId: string; role: Role; plan: Plan; }

async function requireOrgRole(authHeader: string | undefined, orgId: string, minimumRole: Role): Promise<AuthContext | { error: string; status: number }> {
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized", status: 401 };
  const token = authHeader.slice(7);
  const anonClient = createClient(SUPABASE_URL, token);
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) return { error: "Unauthorized", status: 401 };
  const supabase = createServiceClient();
  const { data: member, error: memberError } = await supabase.from("org_members").select("role, org_id").eq("org_id", orgId).eq("user_id", user.id).single();
  if (memberError || !member) return { error: "Forbidden", status: 403 };
  const memberRole = member.role as Role;
  if (ROLE_HIERARCHY[memberRole] < ROLE_HIERARCHY[minimumRole]) return { error: "Forbidden", status: 403 };
  const { data: org, error: orgError } = await supabase.from("organizations").select("plan").eq("id", orgId).single();
  if (orgError || !org) return { error: "Organization not found", status: 404 };
  return { supabase, userId: user.id, orgId, role: memberRole, plan: org.plan as Plan };
}

function isErr(v: AuthContext | { error: string; status: number }): v is { error: string; status: number } { return "error" in v; }

function detectSplatFormat(header: Uint8Array): SplatFileFormat {
  if (header.length >= 4 && header[0] === 0x70 && header[1] === 0x6c && header[2] === 0x79 && header[3] === 0x0a) return "ply";
  if (header.length >= 3 && header[0] === 0x53 && header[1] === 0x50 && header[2] === 0x5a) return "spz";
  return "splat";
}

export const app = new Hono();
app.use("*", cors({ origin: FRONTEND_URL, allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));

// Public: GET /api/tours
app.get("/api/tours", async (c) => {
  const url = new URL(c.req.url, "http://localhost");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;
  const category = url.searchParams.get("category");
  const location = url.searchParams.get("location");
  const tags = url.searchParams.get("tags");
  const search = url.searchParams.get("search");
  const sort = url.searchParams.get("sort") ?? "newest";
  const validCategories = ["real_estate", "tourism", "museum", "education", "other"];
  const supabase = createServiceClient();
  let countQ = supabase.from("tours").select("id", { count: "exact", head: true }).eq("status", "published");
  let dataQ = supabase.from("tours").select("id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_at").eq("status", "published");
  if (category && validCategories.includes(category)) { countQ = countQ.eq("category", category as any); dataQ = dataQ.eq("category", category as any); }
  if (location) { countQ = countQ.ilike("location", `%${location}%`); dataQ = dataQ.ilike("location", `%${location}%`); }
  if (tags) { const tl = tags.split(",").map(t => t.trim()).filter(Boolean); if (tl.length) { countQ = countQ.overlaps("tags", tl); dataQ = dataQ.overlaps("tags", tl); } }
  if (search) { const f = `title.ilike.%${search}%,description.ilike.%${search}%`; countQ = countQ.or(f); dataQ = dataQ.or(f); }
  if (sort === "popular") dataQ = dataQ.order("view_count", { ascending: false });
  else if (sort === "alphabetical") dataQ = dataQ.order("title", { ascending: true });
  else dataQ = dataQ.order("created_at", { ascending: false });
  const { count } = await countQ;
  const { data: tours, error } = await dataQ.range(offset, offset + limit - 1);
  if (error) return c.json({ error: "Failed to fetch tours" }, 500);
  const tourIds = (tours ?? []).map(t => t.id);
  const scenesMap: Record<string, { count: number; thumbnail_url: string | null }> = {};
  if (tourIds.length) {
    const { data: scenes } = await supabase.from("scenes").select("tour_id, thumbnail_url, sort_order").in("tour_id", tourIds).order("sort_order", { ascending: true });
    if (scenes) for (const s of scenes) { if (!scenesMap[s.tour_id]) scenesMap[s.tour_id] = { count: 1, thumbnail_url: s.thumbnail_url }; else scenesMap[s.tour_id]!.count++; }
  }
  return c.json({ data: (tours ?? []).map(t => ({ ...t, scene_count: scenesMap[t.id]?.count ?? 0, first_scene_thumbnail_url: scenesMap[t.id]?.thumbnail_url ?? null })), pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) } });
});

// Public: GET /api/tours/:slug
app.get("/api/tours/:slug", async (c) => {
  const slug = c.req.param("slug");
  const supabase = createServiceClient();
  const { data: tour, error: tourError } = await supabase.from("tours").select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at").eq("slug", slug).eq("status", "published").single();
  if (tourError || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scenes } = await supabase.from("scenes").select("id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at").eq("tour_id", tour.id).order("sort_order", { ascending: true });
  const sceneIds = (scenes ?? []).map(s => s.id);
  let waypoints: any[] = [], hotspots: any[] = [];
  if (sceneIds.length) {
    const [wp, hs] = await Promise.all([supabase.from("waypoints").select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at").in("scene_id", sceneIds), supabase.from("hotspots").select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at").in("scene_id", sceneIds)]);
    waypoints = wp.data ?? []; hotspots = hs.data ?? [];
  }
  const wpByScene: Record<string, any[]> = {}, hsByScene: Record<string, any[]> = {};
  for (const w of waypoints) { if (!wpByScene[w.scene_id]) wpByScene[w.scene_id] = []; wpByScene[w.scene_id]!.push(w); }
  for (const h of hotspots) { if (!hsByScene[h.scene_id]) hsByScene[h.scene_id] = []; hsByScene[h.scene_id]!.push(h); }
  const { data: org } = await supabase.from("organizations").select("name, slug").eq("id", tour.org_id).single();
  return c.json({ ...tour, scenes: (scenes ?? []).map(s => ({ ...s, waypoints: wpByScene[s.id] ?? [], hotspots: hsByScene[s.id] ?? [] })), organization: org ? { name: org.name, slug: org.slug } : null });
});

// Public: POST /api/tours/:slug/view
app.post("/api/tours/:slug/view", async (c) => {
  const slug = c.req.param("slug");
  const supabase = createServiceClient();
  const { data: tour, error } = await supabase.from("tours").select("id").eq("slug", slug).eq("status", "published").single();
  if (error || !tour) return c.json({ error: "Tour not found" }, 404);
  const ip = (c.req.header("x-forwarded-for") ?? "unknown").split(",")[0]!.trim();
  const viewerIpHash = createHash("sha256").update(ip + tour.id).digest("hex");
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: recent } = await supabase.from("tour_views").select("id").eq("tour_id", tour.id).eq("viewer_ip_hash", viewerIpHash).gte("viewed_at", oneHourAgo).limit(1).maybeSingle();
  if (recent) return c.json({ success: true, deduplicated: true });
  const { error: viewError } = await supabase.from("tour_views").insert({ tour_id: tour.id, viewer_ip_hash: viewerIpHash });
  if (viewError) return c.json({ error: "Failed to record view" }, 500);
  await supabase.rpc("increment_view_count", { tour_id_input: tour.id });
  return c.json({ success: true });
});

// Protected: GET/PATCH /api/me
app.get("/api/me", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const { data: { user }, error } = await createClient(SUPABASE_URL, auth.slice(7)).auth.getUser();
  if (error || !user) return c.json({ error: "Unauthorized" }, 401);
  const { data: profile, error: pe } = await createServiceClient().from("profiles").select("username, display_name, avatar_url, bio, onboarding_completed").eq("id", user.id).single();
  if (pe) return c.json({ error: "Profile not found" }, 404);
  return c.json(profile);
});

const updateProfileSchema = z.object({ username: z.string().min(3).max(30).regex(/^[a-z0-9_-]+$/).optional(), display_name: z.string().min(1).max(100).optional(), avatar_url: z.string().url().nullable().optional(), bio: z.string().max(500).nullable().optional(), onboarding_completed: z.boolean().optional() }).strict();

app.patch("/api/me", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const { data: { user }, error } = await createClient(SUPABASE_URL, auth.slice(7)).auth.getUser();
  if (error || !user) return c.json({ error: "Unauthorized" }, 401);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const updates = parsed.data;
  if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400);
  const { data: profile, error: ue } = await createServiceClient().from("profiles").update(updates).eq("id", user.id).select("username, display_name, avatar_url, bio, onboarding_completed").single();
  if (ue) { if (ue.code === "23505") return c.json({ error: "Username already taken" }, 409); return c.json({ error: "Failed to update profile" }, 500); }
  return c.json(profile);
});

// Protected: GET/POST /api/invite/:token
app.get("/api/invite/:token", async (c) => {
  const token = c.req.param("token");
  const supabase = createServiceClient();
  const { data: invite, error } = await supabase.from("org_members").select("id, org_id, invited_email, role, user_id").eq("invite_token", token).single();
  if (error || !invite) return c.json({ error: "Invitation not found or expired" }, 404);
  if (invite.user_id !== null) return c.json({ error: "Invitation has already been accepted" }, 410);
  const { data: org } = await supabase.from("organizations").select("name").eq("id", invite.org_id).single();
  return c.json({ org_name: org?.name ?? "Unknown Organization", role: invite.role, invited_email: invite.invited_email });
});

app.post("/api/invite/:token", async (c) => {
  const inviteToken = c.req.param("token");
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const { data: { user }, error: ae } = await createClient(SUPABASE_URL, auth.slice(7)).auth.getUser();
  if (ae || !user) return c.json({ error: "Unauthorized" }, 401);
  const supabase = createServiceClient();
  const { data: invite, error: ie } = await supabase.from("org_members").select("id, org_id, user_id").eq("invite_token", inviteToken).single();
  if (ie || !invite) return c.json({ error: "Invitation not found or expired" }, 404);
  if (invite.user_id !== null) return c.json({ error: "Invitation has already been accepted" }, 410);
  const { data: existing } = await supabase.from("org_members").select("id").eq("org_id", invite.org_id).eq("user_id", user.id).single();
  if (existing) { await supabase.from("org_members").delete().eq("id", invite.id); return c.json({ error: "You are already a member of this organization" }, 409); }
  const { error: ue } = await supabase.from("org_members").update({ user_id: user.id, joined_at: new Date().toISOString(), invite_token: null }).eq("id", invite.id);
  if (ue) return c.json({ error: "Failed to accept invitation" }, 500);
  return c.json({ success: true, org_id: invite.org_id });
});

// Protected: org members
app.get("/api/orgs/:orgId/members", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: members, error } = await supabase.from("org_members").select("id, org_id, user_id, invited_email, role, joined_at, created_at").eq("org_id", orgId).order("created_at", { ascending: true });
  if (error) return c.json({ error: "Failed to fetch members" }, 500);
  const userIds = members.map(m => m.user_id).filter((id): id is string => id !== null);
  let profiles: any[] = [];
  if (userIds.length) { const { data } = await supabase.from("profiles").select("id, display_name, avatar_url, username").in("id", userIds); profiles = data ?? []; }
  return c.json({ data: members.map(m => { const p = profiles.find(p => p.id === m.user_id); return { ...m, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null, username: p?.username ?? null }; }) });
});

const inviteMemberSchema = z.object({ invited_email: z.string().email().max(255), role: z.enum(["admin", "editor", "viewer"]) });

app.post("/api/orgs/:orgId/members", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { supabase, plan } = auth;
  const { invited_email, role } = parsed.data;
  const limits = PLAN_LIMITS[plan];
  const { data: existingMembers } = await supabase.from("org_members").select("id, invited_email, user_id").eq("org_id", orgId);
  if ((existingMembers ?? []).some(m => m.invited_email?.toLowerCase() === invited_email.toLowerCase())) return c.json({ error: "This email has already been invited" }, 409);
  if (limits.members !== null && (existingMembers ?? []).length >= limits.members) return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "members", upgrade_url: "/pricing" }, 403);
  const { data: member, error } = await supabase.from("org_members").insert({ org_id: orgId, invited_email: invited_email.toLowerCase(), role, user_id: null, joined_at: null }).select("id, org_id, invited_email, invite_token, role, created_at").single();
  if (error) return c.json({ error: "Failed to create invitation" }, 500);
  return c.json({ id: member.id, org_id: member.org_id, invited_email: member.invited_email, role: member.role, created_at: member.created_at }, 201);
});

app.delete("/api/orgs/:orgId/members/:memberId", async (c) => {
  const orgId = c.req.param("orgId"), memberId = c.req.param("memberId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: member, error: fe } = await supabase.from("org_members").select("id, role, org_id").eq("id", memberId).eq("org_id", orgId).single();
  if (fe || !member) return c.json({ error: "Member not found" }, 404);
  if (member.role === "owner") return c.json({ error: "Cannot remove the organization owner" }, 403);
  const { error: de } = await supabase.from("org_members").delete().eq("id", memberId).eq("org_id", orgId);
  if (de) return c.json({ error: "Failed to remove member" }, 500);
  return c.json({ success: true });
});

// Protected: billing
const createCheckoutSchema = z.object({ plan: z.enum(["pro", "enterprise"]) });

app.post("/api/orgs/:orgId/billing", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "owner");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { plan } = parsed.data;
  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) return c.json({ error: "Invalid plan" }, 400);
  const { supabase } = auth;
  const { data: org } = await supabase.from("organizations").select("name, stripe_customer_id").eq("id", orgId).single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? FRONTEND_URL;
  const params: Stripe.Checkout.SessionCreateParams = { mode: "subscription", line_items: [{ price: priceId, quantity: 1 }], success_url: `${appUrl}/dashboard/settings?billing=success`, cancel_url: `${appUrl}/dashboard/settings?billing=cancelled`, metadata: { org_id: orgId, plan }, subscription_data: { metadata: { org_id: orgId, plan } } };
  if (org?.stripe_customer_id) params.customer = org.stripe_customer_id;
  try { const session = await stripe.checkout.sessions.create(params); return c.json({ url: session.url }, 201); }
  catch (err) { console.error("Stripe checkout session creation failed:", err); return c.json({ error: "Failed to create checkout session" }, 500); }
});

app.get("/api/orgs/:orgId/billing", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "owner");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? FRONTEND_URL;
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();
  if (!org?.stripe_customer_id) return c.json({ error: "No billing account found. Subscribe to a plan first." }, 404);
  try { const ps = await stripe.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: `${appUrl}/dashboard/settings` }); return c.json({ url: ps.url }); }
  catch (err) { console.error("Stripe billing portal session creation failed:", err); return c.json({ error: "Failed to create billing portal session" }, 500); }
});

// Protected: tours CRUD
app.get("/api/orgs/:orgId/tours", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const url = new URL(c.req.url, "http://localhost");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const offset = (page - 1) * limit;
  const { supabase } = auth;
  const { count } = await supabase.from("tours").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { data: tours, error } = await supabase.from("tours").select("id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at").eq("org_id", orgId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) return c.json({ error: "Failed to fetch tours" }, 500);
  return c.json({ data: tours, pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) } });
});

const createTourSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).nullable().optional(), category: z.enum(["real_estate", "tourism", "museum", "education", "other"]).optional().default("other"), tags: z.array(z.string().max(50)).max(20).optional().default([]), location: z.string().max(200).nullable().optional() });

app.post("/api/orgs/:orgId/tours", async (c) => {
  const orgId = c.req.param("orgId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { supabase, userId, plan } = auth;
  const limits = PLAN_LIMITS[plan];
  if (limits.tours !== null) { const { count } = await supabase.from("tours").select("id", { count: "exact", head: true }).eq("org_id", orgId); if ((count ?? 0) >= limits.tours) return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "tours", upgrade_url: "/pricing" }, 403); }
  const baseSlug = slugify(parsed.data.title); let slug = baseSlug, counter = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) { const { data: ex } = await supabase.from("tours").select("id").eq("slug", slug).limit(1); if (!ex?.length) break; slug = `${baseSlug}-${counter++}`; }
  const { data: tour, error } = await supabase.from("tours").insert({ org_id: orgId, title: parsed.data.title, slug, description: parsed.data.description ?? null, category: parsed.data.category, tags: parsed.data.tags, location: parsed.data.location ?? null, created_by: userId }).select().single();
  if (error) { if (error.code === "23505") return c.json({ error: "Tour slug conflict, please try again" }, 409); return c.json({ error: "Failed to create tour" }, 500); }
  return c.json(tour, 201);
});

app.get("/api/orgs/:orgId/tours/:tourId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error } = await supabase.from("tours").select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at").eq("id", tourId).eq("org_id", orgId).single();
  if (error || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scenes } = await supabase.from("scenes").select("id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at").eq("tour_id", tourId).order("sort_order", { ascending: true });
  return c.json({ ...tour, scenes: scenes ?? [] });
});

const updateTourSchema = z.object({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), description: z.string().max(2000).nullable().optional(), category: z.enum(["real_estate", "tourism", "museum", "education", "other"]).optional(), tags: z.array(z.string().max(50)).max(20).optional(), location: z.string().max(200).nullable().optional(), cover_image_url: z.string().url().nullable().optional() }).strict();

app.patch("/api/orgs/:orgId/tours/:tourId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateTourSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const updates = parsed.data; if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400);
  const { supabase } = auth;
  if (updates.slug) { const { data: ex } = await supabase.from("tours").select("id").eq("slug", updates.slug).neq("id", tourId).maybeSingle(); if (ex) return c.json({ error: "Slug already in use", field: "slug" }, 409); }
  const { data: tour, error } = await supabase.from("tours").update(updates).eq("id", tourId).eq("org_id", orgId).select().single();
  if (error || !tour) return c.json({ error: "Tour not found or update failed" }, 404);
  return c.json(tour);
});

app.delete("/api/orgs/:orgId/tours/:tourId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { error } = await auth.supabase.from("tours").delete().eq("id", tourId).eq("org_id", orgId);
  if (error) return c.json({ error: "Failed to delete tour" }, 500);
  return c.json({ success: true });
});

app.post("/api/orgs/:orgId/tours/:tourId/publish", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { data: tour, error } = await auth.supabase.from("tours").update({ status: "published" }).eq("id", tourId).eq("org_id", orgId).select().single();
  if (error || !tour) return c.json({ error: "Tour not found" }, 404);
  return c.json(tour);
});

// Protected: scenes CRUD
const pos3d = z.object({ x: z.number(), y: z.number(), z: z.number() });
const camPos = z.object({ position: pos3d, target: pos3d });

app.get("/api/orgs/:orgId/tours/:tourId/scenes", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scenes, error } = await supabase.from("scenes").select("id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at").eq("tour_id", tourId).order("sort_order", { ascending: true });
  if (error) return c.json({ error: "Failed to fetch scenes" }, 500);
  return c.json({ data: scenes ?? [] });
});

const createSceneSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).nullable().optional(), default_camera_position: camPos.nullable().optional() });

app.post("/api/orgs/:orgId/tours/:tourId/scenes", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = createSceneSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { supabase, plan } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const limits = PLAN_LIMITS[plan];
  if (limits.scenes_per_tour !== null) { const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).eq("tour_id", tourId); if ((count ?? 0) >= limits.scenes_per_tour) return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "scenes_per_tour", upgrade_url: "/pricing" }, 403); }
  const { data: lastScene } = await supabase.from("scenes").select("sort_order").eq("tour_id", tourId).order("sort_order", { ascending: false }).limit(1).single();
  const nextSortOrder = lastScene ? lastScene.sort_order + 1 : 0;
  const { data: scene, error } = await supabase.from("scenes").insert({ tour_id: tourId, title: parsed.data.title, description: parsed.data.description ?? null, sort_order: nextSortOrder, default_camera_position: parsed.data.default_camera_position ?? null }).select().single();
  if (error) return c.json({ error: "Failed to create scene" }, 500);
  return c.json(scene, 201);
});

const updateSceneSchema = z.object({ title: z.string().min(1).max(200).optional(), description: z.string().max(2000).nullable().optional(), sort_order: z.number().int().min(0).optional(), default_camera_position: camPos.nullable().optional() }).strict();

app.patch("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateSceneSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const updates = parsed.data; if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error } = await supabase.from("scenes").update(updates).eq("id", sceneId).eq("tour_id", tourId).select().single();
  if (error || !scene) return c.json({ error: "Scene not found or update failed" }, 404);
  return c.json(scene);
});

app.delete("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { error } = await supabase.from("scenes").delete().eq("id", sceneId).eq("tour_id", tourId);
  if (error) return c.json({ error: "Failed to delete scene" }, 500);
  return c.json({ success: true });
});

// Protected: waypoints
const createWaypointSchema = z.object({ target_scene_id: z.string().uuid(), label: z.string().min(1).max(200), icon: z.string().max(50).nullable().optional(), position_3d: pos3d });
const updateWaypointSchema = z.object({ target_scene_id: z.string().uuid().optional(), label: z.string().min(1).max(200).optional(), icon: z.string().max(50).nullable().optional(), position_3d: pos3d.optional() }).strict();

app.get("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints", async (c) => {
  const orgId = c.req.param("orgId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { data, error } = await auth.supabase.from("waypoints").select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at").eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to fetch waypoints" }, 500);
  return c.json({ data: data ?? [] });
});

app.post("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = createWaypointSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { supabase } = auth;
  const { data: ts } = await supabase.from("scenes").select("id").eq("id", parsed.data.target_scene_id).eq("tour_id", tourId).single();
  if (!ts) return c.json({ error: "Target scene not found in this tour" }, 400);
  const { data: wp, error } = await supabase.from("waypoints").insert({ scene_id: sceneId, target_scene_id: parsed.data.target_scene_id, label: parsed.data.label, icon: parsed.data.icon ?? null, position_3d: parsed.data.position_3d }).select().single();
  if (error) return c.json({ error: "Failed to create waypoint" }, 500);
  return c.json(wp, 201);
});

app.patch("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints/:waypointId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId"), waypointId = c.req.param("waypointId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateWaypointSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const updates = parsed.data; if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  if (updates.target_scene_id) { const { data: ts } = await supabase.from("scenes").select("id").eq("id", updates.target_scene_id).eq("tour_id", tourId).single(); if (!ts) return c.json({ error: "Target scene not found in this tour" }, 400); }
  const { data: wp, error } = await supabase.from("waypoints").update(updates).eq("id", waypointId).eq("scene_id", sceneId).select().single();
  if (error || !wp) return c.json({ error: "Waypoint not found or update failed" }, 404);
  return c.json(wp);
});

app.delete("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints/:waypointId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId"), waypointId = c.req.param("waypointId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { error } = await supabase.from("waypoints").delete().eq("id", waypointId).eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to delete waypoint" }, 500);
  return c.json({ success: true });
});

// Protected: hotspots
const createHotspotSchema = z.object({ title: z.string().min(1).max(200), content_type: z.enum(["text", "image", "video", "audio", "link"]).default("text"), content_markdown: z.string().max(10000).nullable().optional(), media_url: z.string().url().nullable().optional(), icon: z.string().max(50).nullable().optional(), position_3d: pos3d });
const updateHotspotSchema = z.object({ title: z.string().min(1).max(200).optional(), content_type: z.enum(["text", "image", "video", "audio", "link"]).optional(), content_markdown: z.string().max(10000).nullable().optional(), media_url: z.string().url().nullable().optional(), icon: z.string().max(50).nullable().optional(), position_3d: pos3d.optional() }).strict();

app.get("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots", async (c) => {
  const orgId = c.req.param("orgId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { data, error } = await auth.supabase.from("hotspots").select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at").eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to fetch hotspots" }, 500);
  return c.json({ data: data ?? [] });
});

app.post("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots", async (c) => {
  const orgId = c.req.param("orgId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = createHotspotSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { data: hs, error } = await auth.supabase.from("hotspots").insert({ scene_id: sceneId, title: parsed.data.title, content_type: parsed.data.content_type, content_markdown: parsed.data.content_markdown ?? null, media_url: parsed.data.media_url ?? null, icon: parsed.data.icon ?? null, position_3d: parsed.data.position_3d }).select().single();
  if (error) return c.json({ error: "Failed to create hotspot" }, 500);
  return c.json(hs, 201);
});

app.patch("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots/:hotspotId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId"), hotspotId = c.req.param("hotspotId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateHotspotSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const updates = parsed.data; if (!Object.keys(updates).length) return c.json({ error: "No fields to update" }, 400);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: hs, error } = await supabase.from("hotspots").update(updates).eq("id", hotspotId).eq("scene_id", sceneId).select().single();
  if (error || !hs) return c.json({ error: "Hotspot not found or update failed" }, 404);
  return c.json(hs);
});

app.delete("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots/:hotspotId", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId"), hotspotId = c.req.param("hotspotId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { error } = await supabase.from("hotspots").delete().eq("id", hotspotId).eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to delete hotspot" }, 500);
  return c.json({ success: true });
});

// Protected: upload (splat)
const uploadRequestSchema = z.object({ format: z.enum(["ply", "splat", "spz"]) });

app.post("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/upload", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = uploadRequestSchema.safeParse(body); if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  const { supabase, plan } = auth;
  const format = parsed.data.format as SplatFileFormat;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error: se } = await supabase.from("scenes").select("id").eq("id", sceneId).eq("tour_id", tourId).single();
  if (se || !scene) return c.json({ error: "Scene not found" }, 404);
  const limits = PLAN_LIMITS[plan];
  const { data: org } = await supabase.from("organizations").select("storage_used_bytes").eq("id", orgId).single();
  if (org && limits.storage_bytes !== null && org.storage_used_bytes >= limits.storage_bytes) return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "storage", upgrade_url: "/pricing" }, 403);
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: orgTours } = await supabase.from("tours").select("id").eq("org_id", orgId);
  if (orgTours?.length) { const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).in("tour_id", orgTours.map(t => t.id)).not("splat_url", "is", null).gte("updated_at", oneHourAgo); if ((count ?? 0) >= 10) return c.json({ error: "Rate limit exceeded. Maximum 10 uploads per hour per organization." }, 429); }
  const serviceClient = createServiceClient();
  const storagePath = splatFilePath(orgId, tourId, sceneId, format);
  await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([storagePath]);
  const { data: signedUrl, error: signError } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).createSignedUploadUrl(storagePath);
  if (signError || !signedUrl) return c.json({ error: "Failed to create upload URL" }, 500);
  return c.json({ upload_url: signedUrl.signedUrl, token: signedUrl.token, path: signedUrl.path, format, expires_in: 900 });
});

app.post("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/upload/confirm", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase, plan } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error: se } = await supabase.from("scenes").select("id, splat_url").eq("id", sceneId).eq("tour_id", tourId).single();
  if (se || !scene) return c.json({ error: "Scene not found" }, 404);
  const serviceClient = createServiceClient();
  const basePath = `${orgId}/${tourId}/${sceneId}`;
  const exts: SplatFileFormat[] = ["ply", "splat", "spz"];
  let uploadedPath: string | null = null, fileSize = 0;
  for (const ext of exts) { const fp = splatFilePath(orgId, tourId, sceneId, ext); const { data: files } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).list(basePath, { search: `scene.${ext}` }); const f = files?.find(f => f.name === `scene.${ext}`); if (f) { uploadedPath = fp; fileSize = f.metadata?.size ?? 0; break; } }
  if (!uploadedPath) return c.json({ error: "No uploaded file found. Please upload the file first." }, 404);
  const limits = PLAN_LIMITS[plan];
  const { data: org } = await supabase.from("organizations").select("storage_used_bytes").eq("id", orgId).single();
  if (org && limits.storage_bytes !== null && org.storage_used_bytes + fileSize > limits.storage_bytes) { await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([uploadedPath]); return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "storage", upgrade_url: "/pricing" }, 403); }
  const { data: fileData, error: de } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).download(uploadedPath);
  if (de || !fileData) return c.json({ error: "Failed to read uploaded file for validation" }, 500);
  const detectedFormat = detectSplatFormat(new Uint8Array(await fileData.slice(0, 16).arrayBuffer()));
  const correctPath = splatFilePath(orgId, tourId, sceneId, detectedFormat);
  if (uploadedPath !== correctPath) { const { error: ce } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).copy(uploadedPath, correctPath); if (ce) return c.json({ error: "Failed to process uploaded file" }, 500); await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([uploadedPath]); }
  const { data: urlData } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).createSignedUrl(correctPath, 31536000);
  const splatUrl = urlData?.signedUrl ?? correctPath;
  let oldFileSize = 0;
  if (scene.splat_url) { for (const ext of exts) { const op = `${basePath}/scene.${ext}`; if (op === correctPath) continue; const { data: of2 } = await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).list(basePath, { search: `scene.${ext}` }); const of3 = of2?.find(f => f.name === `scene.${ext}`); if (of3) { oldFileSize = of3.metadata?.size ?? 0; await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([op]); break; } } }
  const { data: updatedScene, error: ue } = await supabase.from("scenes").update({ splat_url: splatUrl, splat_file_format: detectedFormat }).eq("id", sceneId).eq("tour_id", tourId).select().single();
  if (ue || !updatedScene) return c.json({ error: "Failed to update scene" }, 500);
  const delta = fileSize - oldFileSize;
  if (org && delta !== 0) await serviceClient.from("organizations").update({ storage_used_bytes: Math.max(0, org.storage_used_bytes + delta) }).eq("id", orgId);
  return c.json({ scene: updatedScene, detected_format: detectedFormat, file_size: fileSize });
});

// Protected: floor-plan
const updateScenePositionsSchema = z.object({ scene_positions: z.array(z.object({ scene_id: z.string().uuid(), x: z.number().min(0).max(1), y: z.number().min(0).max(1) })) });

app.get("/api/orgs/:orgId/tours/:tourId/floor-plan", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "viewer");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: floorPlan, error } = await supabase.from("floor_plans").select("*").eq("tour_id", tourId).maybeSingle();
  if (error) return c.json({ error: "Failed to fetch floor plan" }, 500);
  return c.json({ data: floorPlan });
});

app.patch("/api/orgs/:orgId/tours/:tourId/floor-plan", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  let body: unknown; try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }
  const parsed = updateScenePositionsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  const { data: floorPlan, error } = await supabase.from("floor_plans").update({ scene_positions: parsed.data.scene_positions }).eq("tour_id", tourId).select().single();
  if (error || !floorPlan) return c.json({ error: "Floor plan not found" }, 404);
  return c.json({ data: floorPlan });
});

app.delete("/api/orgs/:orgId/tours/:tourId/floor-plan", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "admin");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { error } = await supabase.from("floor_plans").delete().eq("tour_id", tourId);
  if (error) return c.json({ error: "Failed to delete floor plan" }, 500);
  return c.json({ success: true });
});

app.post("/api/orgs/:orgId/tours/:tourId/floor-plan/upload", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const serviceClient = createServiceClient();
  const storagePath = assetPath(orgId, "floor-plans", `${tourId}.webp`);
  await serviceClient.storage.from(STORAGE_BUCKETS.ASSETS).remove([storagePath]);
  const { data: signedUrl, error: signError } = await serviceClient.storage.from(STORAGE_BUCKETS.ASSETS).createSignedUploadUrl(storagePath);
  if (signError || !signedUrl) return c.json({ error: "Failed to create upload URL" }, 500);
  return c.json({ upload_url: signedUrl.signedUrl, token: signedUrl.token, path: signedUrl.path, expires_in: 900 });
});

app.put("/api/orgs/:orgId/tours/:tourId/floor-plan/upload", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const serviceClient = createServiceClient();
  const storagePath = assetPath(orgId, "floor-plans", `${tourId}.webp`);
  const { data: files } = await serviceClient.storage.from(STORAGE_BUCKETS.ASSETS).list(`${orgId}/floor-plans`, { search: `${tourId}.webp` });
  const uploaded = files?.find(f => f.name === `${tourId}.webp`);
  if (!uploaded) return c.json({ error: "No uploaded file found. Please upload the file first." }, 404);
  const { data: signedData, error: signedError } = await serviceClient.storage.from(STORAGE_BUCKETS.ASSETS).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);
  if (signedError || !signedData) return c.json({ error: "Failed to generate image URL" }, 500);
  const imageUrl = signedData.signedUrl;
  const { data: existing } = await supabase.from("floor_plans").select("id").eq("tour_id", tourId).maybeSingle();
  let floorPlan: any;
  if (existing) {
    const { data, error } = await supabase.from("floor_plans").update({ image_url: imageUrl }).eq("id", existing.id).select().single();
    if (error) return c.json({ error: "Failed to update floor plan" }, 500);
    floorPlan = data;
  } else {
    const { data, error } = await supabase.from("floor_plans").insert({ tour_id: tourId, image_url: imageUrl }).select().single();
    if (error) return c.json({ error: "Failed to create floor plan" }, 500);
    floorPlan = data;
  }
  return c.json({ data: floorPlan });
});

// Protected: thumbnail
app.post("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/thumbnail", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error: se } = await supabase.from("scenes").select("id").eq("id", sceneId).eq("tour_id", tourId).single();
  if (se || !scene) return c.json({ error: "Scene not found" }, 404);
  const serviceClient = createServiceClient();
  const path = thumbnailPath(orgId, tourId, sceneId);
  await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).remove([path]);
  const { data: signedUrl, error: signError } = await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).createSignedUploadUrl(path);
  if (signError || !signedUrl) return c.json({ error: "Failed to create upload URL" }, 500);
  return c.json({ upload_url: signedUrl.signedUrl, token: signedUrl.token, path: signedUrl.path, expires_in: 900 });
});

app.put("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/thumbnail", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error: se } = await supabase.from("scenes").select("id").eq("id", sceneId).eq("tour_id", tourId).single();
  if (se || !scene) return c.json({ error: "Scene not found" }, 404);
  const serviceClient = createServiceClient();
  const path = thumbnailPath(orgId, tourId, sceneId);
  const { data: files } = await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).list(`${orgId}/${tourId}/${sceneId}`, { search: "thumbnail.webp" });
  if (!files?.find(f => f.name === "thumbnail.webp")) return c.json({ error: "No uploaded thumbnail found. Please upload the file first." }, 404);
  const { data: urlData } = serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).getPublicUrl(path);
  const thumbnailUrl = urlData.publicUrl;
  const { data: updatedScene, error: ue } = await supabase.from("scenes").update({ thumbnail_url: thumbnailUrl }).eq("id", sceneId).eq("tour_id", tourId).select().single();
  if (ue || !updatedScene) return c.json({ error: "Failed to update scene" }, 500);
  return c.json({ scene: updatedScene, thumbnail_url: thumbnailUrl });
});

app.delete("/api/orgs/:orgId/tours/:tourId/scenes/:sceneId/thumbnail", async (c) => {
  const orgId = c.req.param("orgId"), tourId = c.req.param("tourId"), sceneId = c.req.param("sceneId");
  const auth = await requireOrgRole(c.req.header("Authorization"), orgId, "editor");
  if (isErr(auth)) return c.json({ error: auth.error }, auth.status as any);
  const { supabase } = auth;
  const { data: tour, error: te } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (te || !tour) return c.json({ error: "Tour not found" }, 404);
  const { data: scene, error: se } = await supabase.from("scenes").select("id, thumbnail_url").eq("id", sceneId).eq("tour_id", tourId).single();
  if (se || !scene) return c.json({ error: "Scene not found" }, 404);
  const serviceClient = createServiceClient();
  await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).remove([thumbnailPath(orgId, tourId, sceneId)]);
  const { data: updatedScene, error: ue } = await supabase.from("scenes").update({ thumbnail_url: null }).eq("id", sceneId).eq("tour_id", tourId).select().single();
  if (ue || !updatedScene) return c.json({ error: "Failed to update scene" }, 500);
  return c.json({ scene: updatedScene });
});

// Webhook: stripe
app.post("/api/webhooks/stripe", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing stripe-signature header" }, 400);

  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET); }
  catch (err) { console.error("Stripe webhook signature verification failed:", err); return c.json({ error: "Invalid signature" }, 400); }

  const supabase = createServiceClient();
  const extractOrgId = (event: Stripe.Event): string | null => {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const metadata = obj.metadata as Record<string, string> | undefined;
    if (metadata?.org_id) return metadata.org_id;
    const sd = obj.subscription_details as { metadata?: Record<string, string> } | undefined;
    if (sd?.metadata?.org_id) return sd.metadata.org_id;
    return null;
  };

  const orgId = extractOrgId(event);
  if (orgId) {
    const { error: insertError } = await supabase.from("billing_events").insert({ org_id: orgId, stripe_event_id: event.id, event_type: event.type, payload: JSON.parse(JSON.stringify(event.data.object)) as Json });
    if (insertError && insertError.code !== "23505") console.error("Failed to record billing event:", insertError);
    if (insertError?.code === "23505") return c.json({ received: true });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const s = event.data.object as Stripe.Subscription;
      const oid = s.metadata?.org_id;
      const plan = s.metadata?.plan as Plan | undefined;
      if (oid && plan && ["pro", "enterprise"].includes(plan) && (s.status === "active" || s.status === "trialing")) {
        await supabase.from("organizations").update({ plan, stripe_customer_id: typeof s.customer === "string" ? s.customer : s.customer.id, stripe_subscription_id: s.id }).eq("id", oid);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const s = event.data.object as Stripe.Subscription;
      const oid = s.metadata?.org_id;
      if (oid) await supabase.from("organizations").update({ plan: "free", stripe_subscription_id: null }).eq("id", oid);
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const oid = session.metadata?.org_id;
      if (oid && session.customer) {
        const cid = typeof session.customer === "string" ? session.customer : session.customer.id;
        await supabase.from("organizations").update({ stripe_customer_id: cid }).eq("id", oid);
      }
      break;
    }
    default:
      break;
  }

  return c.json({ received: true });
});



