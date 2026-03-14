import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string }>;
};

const updateScenePositionsSchema = z.object({
  scene_positions: z.array(
    z.object({
      scene_id: z.string().uuid(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
  ),
});

/**
 * GET /api/orgs/[orgId]/tours/[tourId]/floor-plan
 * Returns the floor plan for a tour (if any).
 * Requires org membership (viewer+).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
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

  const { data: floorPlan, error } = await supabase
    .from("floor_plans")
    .select("*")
    .eq("tour_id", tourId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch floor plan" }, { status: 500 });
  }

  return NextResponse.json({ data: floorPlan });
}

/**
 * PATCH /api/orgs/[orgId]/tours/[tourId]/floor-plan
 * Updates scene_positions on the floor plan.
 * Requires org membership (editor+).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
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

  const body = await request.json();
  const parsed = updateScenePositionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: floorPlan, error } = await supabase
    .from("floor_plans")
    .update({ scene_positions: parsed.data.scene_positions })
    .eq("tour_id", tourId)
    .select()
    .single();

  if (error || !floorPlan) {
    return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });
  }

  return NextResponse.json({ data: floorPlan });
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId]/floor-plan
 * Deletes the floor plan and its image from storage.
 * Requires org membership (admin+).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
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
    .from("floor_plans")
    .delete()
    .eq("tour_id", tourId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete floor plan" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
