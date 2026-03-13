import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";

/**
 * POST /api/orgs/[orgId]/tours/[tourId]/publish — Publishes a tour.
 * Changes tour status to 'published'. Requires org membership (editor+).
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; tourId: string }> }
) {
  const { orgId, tourId } = await params;
  const auth = await requireOrgRole(orgId, "editor");
  if (auth instanceof NextResponse) return auth;

  const { supabase } = auth;

  const { data: tour, error } = await supabase
    .from("tours")
    .update({ status: "published" })
    .eq("id", tourId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error || !tour) {
    return NextResponse.json({ error: "Tour not found" }, { status: 404 });
  }

  return NextResponse.json(tour);
}
