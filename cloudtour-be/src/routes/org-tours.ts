import { Hono } from "hono";
import { z } from "zod";
import Stripe from "stripe";
import { requireOrgRole, getSupabaseForUser, createServiceClient } from "../auth.js";
import { getEnv } from "../env.js";
import type { Plan, SplatFileFormat } from "@cloudtour/types";

export const orgTourRoutes = new Hono();

// ©¤©¤©¤ Plan limits ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

type PlanLimits = { tours: number | null; scenes_per_tour: number | null; storage_bytes: number | null; members: number | null };
const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:       { tours: 2,    scenes_per_tour: 3,    storage_bytes: 1  * 1024 * 1024 * 1024, members: 1    },
  pro:        { tours: null, scenes_per_tour: 20,   storage_bytes: 50 * 1024 * 1024 * 1024, members: 10   },
  enterprise: { tours: null, scenes_per_tour: null, storage_bytes: 500 * 1024 * 1024 * 1024, members: null },
};

const STORAGE_BUCKETS = { SPLAT_FILES: "splat-files", THUMBNAILS: "thumbnails" } as const;
function splatFilePath(orgId: string, tourId: string, sceneId: string, format: string) {
  return `${orgId}/${tourId}/${sceneId}/scene.${format}`;
}
function thumbnailPath(orgId: string, tourId: string, sceneId: string) {
  return `${orgId}/${tourId}/${sceneId}/thumbnail.webp`;
}

function slugify(title: string): string {
  let slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
  if (!slug) slug = "tour";
  return slug;
}

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const env = getEnv();
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// ©¤©¤©¤ Tours ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

orgTourRoutes.get("/orgs/:orgId/tours", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tours, error } = await supabase
    .from("tours")
    .select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: "Failed to fetch tours" }, 500);
  return c.json(tours ?? []);
});

const createTourSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.enum(["real_estate", "tourism", "museum", "education", "other"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  location: z.string().max(200).nullable().optional(),
});

orgTourRoutes.post("/orgs/:orgId/tours", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);

  // Check tour limit
  const limits = PLAN_LIMITS[auth.plan];
  if (limits.tours !== null) {
    const { count } = await supabase.from("tours").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if ((count ?? 0) >= limits.tours) {
      return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "tours", upgrade_url: "/pricing" }, 403);
    }
  }

  // Generate unique slug
  let slug = slugify(parsed.data.title);
  const { data: existing } = await supabase.from("tours").select("id").eq("slug", slug).maybeSingle();
  if (existing) slug = `${slug}-${Date.now()}`;

  const { data: tour, error } = await supabase
    .from("tours")
    .insert({ org_id: orgId, created_by: auth.userId, slug, ...parsed.data })
    .select()
    .single();

  if (error || !tour) return c.json({ error: "Failed to create tour" }, 500);
  return c.json(tour, 201);
});

orgTourRoutes.get("/orgs/:orgId/tours/:tourId", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tour, error } = await supabase
    .from("tours")
    .select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at")
    .eq("id", tourId).eq("org_id", orgId).single();

  if (error || !tour) return c.json({ error: "Tour not found" }, 404);

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at")
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true });

  return c.json({ ...tour, scenes: scenes ?? [] });
});

const updateTourSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.enum(["real_estate", "tourism", "museum", "education", "other"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  location: z.string().max(200).nullable().optional(),
  cover_image_url: z.string().url().nullable().optional(),
}).strict();

orgTourRoutes.patch("/orgs/:orgId/tours/:tourId", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = updateTourSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) return c.json({ error: "No fields to update" }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);

  if (updates.slug) {
    const { data: existing } = await supabase.from("tours").select("id").eq("slug", updates.slug).neq("id", tourId).maybeSingle();
    if (existing) return c.json({ error: "Slug already in use", field: "slug" }, 409);
  }

  const { data: tour, error } = await supabase
    .from("tours").update(updates).eq("id", tourId).eq("org_id", orgId).select().single();

  if (error || !tour) return c.json({ error: "Tour not found or update failed" }, 404);
  return c.json(tour);
});

