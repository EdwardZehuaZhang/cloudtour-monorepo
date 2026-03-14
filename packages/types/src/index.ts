// CloudTour shared types — this package contains only TypeScript types, no runtime code.

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type Plan = "free" | "pro" | "enterprise";

export type Role = "owner" | "admin" | "editor" | "viewer";

export type TourStatus = "draft" | "published" | "archived";

export type TourCategory =
  | "real_estate"
  | "tourism"
  | "museum"
  | "education"
  | "other";

export type ContentType = "text" | "image" | "video" | "audio" | "link";

export type SplatFileFormat = "ply" | "splat" | "spz";

// ─── JSON Field Types ───────────────────────────────────────────────────────

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface CameraPosition {
  position: Position3D;
  target: Position3D;
}

export interface ScenePosition {
  scene_id: string;
  x: number;
  y: number;
}

// ─── Database Table Interfaces ──────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: Plan;
  storage_used_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string | null;
  invited_email: string | null;
  invite_token: string | null;
  role: Role;
  joined_at: string | null;
  created_at: string;
}

export interface Tour {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  status: TourStatus;
  category: TourCategory;
  tags: string[];
  location: string | null;
  cover_image_url: string | null;
  view_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  tour_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  splat_url: string | null;
  splat_file_format: SplatFileFormat | null;
  thumbnail_url: string | null;
  default_camera_position: CameraPosition | null;
  created_at: string;
  updated_at: string;
}

export interface Waypoint {
  id: string;
  scene_id: string;
  target_scene_id: string;
  label: string;
  icon: string | null;
  position_3d: Position3D;
  created_at: string;
  updated_at: string;
}

export interface Hotspot {
  id: string;
  scene_id: string;
  title: string;
  content_type: ContentType;
  content_markdown: string | null;
  media_url: string | null;
  icon: string | null;
  position_3d: Position3D;
  created_at: string;
  updated_at: string;
}

export interface FloorPlan {
  id: string;
  tour_id: string;
  image_url: string;
  scene_positions: ScenePosition[];
  created_at: string;
  updated_at: string;
}

export interface BillingEvent {
  id: string;
  org_id: string;
  stripe_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TourView {
  id: string;
  tour_id: string;
  viewer_ip_hash: string;
  viewed_at: string;
}

// ─── Billing Plan Limits ────────────────────────────────────────────────────

export interface PlanLimits {
  tours: number | null;
  scenes_per_tour: number | null;
  storage_bytes: number;
  members: number | null;
}

export type PlanLimitsMap = Record<Plan, PlanLimits>;
