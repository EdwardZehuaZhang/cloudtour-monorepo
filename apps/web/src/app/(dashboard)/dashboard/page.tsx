import { redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import { TourGrid } from "@/components/dashboard/tour-grid";
import type { TourWithSceneCount } from "@/components/dashboard/tour-grid";

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's first org (personal org)
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .single();

  const orgId = membership?.org_id ?? "";

  // Fetch tours for the org with scene count info
  let tours: TourWithSceneCount[] = [];

  if (orgId) {
    const { data: tourRows } = await supabase
      .from("tours")
      .select("*")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false });

    if (tourRows) {
      // Fetch first scene thumbnail for each tour
      const tourIds = tourRows.map((t) => t.id);
      const { data: scenes } = tourIds.length
        ? await supabase
            .from("scenes")
            .select("tour_id, splat_url, thumbnail_url, sort_order")
            .in("tour_id", tourIds)
            .order("sort_order", { ascending: true })
        : { data: [] };

      tours = tourRows.map((t) => {
        const tourScenes = (scenes ?? []).filter((s) => s.tour_id === t.id);
        const firstScene = tourScenes[0];
        return {
          ...t,
          tags: (t.tags ?? []) as string[],
          scene_count: tourScenes.length,
          first_scene_splat_url: firstScene?.splat_url ?? null,
          first_scene_thumbnail_url: firstScene?.thumbnail_url ?? null,
        } as TourWithSceneCount;
      });
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-1 text-sm text-[var(--text-secondary)]">
        Dashboard
      </nav>

      {/* Page title */}
      <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
        Tours
      </h1>

      <div className="mt-8">
        <TourGrid tours={tours} orgId={orgId} />
      </div>
    </div>
  );
}
