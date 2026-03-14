import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import type { CameraPosition, Position3D, ContentType, SplatFileFormat } from "@cloudtour/types";
import { TourViewerPage } from "@/components/tour-viewer/tour-viewer-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface WaypointRow {
  id: string;
  scene_id: string;
  target_scene_id: string;
  label: string;
  icon: string | null;
  position_3d: Position3D;
}

interface HotspotRow {
  id: string;
  scene_id: string;
  title: string;
  content_type: ContentType;
  content_markdown: string | null;
  media_url: string | null;
  icon: string | null;
  position_3d: Position3D;
}

interface SceneRow {
  id: string;
  tour_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  splat_url: string | null;
  splat_file_format: SplatFileFormat | null;
  thumbnail_url: string | null;
  default_camera_position: CameraPosition | null;
}

async function getTour(slug: string) {
  const supabase = await createServerClient();

  const { data: tour, error } = await supabase
    .from("tours")
    .select(
      "id, org_id, title, slug, description, status, category, tags, location, cover_image_url, view_count, created_at"
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !tour) return null;

  const { data: rawScenes } = await supabase
    .from("scenes")
    .select(
      "id, tour_id, title, description, sort_order, splat_url, splat_file_format, thumbnail_url, default_camera_position"
    )
    .eq("tour_id", tour.id)
    .order("sort_order", { ascending: true });

  const scenes = (rawScenes ?? []) as unknown as SceneRow[];
  const sceneIds = scenes.map((s) => s.id);

  let waypointRows: WaypointRow[] = [];
  let hotspotRows: HotspotRow[] = [];

  if (sceneIds.length > 0) {
    const [wpResult, hsResult] = await Promise.all([
      supabase
        .from("waypoints")
        .select("id, scene_id, target_scene_id, label, icon, position_3d")
        .in("scene_id", sceneIds),
      supabase
        .from("hotspots")
        .select("id, scene_id, title, content_type, content_markdown, media_url, icon, position_3d")
        .in("scene_id", sceneIds),
    ]);
    waypointRows = (wpResult.data ?? []) as unknown as WaypointRow[];
    hotspotRows = (hsResult.data ?? []) as unknown as HotspotRow[];
  }

  const { data: orgData } = await supabase
    .from("organizations")
    .select("name, slug")
    .eq("id", tour.org_id)
    .single();

  const waypointsByScene: Record<string, WaypointRow[]> = {};
  const hotspotsByScene: Record<string, HotspotRow[]> = {};

  for (const wp of waypointRows) {
    if (!waypointsByScene[wp.scene_id]) waypointsByScene[wp.scene_id] = [];
    waypointsByScene[wp.scene_id]!.push(wp);
  }

  for (const hs of hotspotRows) {
    if (!hotspotsByScene[hs.scene_id]) hotspotsByScene[hs.scene_id] = [];
    hotspotsByScene[hs.scene_id]!.push(hs);
  }

  return {
    ...tour,
    scenes: scenes.map((scene) => ({
      ...scene,
      waypoints: waypointsByScene[scene.id] ?? [],
      hotspots: hotspotsByScene[scene.id] ?? [],
    })),
    organization: orgData
      ? { name: orgData.name, slug: orgData.slug }
      : null,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tour = await getTour(slug);

  if (!tour) {
    return { title: "Tour Not Found — CloudTour" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cloudtour.app";
  const tourUrl = `${appUrl}/tours/${tour.slug}`;
  const firstScene = tour.scenes[0];
  const ogImage =
    tour.cover_image_url ?? firstScene?.thumbnail_url ?? undefined;

  return {
    title: `${tour.title} — CloudTour`,
    description:
      tour.description ??
      `Explore ${tour.title}, an immersive Gaussian splatting virtual tour on CloudTour.`,
    openGraph: {
      title: tour.title,
      description:
        tour.description ??
        `Explore ${tour.title}, an immersive 3D virtual tour.`,
      url: tourUrl,
      siteName: "CloudTour",
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: tour.title,
      description:
        tour.description ??
        `Explore ${tour.title}, an immersive 3D virtual tour.`,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: tourUrl,
    },
  };
}

export default async function TourPage({ params }: PageProps) {
  const { slug } = await params;
  const tour = await getTour(slug);

  if (!tour) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cloudtour.app";
  const tourUrl = `${appUrl}/tours/${tour.slug}`;

  // JSON-LD VirtualLocation schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VirtualLocation",
    name: tour.title,
    description:
      tour.description ??
      `An immersive Gaussian splatting virtual tour on CloudTour.`,
    url: tourUrl,
    ...(tour.location ? { address: tour.location } : {}),
    ...(tour.cover_image_url ? { image: tour.cover_image_url } : {}),
    ...(tour.organization
      ? {
          provider: {
            "@type": "Organization",
            name: tour.organization.name,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TourViewerPage tour={tour} slug={slug} />
    </>
  );
}
