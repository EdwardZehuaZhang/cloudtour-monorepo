import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/api-utils";
import { sendTourPublishedEmail } from "@/lib/email";

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

  // Fire-and-forget tour published notification to the user who published
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    sendTourPublishedEmail({
      to: user.email,
      tourTitle: tour.title as string,
      tourSlug: tour.slug as string,
    }).catch(() => {
      // Email failure should not block publish
    });
  }

  return NextResponse.json(tour);
}
