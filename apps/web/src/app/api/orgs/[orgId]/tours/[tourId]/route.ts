import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ orgId: string; tourId: string }> };

/**
 * GET /api/orgs/[orgId]/tours/[tourId] — Returns tour detail with scenes.
 * Requires org membership (viewer+).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const { data: tour, error } = await supabase
    .from("tours")
    .select(
      "id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at"
    )
    .eq("id", tourId)
    .eq("org_id", orgId)
    .single();

  if (error || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  // Fetch scenes for this tour
  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position, created_at, updated_at"
    )
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ ...tour, scenes: scenes ?? [] });
}

const updateTourSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .max(200, "Title must be at most 200 characters")
      .optional(),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(200, "Slug must be at most 200 characters")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
      .optional(),
    description: z
      .string()
      .max(2000, "Description must be at most 2000 characters")
      .nullable()
      .optional(),
    category: z
      .enum(["real_estate", "tourism", "museum", "education", "other"])
      .optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    location: z
      .string()
      .max(200, "Location must be at most 200 characters")
      .nullable()
      .optional(),
    cover_image_url: z.string().url("Invalid URL").nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/orgs/[orgId]/tours/[tourId] — Updates tour fields.
 * Requires org membership (editor+).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const parsed = updateTourSchema.safeParse(body);
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

  // If slug is being updated, check for uniqueness
  if (updates.slug) {
    const { data: existing } = await supabase
      .from("tours")
      .select("id")
      .eq("slug", updates.slug)
      .neq("id", tourId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Slug already in use", field: "slug" },
        { status: 409 }
      );
    }
  }

  const { data: tour, error } = await supabase
    .from("tours")
    .update(updates)
    .eq("id", tourId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error || !tour) {
    return NextResponse.json(
      { error: "Tour not found or update failed" },
      { status: 404 }
    );
  }

  return NextResponse.json(tour);
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId] — Deletes a tour.
 * Requires org membership (admin+).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId } = await params;
  const auth = await requireOrgRole(orgId, "admin");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const { error } = await supabase
    .from("tours")
    .delete()
    .eq("id", tourId)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete tour" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
