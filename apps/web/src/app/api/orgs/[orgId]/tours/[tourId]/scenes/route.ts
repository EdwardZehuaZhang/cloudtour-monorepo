import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";
import { PLAN_LIMITS } from "@/lib/plan-limits";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string }>;
};

/**
 * GET /api/orgs/[orgId]/tours/[tourId]/scenes — Returns scenes ordered by sort_order.
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

  const { data: scenes, error } = await supabase
    .from("scenes")
    .select(
      "id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at"
    )
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch scenes" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: scenes ?? [] });
}

const position3dSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const cameraPositionSchema = z.object({
  position: position3dSchema,
  target: position3dSchema,
});

const createSceneSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  description: z
    .string()
    .max(2000, "Description must be at most 2000 characters")
    .nullable()
    .optional(),
  default_camera_position: cameraPositionSchema.nullable().optional(),
});

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes — Creates a new scene.
 * Requires org membership (editor+). Enforces plan limits on scenes per tour.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
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

  const parsed = createSceneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { supabase, plan } = auth;

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

  const limits = PLAN_LIMITS[plan];

  // Enforce plan limit on scenes per tour
  if (limits.scenes_per_tour !== null) {
    const { count } = await supabase
      .from("scenes")
      .select("id", { count: "exact", head: true })
      .eq("tour_id", tourId);

    if ((count ?? 0) >= limits.scenes_per_tour) {
      return NextResponse.json(
        {
          error: "PLAN_LIMIT_EXCEEDED",
          limit: "scenes_per_tour",
          upgrade_url: "/pricing",
        },
        { status: 403 }
      );
    }
  }

  // Determine next sort_order
  const { data: lastScene } = await supabase
    .from("scenes")
    .select("sort_order")
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = lastScene ? lastScene.sort_order + 1 : 0;

  const { data: scene, error } = await supabase
    .from("scenes")
    .insert({
      tour_id: tourId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sort_order: nextSortOrder,
      default_camera_position: parsed.data.default_camera_position ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create scene" },
      { status: 500 }
    );
  }

  return NextResponse.json(scene, { status: 201 });
}
