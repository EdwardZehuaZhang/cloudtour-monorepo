import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string; sceneId: string }>;
};

const position3dSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const createHotspotSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  content_type: z
    .enum(["text", "image", "video", "audio", "link"])
    .default("text"),
  content_markdown: z.string().max(10000).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  position_3d: position3dSchema,
});

/**
 * Verify the scene belongs to the tour and the tour belongs to the org.
 */
async function verifySceneOwnership(
  supabase: Awaited<ReturnType<typeof import("@cloudtour/db").createServerClient>>,
  orgId: string,
  tourId: string,
  sceneId: string,
): Promise<NextResponse | null> {
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id")
    .eq("id", tourId)
    .eq("org_id", orgId)
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id")
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  return null;
}

/**
 * GET /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/hotspots
 * Returns hotspots for a scene. Requires org membership (viewer+).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const ownershipError = await verifySceneOwnership(supabase, orgId, tourId, sceneId);
  if (ownershipError) return ownershipError;

  const { data: hotspots, error } = await supabase
    .from("hotspots")
    .select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d, created_at, updated_at")
    .eq("scene_id", sceneId);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch hotspots" }, { status: 500 });
  }

  return NextResponse.json({ data: hotspots ?? [] });
}

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/hotspots
 * Creates a hotspot. Requires org membership (editor+).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createHotspotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { supabase } = auth;

  const ownershipError = await verifySceneOwnership(supabase, orgId, tourId, sceneId);
  if (ownershipError) return ownershipError;

  const { data: hotspot, error } = await supabase
    .from("hotspots")
    .insert({
      scene_id: sceneId,
      title: parsed.data.title,
      content_type: parsed.data.content_type,
      content_markdown: parsed.data.content_markdown ?? null,
      media_url: parsed.data.media_url ?? null,
      icon: parsed.data.icon ?? null,
      position_3d: parsed.data.position_3d,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create hotspot" }, { status: 500 });
  }

  return NextResponse.json(hotspot, { status: 201 });
}
