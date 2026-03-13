import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";
import { createServiceClient } from "@cloudtour/db";
import { STORAGE_BUCKETS, thumbnailPath } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string; sceneId: string }>;
};

const PRESIGNED_URL_EXPIRY = 15 * 60; // 15 minutes in seconds

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/thumbnail
 * Returns a presigned upload URL for uploading a thumbnail image.
 * After upload, confirms and saves the public URL to scenes.thumbnail_url.
 * Requires org membership (editor+).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
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

  // Verify scene belongs to tour
  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id")
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const serviceClient = createServiceClient();
  const storagePath = thumbnailPath(orgId, tourId, sceneId);

  // Remove any existing thumbnail at this path
  await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).remove([storagePath]);

  const { data: signedUrl, error: signError } = await serviceClient.storage
    .from(STORAGE_BUCKETS.THUMBNAILS)
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
 * PUT /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/thumbnail
 * Confirms the thumbnail upload and saves the public URL to scenes.thumbnail_url.
 * Called after the client has uploaded the file via the presigned URL.
 * Requires org membership (editor+).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
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

  // Verify scene belongs to tour
  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id")
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const serviceClient = createServiceClient();
  const storagePath = thumbnailPath(orgId, tourId, sceneId);

  // Verify the file exists in storage
  const { data: files } = await serviceClient.storage
    .from(STORAGE_BUCKETS.THUMBNAILS)
    .list(`${orgId}/${tourId}/${sceneId}`, { search: "thumbnail.webp" });

  const uploaded = files?.find((f) => f.name === "thumbnail.webp");
  if (!uploaded) {
    return NextResponse.json(
      { error: "No uploaded thumbnail found. Please upload the file first." },
      { status: 404 }
    );
  }

  // Thumbnails bucket is public CDN — get the public URL
  const { data: urlData } = serviceClient.storage
    .from(STORAGE_BUCKETS.THUMBNAILS)
    .getPublicUrl(storagePath);

  const thumbnailUrl = urlData.publicUrl;

  // Update scene with thumbnail URL
  const { data: updatedScene, error: updateError } = await supabase
    .from("scenes")
    .update({ thumbnail_url: thumbnailUrl })
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .select()
    .single();

  if (updateError || !updatedScene) {
    return NextResponse.json(
      { error: "Failed to update scene" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    scene: updatedScene,
    thumbnail_url: thumbnailUrl,
  });
}

/**
 * DELETE /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/thumbnail
 * Removes the thumbnail from storage and clears scenes.thumbnail_url.
 * Requires org membership (editor+).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
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

  // Verify scene belongs to tour
  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id, thumbnail_url")
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const serviceClient = createServiceClient();
  const storagePath = thumbnailPath(orgId, tourId, sceneId);

  // Remove from storage
  await serviceClient.storage.from(STORAGE_BUCKETS.THUMBNAILS).remove([storagePath]);

  // Clear thumbnail_url on scene
  const { data: updatedScene, error: updateError } = await supabase
    .from("scenes")
    .update({ thumbnail_url: null })
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .select()
    .single();

  if (updateError || !updatedScene) {
    return NextResponse.json(
      { error: "Failed to update scene" },
      { status: 500 }
    );
  }

  return NextResponse.json({ scene: updatedScene });
}
