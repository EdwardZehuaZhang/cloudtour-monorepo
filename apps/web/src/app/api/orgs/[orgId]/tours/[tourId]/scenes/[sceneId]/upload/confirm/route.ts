import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";
import { createServiceClient } from "@cloudtour/db";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import type { SplatFileFormat } from "@cloudtour/types";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string; sceneId: string }>;
};

const UPLOAD_BUCKET = "splat-files";

/**
 * Detect splat file format from magic bytes.
 * - PLY: starts with "ply\n" (0x70 0x6C 0x79 0x0A)
 * - SPZ: compressed gaussian splat, starts with "SPZ" (0x53 0x50 0x5A)
 * - splat: raw gaussian data (no magic bytes — fallback)
 */
function detectSplatFormat(header: Uint8Array): SplatFileFormat {
  // PLY: "ply\n"
  if (
    header.length >= 4 &&
    header[0] === 0x70 &&
    header[1] === 0x6c &&
    header[2] === 0x79 &&
    header[3] === 0x0a
  ) {
    return "ply";
  }

  // SPZ: "SPZ" header
  if (
    header.length >= 3 &&
    header[0] === 0x53 &&
    header[1] === 0x50 &&
    header[2] === 0x5a
  ) {
    return "spz";
  }

  // Default: raw .splat format (no standard magic bytes)
  return "splat";
}

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/upload/confirm
 * Validates the uploaded splat file via magic bytes, updates the scene record,
 * and tracks storage usage on the organization.
 * Requires org membership (editor+).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgId, tourId, sceneId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

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

  // Verify scene belongs to tour
  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id, splat_url")
    .eq("id", sceneId)
    .eq("tour_id", tourId)
    .single();

  if (sceneError || !scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const serviceClient = createServiceClient();

  // Find the uploaded file — check all possible extensions
  const basePath = `${orgId}/${tourId}/${sceneId}`;
  const possibleExtensions: SplatFileFormat[] = ["ply", "splat", "spz"];
  let uploadedPath: string | null = null;
  let fileSize = 0;

  for (const ext of possibleExtensions) {
    const filePath = `${basePath}/scene.${ext}`;
    const { data: files } = await serviceClient.storage
      .from(UPLOAD_BUCKET)
      .list(basePath, { search: `scene.${ext}` });

    if (files && files.length > 0) {
      const file = files.find((f) => f.name === `scene.${ext}`);
      if (file) {
        uploadedPath = filePath;
        fileSize = file.metadata?.size ?? 0;
        break;
      }
    }
  }

  if (!uploadedPath) {
    return NextResponse.json(
      { error: "No uploaded file found. Please upload the file first." },
      { status: 404 }
    );
  }

  // Check storage plan limit with the new file
  const limits = PLAN_LIMITS[plan];
  const { data: org } = await supabase
    .from("organizations")
    .select("storage_used_bytes")
    .eq("id", orgId)
    .single();

  if (org && limits.storage_bytes !== null) {
    const newTotal = org.storage_used_bytes + fileSize;
    if (newTotal > limits.storage_bytes) {
      // Remove the uploaded file since it exceeds the limit
      await serviceClient.storage.from(UPLOAD_BUCKET).remove([uploadedPath]);
      return NextResponse.json(
        {
          error: "PLAN_LIMIT_EXCEEDED",
          limit: "storage",
          upgrade_url: "/pricing",
        },
        { status: 403 }
      );
    }
  }

  // Download first 16 bytes for magic byte validation
  const { data: fileData, error: downloadError } = await serviceClient.storage
    .from(UPLOAD_BUCKET)
    .download(uploadedPath);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: "Failed to read uploaded file for validation" },
      { status: 500 }
    );
  }

  const headerBytes = new Uint8Array(await fileData.slice(0, 16).arrayBuffer());
  const detectedFormat = detectSplatFormat(headerBytes);

  // Determine the correct storage path based on detected format
  const correctPath = `${basePath}/scene.${detectedFormat}`;

  // If the detected format differs from the uploaded path, move the file
  if (uploadedPath !== correctPath) {
    // Copy to correct path
    const { error: copyError } = await serviceClient.storage
      .from(UPLOAD_BUCKET)
      .copy(uploadedPath, correctPath);

    if (copyError) {
      return NextResponse.json(
        { error: "Failed to process uploaded file" },
        { status: 500 }
      );
    }

    // Remove old path
    await serviceClient.storage.from(UPLOAD_BUCKET).remove([uploadedPath]);
  }

  // Get the public/signed URL for the stored file
  const { data: urlData } = await serviceClient.storage
    .from(UPLOAD_BUCKET)
    .createSignedUrl(correctPath, 60 * 60 * 24 * 365); // 1 year signed URL

  const splatUrl = urlData?.signedUrl ?? correctPath;

  // If scene already had a splat file, subtract old file size from storage tracking
  let oldFileSize = 0;
  if (scene.splat_url) {
    // Try to determine old file size from storage
    for (const ext of possibleExtensions) {
      const oldPath = `${basePath}/scene.${ext}`;
      if (oldPath === correctPath) continue;
      const { data: oldFiles } = await serviceClient.storage
        .from(UPLOAD_BUCKET)
        .list(basePath, { search: `scene.${ext}` });
      if (oldFiles) {
        const oldFile = oldFiles.find((f) => f.name === `scene.${ext}`);
        if (oldFile) {
          oldFileSize = oldFile.metadata?.size ?? 0;
          // Clean up old file
          await serviceClient.storage.from(UPLOAD_BUCKET).remove([oldPath]);
          break;
        }
      }
    }
  }

  // Update scene with splat URL and detected format
  const { data: updatedScene, error: updateError } = await supabase
    .from("scenes")
    .update({
      splat_url: splatUrl,
      splat_file_format: detectedFormat,
    })
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

  // Update organization storage_used_bytes
  const storageDelta = fileSize - oldFileSize;
  if (org && storageDelta !== 0) {
    const newStorageUsed = Math.max(0, org.storage_used_bytes + storageDelta);
    await serviceClient
      .from("organizations")
      .update({ storage_used_bytes: newStorageUsed })
      .eq("id", orgId);
  }

  return NextResponse.json({
    scene: updatedScene,
    detected_format: detectedFormat,
    file_size: fileSize,
  });
}
