import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createServerClient } from "@cloudtour/db";
import { createHash } from "crypto";

/**
 * POST /api/tours/[slug]/view — Increments view_count for a published tour.
 * Public endpoint — no auth required.
 * Uses viewer_ip_hash for basic deduplication.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Slug is required" }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Verify tour exists and is published
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (tourError || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  // Hash the viewer IP for deduplication
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : "unknown";
  const viewerIpHash = createHash("sha256")
    .update(ip + tour.id)
    .digest("hex");

  // Use service client to insert tour_views (no user INSERT RLS policy)
  const serviceClient = createServiceClient();

  // Check for recent view from same IP (within last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentView } = await serviceClient
    .from("tour_views")
    .select("id")
    .eq("tour_id", tour.id)
    .eq("viewer_ip_hash", viewerIpHash)
    .gte("viewed_at", oneHourAgo)
    .limit(1)
    .maybeSingle();

  if (recentView) {
    return NextResponse.json({ success: true, deduplicated: true });
  }

  // Insert view record
  const { error: viewError } = await serviceClient
    .from("tour_views")
    .insert({
      tour_id: tour.id,
      viewer_ip_hash: viewerIpHash,
    });

  if (viewError) {
    console.error("[tour-view] insert error:", viewError);
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 }
    );
  }

  // Increment view_count atomically via raw SQL
  const { error: rpcError } = await serviceClient.rpc(
    "increment_view_count",
    { tour_id_input: tour.id }
  );

  if (rpcError) {
    // Non-critical — view was still recorded
    console.error("[tour-view] increment error:", rpcError);
  }

  return NextResponse.json({ success: true });
}