orgTourRoutes.delete("/orgs/:orgId/tours/:tourId", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { error } = await supabase.from("tours").delete().eq("id", tourId).eq("org_id", orgId);
  if (error) return c.json({ error: "Failed to delete tour" }, 500);
  return c.json({ success: true });
});

orgTourRoutes.post("/orgs/:orgId/tours/:tourId/publish", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tour, error } = await supabase
    .from("tours").update({ status: "published" }).eq("id", tourId).eq("org_id", orgId).select().single();

  if (error || !tour) return c.json({ error: "Tour not found" }, 404);
  return c.json(tour);
});

// ©¤©¤©¤ Scenes ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

orgTourRoutes.get("/orgs/:orgId/tours/:tourId/scenes", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (!tour) return c.json({ error: "Tour not found" }, 404);

  const { data: scenes, error } = await supabase
    .from("scenes")
    .select("id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at")
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true });

  if (error) return c.json({ error: "Failed to fetch scenes" }, 500);
  return c.json(scenes ?? []);
});

const createSceneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

orgTourRoutes.post("/orgs/:orgId/tours/:tourId/scenes", async (c) => {
  const { orgId, tourId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = createSceneSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (!tour) return c.json({ error: "Tour not found" }, 404);

  // Check scene limit
  const limits = PLAN_LIMITS[auth.plan];
  if (limits.scenes_per_tour !== null) {
    const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).eq("tour_id", tourId);
    if ((count ?? 0) >= limits.scenes_per_tour) {
      return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "scenes_per_tour", upgrade_url: "/pricing" }, 403);
    }
  }

  const { data: scene, error } = await supabase
    .from("scenes").insert({ tour_id: tourId, ...parsed.data }).select().single();

  if (error || !scene) return c.json({ error: "Failed to create scene" }, 500);
  return c.json(scene, 201);
});

const position3dSchema = z.object({ x: z.number(), y: z.number(), z: z.number() });
const cameraPositionSchema = z.object({ position: position3dSchema, target: position3dSchema });

const updateSceneSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  default_camera_position: cameraPositionSchema.nullable().optional(),
}).strict();

orgTourRoutes.patch("/orgs/:orgId/tours/:tourId/scenes/:sceneId", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = updateSceneSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "No fields to update" }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (!tour) return c.json({ error: "Tour not found" }, 404);

  const { data: scene, error } = await supabase
    .from("scenes").update(parsed.data).eq("id", sceneId).eq("tour_id", tourId).select().single();

  if (error || !scene) return c.json({ error: "Scene not found or update failed" }, 404);
  return c.json(scene);
});

orgTourRoutes.delete("/orgs/:orgId/tours/:tourId/scenes/:sceneId", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (!tour) return c.json({ error: "Tour not found" }, 404);

  const { error } = await supabase.from("scenes").delete().eq("id", sceneId).eq("tour_id", tourId);
  if (error) return c.json({ error: "Failed to delete scene" }, 500);
  return c.json({ success: true });
});

// ©¤©¤©¤ Waypoints ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

orgTourRoutes.get("/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data, error } = await supabase
    .from("waypoints")
    .select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at")
    .eq("scene_id", sceneId);

  if (error) return c.json({ error: "Failed to fetch waypoints" }, 500);
  return c.json(data ?? []);
});

const createWaypointSchema = z.object({
  target_scene_id: z.string().uuid(),
  label: z.string().min(1).max(200),
  icon: z.string().max(50).nullable().optional(),
  position_3d: position3dSchema.optional(),
});

orgTourRoutes.post("/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = createWaypointSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const { data: waypoint, error } = await supabase
    .from("waypoints").insert({ scene_id: sceneId, ...parsed.data }).select().single();

  if (error || !waypoint) return c.json({ error: "Failed to create waypoint" }, 500);
  return c.json(waypoint, 201);
});

