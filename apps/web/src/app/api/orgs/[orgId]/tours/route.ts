import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole, slugify } from "@/lib/api-utils";
import { PLAN_LIMITS } from "@/lib/plan-limits";

/**
 * GET /api/orgs/[orgId]/tours — Returns paginated tours for the org.
 * Requires org membership (viewer+).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const auth = await requireOrgRole(orgId, "viewer");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );
  const offset = (page - 1) * limit;

  const { supabase } = auth;

  // Get total count
  const { count } = await supabase
    .from("tours")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  // Get paginated tours
  const { data: tours, error } = await supabase
    .from("tours")
    .select(
      "id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_by, created_at, updated_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch tours" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: tours,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
  });
}

const createTourSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  description: z
    .string()
    .max(2000, "Description must be at most 2000 characters")
    .nullable()
    .optional(),
  category: z
    .enum(["real_estate", "tourism", "museum", "education", "other"])
    .optional()
    .default("other"),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  location: z
    .string()
    .max(200, "Location must be at most 200 characters")
    .nullable()
    .optional(),
});

/**
 * POST /api/orgs/[orgId]/tours — Creates a new tour.
 * Requires org membership (editor+). Enforces plan limits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
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

  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { supabase, userId, plan } = auth;
  const limits = PLAN_LIMITS[plan];

  // Enforce plan limit on tour count
  if (limits.tours !== null) {
    const { count } = await supabase
      .from("tours")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    if ((count ?? 0) >= limits.tours) {
      return NextResponse.json(
        {
          error: "PLAN_LIMIT_EXCEEDED",
          limit: "tours",
          upgrade_url: "/pricing",
        },
        { status: 403 }
      );
    }
  }

  // Generate slug with sequential deduplication
  const baseSlug = slugify(parsed.data.title);
  let slug = baseSlug;
  let counter = 2;

  // Check for existing slugs and deduplicate
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: existing } = await supabase
      .from("tours")
      .select("id")
      .eq("slug", slug)
      .limit(1);

    if (!existing || existing.length === 0) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const { data: tour, error } = await supabase
    .from("tours")
    .insert({
      org_id: orgId,
      title: parsed.data.title,
      slug,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      tags: parsed.data.tags,
      location: parsed.data.location ?? null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    // Handle unique constraint violation (race condition on slug)
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Tour slug conflict, please try again" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create tour" },
      { status: 500 }
    );
  }

  return NextResponse.json(tour, { status: 201 });
}
