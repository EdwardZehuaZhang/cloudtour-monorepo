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

const cameraPositionSchema = z.object({
  position: position3dSchema,
  target: position3dSchema,
});

const updateSceneSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be at most 200 characters")
      .optional(),
    description: z
      .string()
      .max(2000, "Description must be at most 2000 characters")
      .nullable()
      .optional(),
    sort_order: z.number().int().min(0).optional(),
    default_camera_position: cameraPositionSchema.nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId] — Updates scene fields.
 * Requires org membership (editor+).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = updateSceneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
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

  const { data: scene, error } = await supabase
    .from("scenes")
    .update(updates)
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .select()
    .single();

  if (error || !scene) {
    return NextResponse.json(
      { error: "Scene not found or update failed" },
      { status: 404 }
    );
  }

  return NextResponse.json(scene);
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId] — Deletes a scene.
 * Requires org membership (admin+).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
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
    .from("scenes")
    .delete()
    .eq("id", sceneId)
    .eq("tour_id", tourId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete scene" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
