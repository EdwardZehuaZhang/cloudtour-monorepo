import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@cloudtour/db";

/**
 * GET /api/tours — Returns paginated, filterable published tours.
 * Public endpoint — no auth required.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );
  const offset = (page - 1) * limit;

  // Filters
  const category = searchParams.get("category");
  const location = searchParams.get("location");
  const tags = searchParams.get("tags"); // comma-separated
  const search = searchParams.get("search");
  const sort = searchParams.get("sort") ?? "newest";

  const validCategories = [
    "real_estate",
    "tourism",
    "museum",
    "education",
    "other",
  ];
  const validSorts = ["newest", "popular", "alphabetical"];

  const supabase = await createServerClient();

  // Build count query
  let countQuery = supabase
    .from("tours")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  // Build data query
  let dataQuery = supabase
    .from("tours")
    .select(
      "id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_at"
    )
    .eq("status", "published");

  // Apply category filter
  if (category && validCategories.includes(category)) {
    const cat = category as "real_estate" | "tourism" | "museum" | "education" | "other";
    countQuery = countQuery.eq("category", cat);
    dataQuery = dataQuery.eq("category", cat);
  }

  // Apply location filter (case-insensitive partial match)
  if (location) {
    countQuery = countQuery.ilike("location", `%${location}%`);
    dataQuery = dataQuery.ilike("location", `%${location}%`);
  }

  // Apply tags filter (any of the provided tags)
  if (tags) {
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length > 0) {
      countQuery = countQuery.overlaps("tags", tagList);
      dataQuery = dataQuery.overlaps("tags", tagList);
    }
  }

  // Apply full-text search on title and description
  if (search) {
    const searchFilter = `title.ilike.%${search}%,description.ilike.%${search}%`;
    countQuery = countQuery.or(searchFilter);
    dataQuery = dataQuery.or(searchFilter);
  }

  // Apply sorting
  if (sort === "popular" && validSorts.includes(sort)) {
    dataQuery = dataQuery.order("view_count", { ascending: false });
  } else if (sort === "alphabetical" && validSorts.includes(sort)) {
    dataQuery = dataQuery.order("title", { ascending: true });
  } else {
    dataQuery = dataQuery.order("created_at", { ascending: false });
  }

  // Execute queries
  const { count } = await countQuery;

  const { data: tours, error } = await dataQuery.range(
    offset,
    offset + limit - 1
  );

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch tours" },
      { status: 500 }
    );
  }

  // Fetch scene counts and first thumbnails for the returned tours
  const tourIds = (tours ?? []).map((t) => t.id);
  const scenesMap: Record<
    string,
    { count: number; thumbnail_url: string | null }
  > = {};

  if (tourIds.length > 0) {
    const { data: scenes } = await supabase
      .from("scenes")
      .select("tour_id, thumbnail_url, sort_order")
      .in("tour_id", tourIds)
      .order("sort_order", { ascending: true });

    if (scenes) {
      for (const scene of scenes) {
        const existing = scenesMap[scene.tour_id];
        if (!existing) {
          scenesMap[scene.tour_id] = {
            count: 1,
            thumbnail_url: scene.thumbnail_url,
          };
        } else {
          existing.count++;
        }
      }
    }
  }

  const toursWithScenes = (tours ?? []).map((t) => ({
    ...t,
    scene_count: scenesMap[t.id]?.count ?? 0,
    first_scene_thumbnail_url: scenesMap[t.id]?.thumbnail_url ?? null,
  }));

  return NextResponse.json({
    data: toursWithScenes,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
  });
}
