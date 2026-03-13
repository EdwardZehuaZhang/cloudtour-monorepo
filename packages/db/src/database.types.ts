// Generated Supabase database types — matches the migration schema in packages/db/migrations/
// Regenerate with: supabase gen types typescript --local > packages/db/src/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          plan: "free" | "pro" | "enterprise";
          storage_used_bytes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          storage_used_bytes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          plan?: "free" | "pro" | "enterprise";
          storage_used_bytes?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      org_members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          invited_email: string | null;
          role: "owner" | "admin" | "editor" | "viewer";
          joined_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          invited_email?: string | null;
          role?: "owner" | "admin" | "editor" | "viewer";
          joined_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string | null;
          invited_email?: string | null;
          role?: "owner" | "admin" | "editor" | "viewer";
          joined_at?: string | null;
          created_at?: string;
        };
      };
      tours: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          slug: string;
          description: string | null;
          status: "draft" | "published" | "archived";
          category: "real_estate" | "tourism" | "museum" | "education" | "other";
          tags: string[];
          location: string | null;
          cover_image_url: string | null;
          view_count: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          slug: string;
          description?: string | null;
          status?: "draft" | "published" | "archived";
          category?: "real_estate" | "tourism" | "museum" | "education" | "other";
          tags?: string[];
          location?: string | null;
          cover_image_url?: string | null;
          view_count?: number;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          status?: "draft" | "published" | "archived";
          category?: "real_estate" | "tourism" | "museum" | "education" | "other";
          tags?: string[];
          location?: string | null;
          cover_image_url?: string | null;
          view_count?: number;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      scenes: {
        Row: {
          id: string;
          tour_id: string;
          title: string;
          description: string | null;
          sort_order: number;
          splat_url: string | null;
          splat_file_format: "ply" | "splat" | "spz" | null;
          thumbnail_url: string | null;
          default_camera_position: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          title: string;
          description?: string | null;
          sort_order?: number;
          splat_url?: string | null;
          splat_file_format?: "ply" | "splat" | "spz" | null;
          thumbnail_url?: string | null;
          default_camera_position?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          title?: string;
          description?: string | null;
          sort_order?: number;
          splat_url?: string | null;
          splat_file_format?: "ply" | "splat" | "spz" | null;
          thumbnail_url?: string | null;
          default_camera_position?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      waypoints: {
        Row: {
          id: string;
          scene_id: string;
          target_scene_id: string;
          label: string;
          icon: string | null;
          position_3d: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          target_scene_id: string;
          label: string;
          icon?: string | null;
          position_3d: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          target_scene_id?: string;
          label?: string;
          icon?: string | null;
          position_3d?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      hotspots: {
        Row: {
          id: string;
          scene_id: string;
          title: string;
          content_type: "text" | "image" | "video" | "audio" | "link";
          content_markdown: string | null;
          media_url: string | null;
          icon: string | null;
          position_3d: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          title: string;
          content_type?: "text" | "image" | "video" | "audio" | "link";
          content_markdown?: string | null;
          media_url?: string | null;
          icon?: string | null;
          position_3d: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          title?: string;
          content_type?: "text" | "image" | "video" | "audio" | "link";
          content_markdown?: string | null;
          media_url?: string | null;
          icon?: string | null;
          position_3d?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      floor_plans: {
        Row: {
          id: string;
          tour_id: string;
          image_url: string;
          scene_positions: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          image_url: string;
          scene_positions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          image_url?: string;
          scene_positions?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      billing_events: {
        Row: {
          id: string;
          org_id: string;
          stripe_event_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          stripe_event_id: string;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          stripe_event_id?: string;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
      };
      tour_views: {
        Row: {
          id: string;
          tour_id: string;
          viewer_ip_hash: string;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          viewer_ip_hash: string;
          viewed_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          viewer_ip_hash?: string;
          viewed_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      generate_unique_slug: {
        Args: { base_slug: string; table_name: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
}
