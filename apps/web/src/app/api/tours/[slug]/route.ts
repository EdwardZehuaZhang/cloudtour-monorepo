import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@cloudtour/db";

/**
 * GET /api/tours/[slug] — Returns a published tour with its scenes, waypoints, and hotspots.
 * Public endpoint — no auth required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Fetch the published tour by slug
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select(
      "id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at"
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  // Fetch scenes ordered by sort_order
  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at"
    )
    .eq("tour_id", tour.id)
    .order("sort_order", { ascending: true });

  const sceneIds = (scenes ?? []).map((s) => s.id);

  // Fetch waypoints and hotspots for all scenes in parallel
  type WaypointRow = { id: string; scene_id: string; target_scene_id: string; label: string; icon: string | null; position_3d: unknown; created_at: string; updated_at: string };
  type HotspotRow = { id: string; scene_id: string; title: string; content_type: string; content_markdown: string | null; media_url: string | null; icon: string | null; position_3d: unknown; created_at: string; updated_at: string };

  let waypointRows: WaypointRow[] = [];
  let hotspotRows: HotspotRow[] = [];

  if (sceneIds.length > 0) {
    const [wpResult, hsResult] = await Promise.all([
      supabase
        .from("waypoints")
        .select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at")
        .in("scene_id", sceneIds),
      supabase
        .from("hotspots")
        .select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at")
        .in("scene_id", sceneIds),
    ]);
    waypointRows = (wpResult.data ?? []) as WaypointRow[];
    hotspotRows = (hsResult.data ?? []) as HotspotRow[];
  }

  // Group waypoints and hotspots by scene_id
  const waypointsByScene: Record<string, WaypointRow[]> = {};
  const hotspotsByScene: Record<string, HotspotRow[]> = {};

  for (const wp of waypointRows) {
    if (!waypointsByScene[wp.scene_id]) waypointsByScene[wp.scene_id] = [];
    waypointsByScene[wp.scene_id]!.push(wp);
  }

  for (const hs of hotspotRows) {
    if (!hotspotsByScene[hs.scene_id]) hotspotsByScene[hs.scene_id] = [];
    hotspotsByScene[hs.scene_id]!.push(hs);
  }

  const scenesWithMarkers = (scenes ?? []).map((scene) => ({
    ...scene,
    waypoints: waypointsByScene[scene.id] ?? [],
    hotspots: hotspotsByScene[scene.id] ?? [],
  }));

  // Fetch organization name for display
  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug")
    .eq("id", tour.org_id)
    .single();

  return NextResponse.json({
    ...tour,
    scenes: scenesWithMarkers,
    organization: org ? { name: org.name, slug: org.slug } : null,
  });
}