const updateWaypointSchema = z.object({
  target_scene_id: z.string().uuid().optional(),
  label: z.string().min(1).max(200).optional(),
  icon: z.string().max(50).nullable().optional(),
  position_3d: position3dSchema.optional(),
}).strict();

orgTourRoutes.patch("/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints/:waypointId", async (c) => {
  const { orgId, tourId, sceneId, waypointId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = updateWaypointSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "No fields to update" }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data: waypoint, error } = await supabase
    .from("waypoints").update(parsed.data).eq("id", waypointId).eq("scene_id", sceneId).select().single();

  if (error || !waypoint) return c.json({ error: "Waypoint not found or update failed" }, 404);
  return c.json(waypoint);
});

orgTourRoutes.delete("/orgs/:orgId/tours/:tourId/scenes/:sceneId/waypoints/:waypointId", async (c) => {
  const { orgId, tourId, sceneId, waypointId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { error } = await supabase.from("waypoints").delete().eq("id", waypointId).eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to delete waypoint" }, 500);
  return c.json({ success: true });
});

// ©¤©¤©¤ Hotspots ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

orgTourRoutes.get("/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "viewer");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { data, error } = await supabase
    .from("hotspots")
    .select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at")
    .eq("scene_id", sceneId);

  if (error) return c.json({ error: "Failed to fetch hotspots" }, 500);
  return c.json(data ?? []);
});

const createHotspotSchema = z.object({
  title: z.string().min(1).max(200),
  content_type: z.enum(["text", "image", "video", "audio", "link"]),
  content_markdown: z.string().max(10000).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  position_3d: position3dSchema.optional(),
});

orgTourRoutes.post("/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = createHotspotSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const { data: hotspot, error } = await supabase
    .from("hotspots").insert({ scene_id: sceneId, ...parsed.data }).select().single();

  if (error || !hotspot) return c.json({ error: "Failed to create hotspot" }, 500);
  return c.json(hotspot, 201);
});

const updateHotspotSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content_type: z.enum(["text", "image", "video", "audio", "link"]).optional(),
  content_markdown: z.string().max(10000).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  position_3d: position3dSchema.optional(),
}).strict();

orgTourRoutes.patch("/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots/:hotspotId", async (c) => {
  const { orgId, tourId, sceneId, hotspotId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = updateHotspotSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "No fields to update" }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const { data: hotspot, error } = await supabase
    .from("hotspots").update(parsed.data).eq("id", hotspotId).eq("scene_id", sceneId).select().single();

  if (error || !hotspot) return c.json({ error: "Hotspot not found or update failed" }, 404);
  return c.json(hotspot);
});

orgTourRoutes.delete("/orgs/:orgId/tours/:tourId/scenes/:sceneId/hotspots/:hotspotId", async (c) => {
  const { orgId, tourId, sceneId, hotspotId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "admin");
  if (auth instanceof Response) return auth;
  const supabase = getSupabaseForUser((c as any).get("token") as string);

  const { error } = await supabase.from("hotspots").delete().eq("id", hotspotId).eq("scene_id", sceneId);
  if (error) return c.json({ error: "Failed to delete hotspot" }, 500);
  return c.json({ success: true });
});

// ©¤©¤©¤ Upload ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

const UPLOAD_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const uploadRequestSchema = z.object({ format: z.enum(["ply", "splat", "spz"]) });

