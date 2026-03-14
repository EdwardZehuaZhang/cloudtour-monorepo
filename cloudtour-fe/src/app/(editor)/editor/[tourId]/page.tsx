import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import { TourEditor } from "@/components/editor/tour-editor";

export const dynamic = "force-dynamic";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch tour with org info
  const { data: tour, error: tourError } = await supabase
    .from("tours")
    .select("id, org_id, title, slug, description, status, category, tags, location, cover_image_url")
    .eq("id", tourId)
    .single();

  if (tourError || !tour) {
    notFound();
  }

  // Verify user is a member of this org with at least viewer role
  const { data: member } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", tour.org_id)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    notFound();
  }

  // Fetch scenes for this tour
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position")
    .eq("tour_id", tourId)
    .order("sort_order", { ascending: true });

  return (
    <TourEditor
      tour={{
        id: tour.id,
        org_id: tour.org_id,
        title: tour.title,
        slug: tour.slug,
        description: tour.description,
        status: tour.status as "draft" | "published" | "archived",
        category: tour.category as "real_estate" | "tourism" | "museum" | "education" | "other",
        tags: tour.tags as string[],
        location: tour.location,
        cover_image_url: tour.cover_image_url,
      }}
      scenes={(scenes ?? []).map((s) => ({
        id: s.id,
        tour_id: s.tour_id,
        title: s.title,
        description: s.description,
        sort_order: s.sort_order,
        splat_url: s.splat_url,
        splat_file_format: s.splat_file_format as "ply" | "splat" | "spz" | null,
        thumbnail_url: s.thumbnail_url,
        default_camera_position: s.default_camera_position as { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null,
      }))}
      userRole={member.role as "owner" | "admin" | "editor" | "viewer"}
    />
  );
}
