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

const createWaypointSchema = z.object({
  target_scene_id: z.string().uuid("Invalid target scene ID"),
  label: z
    .string()
    .min(1, "Label is required")
    .max(200, "Label must be at most 200 characters"),
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
 * GET /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/waypoints
 * Returns waypoints for a scene. Requires org membership (viewer+).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const ownershipError = await verifySceneOwnership(supabase, orgId, tourId, sceneId);
  if (ownershipError) return ownershipError;

  const { data: waypoints, error } = await supabase
    .from("waypoints")
    .select("id, scene_id, target_scene_id, label, icon, position_3d, created_at, updated_at")
    .eq("scene_id", sceneId);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch waypoints" }, { status: 500 });
  }

  return NextResponse.json({ data: waypoints ?? [] });
}

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/waypoints
 * Creates a waypoint. Requires org membership (editor+).
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

  const parsed = createWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { supabase } = auth;

  const ownershipError = await verifySceneOwnership(supabase, orgId, tourId, sceneId);
  if (ownershipError) return ownershipError;

  // Verify target scene belongs to the same tour
  const { data: targetScene, error: targetError } = await supabase
    .from("scenes")
    .select("id")
    .eq("id", parsed.data.target_scene_id)
    .eq("tour_id", tourId)
    .single();

  if (targetError || !targetScene) {
    return NextResponse.json(
      { error: "Target scene not found in this tour" },
      { status: 400 },
    );
  }

  const { data: waypoint, error } = await supabase
    .from("waypoints")
    .insert({
      scene_id: sceneId,
      target_scene_id: parsed.data.target_scene_id,
      label: parsed.data.label,
      icon: parsed.data.icon ?? null,
      position_3d: parsed.data.position_3d,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create waypoint" }, { status: 500 });
  }

  return NextResponse.json(waypoint, { status: 201 });
}
