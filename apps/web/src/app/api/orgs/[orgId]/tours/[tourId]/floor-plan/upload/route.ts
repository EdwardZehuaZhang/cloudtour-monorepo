import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";
import { createServiceClient } from "@cloudtour/db";
import { STORAGE_BUCKETS, assetPath } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string }>;
};

const PRESIGNED_URL_EXPIRY = 15 * 60; // 15 minutes

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/floor-plan/upload
 * Returns a presigned upload URL for the floor plan image.
 * Requires org membership (editor+).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  const serviceClient = createServiceClient();
  const storagePath = assetPath(orgId, "floor-plans", `${tourId}.webp`);

  // Remove any existing floor plan image
  await serviceClient.storage.from(STORAGE_BUCKETS.ASSETS).remove([storagePath]);

  const { data: signedUrl, error: signError } = await serviceClient.storage
    .from(STORAGE_BUCKETS.ASSETS)
    .createSignedUploadUrl(storagePath);

  if (signError || !signedUrl) {
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    upload_url: signedUrl.signedUrl,
    token: signedUrl.token,
    path: signedUrl.path,
    expires_in: PRESIGNED_URL_EXPIRY,
  });
}

/**
 * PUT /api/orgs/[orgId]/tours/[tourId]/floor-plan/upload
 * Confirms the floor plan upload, creates/updates the floor_plans record.
 * Requires org membership (editor+).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

  const serviceClient = createServiceClient();
  const storagePath = assetPath(orgId, "floor-plans", `${tourId}.webp`);

  // Verify the file exists
  const { data: files } = await serviceClient.storage
    .from(STORAGE_BUCKETS.ASSETS)
    .list(`${orgId}/floor-plans`, { search: `${tourId}.webp` });

  const uploaded = files?.find((f) => f.name === `${tourId}.webp`);
  if (!uploaded) {
    return NextResponse.json(
      { error: "No uploaded file found. Please upload the file first." },
      { status: 404 }
    );
  }

  // Get a long-lived signed URL for the private assets bucket
  const { data: signedData, error: signedError } = await serviceClient.storage
    .from(STORAGE_BUCKETS.ASSETS)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10); // 10 years

  if (signedError || !signedData) {
    return NextResponse.json(
      { error: "Failed to generate image URL" },
      { status: 500 }
    );
  }

  const imageUrl = signedData.signedUrl;

  // Check if a floor plan already exists for this tour
  const { data: existing } = await supabase
    .from("floor_plans")
    .select("id")
    .eq("tour_id", tourId)
    .maybeSingle();

  let floorPlan;
  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from("floor_plans")
      .update({ image_url: imageUrl })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: "Failed to update floor plan" }, { status: 500 });
    }
    floorPlan = data;
  } else {
    // Create new
    const { data, error } = await supabase
      .from("floor_plans")
      .insert({ tour_id: tourId, image_url: imageUrl })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: "Failed to create floor plan" }, { status: 500 });
    }
    floorPlan = data;
  }

  return NextResponse.json({ data: floorPlan });
}