orgTourRoutes.post("/orgs/:orgId/tours/:tourId/scenes/:sceneId/upload", async (c) => {
  const { orgId, tourId, sceneId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "editor");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = uploadRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const format = parsed.data.format as SplatFileFormat;

  const { data: tour } = await supabase.from("tours").select("id").eq("id", tourId).eq("org_id", orgId).single();
  if (!tour) return c.json({ error: "Tour not found" }, 404);

  const { data: scene } = await supabase.from("scenes").select("id").eq("id", sceneId).eq("tour_id", tourId).single();
  if (!scene) return c.json({ error: "Scene not found" }, 404);

  const limits = PLAN_LIMITS[auth.plan];
  const { data: org } = await supabase.from("organizations").select("storage_used_bytes").eq("id", orgId).single();
  if (org && limits.storage_bytes !== null && org.storage_used_bytes >= limits.storage_bytes) {
    return c.json({ error: "PLAN_LIMIT_EXCEEDED", limit: "storage", upgrade_url: "/pricing" }, 403);
  }

  // Rate limit check
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { data: orgTours } = await supabase.from("tours").select("id").eq("org_id", orgId);
  if (orgTours && orgTours.length > 0) {
    const tourIds = orgTours.map((t: { id: string }) => t.id);
    const { count: recentUploads } = await supabase
      .from("scenes").select("id", { count: "exact", head: true })
      .in("tour_id", tourIds).not("splat_url", "is", null).gte("updated_at", oneHourAgo);
    if ((recentUploads ?? 0) >= UPLOAD_RATE_LIMIT) {
      return c.json({ error: "Rate limit exceeded. Maximum 10 uploads per hour per organization." }, 429);
    }
  }

  const serviceClient = createServiceClient();
  const storagePath = splatFilePath(orgId, tourId, sceneId, format);
  await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([storagePath]);

  const { data: signedUrl, error: signError } = await serviceClient.storage
    .from(STORAGE_BUCKETS.SPLAT_FILES).createSignedUploadUrl(storagePath);

  if (signError || !signedUrl) return c.json({ error: "Failed to create upload URL" }, 500);

  return c.json({ upload_url: signedUrl.signedUrl, token: signedUrl.token, path: signedUrl.path, format, expires_in: 900 });
});

// ©¤©¤©¤ Billing ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

const STRIPE_PRICE_IDS = () => {
  const env = getEnv();
  return { pro: env.STRIPE_PRO_PRICE_ID, enterprise: env.STRIPE_ENTERPRISE_PRICE_ID };
};

const createCheckoutSchema = z.object({ plan: z.enum(["pro", "enterprise"]) });

orgTourRoutes.post("/orgs/:orgId/billing", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "owner");
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);

  const { plan } = parsed.data;
  const priceId = STRIPE_PRICE_IDS()[plan];
  if (!priceId) return c.json({ error: "Invalid plan" }, 400);

  const env = getEnv();
  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const { data: org } = await supabase.from("organizations").select("name, stripe_customer_id").eq("id", orgId).single();

  const stripe = getStripe();
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/dashboard/settings?billing=success`,
    cancel_url: `${env.FRONTEND_URL}/dashboard/settings?billing=cancelled`,
    metadata: { org_id: orgId, plan },
    subscription_data: { metadata: { org_id: orgId, plan } },
  };

  if (org?.stripe_customer_id) sessionParams.customer = org.stripe_customer_id;

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return c.json({ url: session.url }, 201);
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return c.json({ error: "Failed to create checkout session" }, 500);
  }
});

orgTourRoutes.get("/orgs/:orgId/billing", async (c) => {
  const { orgId } = c.req.param();
  const auth = await requireOrgRole(c, orgId, "owner");
  if (auth instanceof Response) return auth;

  const supabase = getSupabaseForUser((c as any).get("token") as string);
  const env = getEnv();
  const { data: org } = await supabase.from("organizations").select("stripe_customer_id").eq("id", orgId).single();

  if (!org?.stripe_customer_id) {
    return c.json({ error: "No billing account found. Subscribe to a plan first." }, 404);
  }

  const stripe = getStripe();
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${env.FRONTEND_URL}/dashboard/settings`,
    });
    return c.json({ url: portalSession.url });
  } catch (err) {
    console.error("Stripe billing portal session creation failed:", err);
    return c.json({ error: "Failed to create billing portal session" }, 500);
  }
});

orgTourRoutes.get("/orgs/:orgId/billing/portal", async (c) => {
  return c.redirect(`/api/orgs/${c.req.param("orgId")}/billing`);
});

