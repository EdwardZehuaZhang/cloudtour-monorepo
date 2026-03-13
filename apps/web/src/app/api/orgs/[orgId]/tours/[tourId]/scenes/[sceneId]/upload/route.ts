import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/api-utils";
import { createServiceClient } from "@cloudtour/db";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { STORAGE_BUCKETS, splatFilePath } from "@/lib/storage";
import type { SplatFileFormat } from "@cloudtour/types";

type RouteParams = {
  params: Promise<{ orgId: string; tourId: string; sceneId: string }>;
};

const PRESIGNED_URL_EXPIRY = 15 * 60; // 15 minutes in seconds
const UPLOAD_RATE_LIMIT = 10; // max uploads per hour per org
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms

const uploadRequestSchema = z.object({
  format: z.enum(["ply", "splat", "spz"]),
});

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/scenes/[sceneId]/upload
 * Returns a presigned upload URL for uploading a splat file to Supabase Storage.
 * Requires org membership (editor+). Enforces storage plan limits and rate limiting.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  const parsed = uploadRequestSchema.safeParse(body);
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
  const format = parsed.data.format as SplatFileFormat;

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

  // Check storage plan limit
  const limits = PLAN_LIMITS[plan];
  const { data: org } = await supabase
    .from("organizations")
    .select("storage_used_bytes")
    .eq("id", orgId)
    .single();

  if (org && limits.storage_bytes !== null) {
    if (org.storage_used_bytes >= limits.storage_bytes) {
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

  // Rate limit: 10 uploads/hour/org
  // Count scenes with splat_url updated in the last hour across all org tours
  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { data: orgTours } = await supabase
    .from("tours")
    .select("id")
    .eq("org_id", orgId);

  if (orgTours && orgTours.length > 0) {
    const tourIds = orgTours.map((t) => t.id);
    const { count: totalRecentUploads } = await supabase
      .from("scenes")
      .select("id", { count: "exact", head: true })
      .in("tour_id", tourIds)
      .not("splat_url", "is", null)
      .gte("updated_at", oneHourAgo);

    if ((totalRecentUploads ?? 0) >= UPLOAD_RATE_LIMIT) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Maximum 10 uploads per hour per organization.",
        },
        { status: 429 }
      );
    }
  }

  // Generate presigned upload URL using service client (needs storage admin access)
  const serviceClient = createServiceClient();
  const storagePath = splatFilePath(orgId, tourId, sceneId, format);

  // Remove any existing file at this path first
  await serviceClient.storage.from(STORAGE_BUCKETS.SPLAT_FILES).remove([storagePath]);

  const { data: signedUrl, error: signError } = await serviceClient.storage
    .from(STORAGE_BUCKETS.SPLAT_FILES)
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
    format,
    expires_in: PRESIGNED_URL_EXPIRY,
  });
}
