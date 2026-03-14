import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";

type RouteParams = {
  params: Promise<{
    orgId: string;
    tourId: string;
    sceneId: string;
    waypointId: string;
  }>;
};

const position3dSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const updateWaypointSchema = z
  .object({
    target_scene_id: z.string().uuid("Invalid target scene ID").optional(),
    label: z
      .string()
      .min(1, "Label is required")
      .max(200, "Label must be at most 200 characters")
      .optional(),
    icon: z.string().max(50).nullable().optional(),
    position_3d: position3dSchema.optional(),
  })
  .strict();

/**
 * PATCH /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/waypoints/[waypointId]
 * Updates a waypoint. Requires org membership (editor+).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId, waypointId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateWaypointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { supabase } = auth;

  // Verify tour belongs to org
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id")
    .eq("id", tourId)
    .eq("org_id", orgId)
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  // If updating target_scene_id, verify it belongs to the same tour
  if (updates.target_scene_id) {
    const { data: targetScene, error: targetError } = await supabase
      .from("scenes")
      .select("id")
      .eq("id", updates.target_scene_id)
      .eq("tour_id", tourId)
      .single();

    if (targetError || !targetScene) {
      return NextResponse.json(
        { error: "Target scene not found in this tour" },
        { status: 400 },
      );
    }
  }

  const { data: waypoint, error } = await supabase
    .from("waypoints")
    .update(updates)
    .eq("id", waypointId)
    .eq("scene_id", sceneId)
    .select()
    .single();

  if (error || !waypoint) {
    return NextResponse.json(
      { error: "Waypoint not found or update failed" },
      { status: 404 },
    );
  }

  return NextResponse.json(waypoint);
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/waypoints/[waypointId]
 * Deletes a waypoint. Requires org membership (admin+).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId, waypointId } = await params;
  const auth = await requireOrgRole(orgId, "admin");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  // Verify tour belongs to org
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id")
    .eq("id", tourId)
    .eq("org_id", orgId)
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("waypoints")
    .delete()
    .eq("id", waypointId)
    .eq("scene_id", sceneId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete waypoint" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
