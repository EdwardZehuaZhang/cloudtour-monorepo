import { Hono } from "hono";
import { createServiceClient } from "../auth.js";
import { createHash } from "crypto";

export const publicTourRoutes = new Hono();

/**
 * GET /api/tours ！ Returns paginated, filterable published tours.
 * Public endpoint ！ no auth required.
 */
publicTourRoutes.get("/tours", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20") || 20));
  const offset = (page - 1) * limit;

  const category = c.req.query("category");
  const location = c.req.query("location");
  const tags = c.req.query("tags");
  const search = c.req.query("search");
  const sort = c.req.query("sort") ?? "newest";

  const validCategories = ["real_estate", "tourism", "museum", "education", "other"];
  const validSorts = ["newest", "popular", "alphabetical"];

  const supabase = createServiceClient();

  let countQuery = supabase.from("tours").select("id", { count: "exact", head: true }).eq("status", "published");
  let dataQuery = supabase.from("tours")
    .select("id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_at")
    .eq("status", "published");

  if (category && validCategories.includes(category)) {
    countQuery = countQuery.eq("category", category as "real_estate" | "tourism" | "museum" | "education" | "other");
    dataQuery = dataQuery.eq("category", category as "real_estate" | "tourism" | "museum" | "education" | "other");
  }
  if (location) {
    countQuery = countQuery.ilike("location", `%${location}%`);
    dataQuery = dataQuery.ilike("location", `%${location}%`);
  }
  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      countQuery = countQuery.overlaps("tags", tagList);
      dataQuery = dataQuery.overlaps("tags", tagList);
    }
  }
  if (search) {
    const searchFilter = `title.ilike.%${search}%,description.ilike.%${search}%`;
    countQuery = countQuery.or(searchFilter);
    dataQuery = dataQuery.or(searchFilter);
  }

  if (sort === "popular" && validSorts.includes(sort)) {
    dataQuery = dataQuery.order("view_count", { ascending: false });
  } else if (sort === "alphabetical" && validSorts.includes(sort)) {
    dataQuery = dataQuery.order("title", { ascending: true });
  } else {
    dataQuery = dataQuery.order("created_at", { ascending: false });
  }

  const { count } = await countQuery;
  const { data: tours, error } = await dataQuery.range(offset, offset + limit - 1);
  if (error) return c.json({ error: "Failed to fetch tours" }, 500);

  const tourIds = (tours ?? []).map((t: { id: string }) => t.id);
  const scenesMap: Record<string, { count: number; thumbnail_url: string | null }> = {};

  if (tourIds.length > 0) {
    const { data: scenes } = await supabase
      .from("scenes").select("tour_id, thumbnail_url, sort_order")
      .in("tour_id", tourIds).order("sort_order", { ascending: true });

    if (scenes) {
      for (const scene of scenes) {
        const existing = scenesMap[scene.tour_id];
        if (!existing) scenesMap[scene.tour_id] = { count: 1, thumbnail_url: scene.thumbnail_url };
        else existing.count++;
      }
    }
  }

  const toursWithScenes = (tours ?? []).map((t: { id: string }) => ({
    ...t,
    scene_count: scenesMap[t.id]?.count ?? 0,
    first_scene_thumbnail_url: scenesMap[t.id]?.thumbnail_url ?? null,
  }));

  return c.json({
    data: toursWithScenes,
    pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  });
});

/**
 * GET /api/tours/:slug ！ Returns a published tour with scenes, waypoints, and hotspots.
 * Public endpoint ！ no auth required.
 */
publicTourRoutes.get("/tours/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "Slug is required" }, 400);

  const supabase = createServiceClient();

  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at")
    .eq("slug", slug).eq("status", "published").single();

  if (tourError || !tour) return c.json({ error: "Tour not found" }, 404);

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at")
    .eq("tour_id", tour.id).order("sort_order", { ascending: true });

  const sceneIds = (scenes ?? []).map((s: { id: string }) => s.id);
  let waypointRows: unknown[] = [];
  let hotspotRows: unknown[] = [];

  if (sceneIds.length > 0) {
    const [wpResult, hsResult] = await Promise.all([
      supabase.from("waypoints").select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at").in("scene_id", sceneIds),
      supabase.from("hotspots").select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at").in("scene_id", sceneIds),
    ]);
    waypointRows = wpResult.data ?? [];
    hotspotRows = hsResult.data ?? [];
  }

  const waypointsByScene: Record<string, unknown[]> = {};
  const hotspotsByScene: Record<string, unknown[]> = {};
  for (const wp of waypointRows as { scene_id: string }[]) {
    if (!waypointsByScene[wp.scene_id]) waypointsByScene[wp.scene_id] = [];
    waypointsByScene[wp.scene_id]!.push(wp);
  }
  for (const hs of hotspotRows as { scene_id: string }[]) {
    if (!hotspotsByScene[hs.scene_id]) hotspotsByScene[hs.scene_id] = [];
    hotspotsByScene[hs.scene_id]!.push(hs);
  }

  const scenesWithMarkers = (scenes ?? []).map((scene: { id: string }) => ({
    ...scene,
    waypoints: waypointsByScene[scene.id] ?? [],
    hotspots: hotspotsByScene[scene.id] ?? [],
  }));

  const { data: org } = await supabase.from("organizations").select("name, slug").eq("id", tour.org_id).single();

  return c.json({ ...tour, scenes: scenesWithMarkers, organization: org ? { name: org.name, slug: org.slug } : null });
});

/**
 * POST /api/tours/:slug/view ！ Increment view count (deduped by IP).
 * Public endpoint ！ no auth required.
 */
publicTourRoutes.post("/tours/:slug/view", async (c) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ error: "Slug is required" }, 400);

  const supabase = createServiceClient();

  const { data: tour, error: tourError } = await supabase
    .from("tours").select("id").eq("slug", slug).eq("status", "published").single();

  if (tourError || !tour) return c.json({ error: "Tour not found" }, 404);

  const forwarded = c.req.header("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "unknown";
  const viewerIpHash = createHash("sha256").update(ip + tour.id).digest("hex");

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentView } = await supabase
    .from("tour_views").select("id")
    .eq("tour_id", tour.id).eq("viewer_ip_hash", viewerIpHash).gte("viewed_at", oneHourAgo).limit(1).maybeSingle();

  if (recentView) return c.json({ success: true, deduplicated: true });

  const { error: viewError } = await supabase.from("tour_views").insert({ tour_id: tour.id, viewer_ip_hash: viewerIpHash });
  if (viewError) return c.json({ error: "Failed to record view" }, 500);

  try { await supabase.rpc("increment_view_count", { tour_id_input: tour.id }); } catch {}
  return c.json({ success: true });
});


