import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";

type RouteParams = {
  params: Promise<{
    orgId: string;
    tourId: string;
    sceneId: string;
    hotspotId: string;
  }>;
};

const position3dSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const updateHotspotSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be at most 200 characters")
      .optional(),
    content_type: z
      .enum(["text", "image", "video", "audio", "link"])
      .optional(),
    content_markdown: z.string().max(10000).nullable().optional(),
    media_url: z.string().url().nullable().optional(),
    icon: z.string().max(50).nullable().optional(),
    position_3d: position3dSchema.optional(),
  })
  .strict();

/**
 * PATCH /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/hotspots/[hotspotId]
 * Updates a hotspot. Requires org membership (editor+).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId, hotspotId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateHotspotSchema.safeParse(body);
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

  const { data: hotspot, error } = await supabase
    .from("hotspots")
    .update(updates)
    .eq("id", hotspotId)
    .eq("scene_id", sceneId)
    .select()
    .single();

  if (error || !hotspot) {
    return NextResponse.json(
      { error: "Hotspot not found or update failed" },
      { status: 404 },
    );
  }

  return NextResponse.json(hotspot);
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/hotspots/[hotspotId]
 * Deletes a hotspot. Requires org membership (admin+).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId, hotspotId } = await params;
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
    .from("hotspots")
    .delete()
    .eq("id", hotspotId)
    .eq("scene_id", sceneId);

  if (error) {
    return NextResponse.json({ error: "Failed to delete hotspot" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
