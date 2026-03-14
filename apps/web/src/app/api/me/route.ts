import { NextResponse } from "next/server";
import { createServerClient } from "@cloudtour/db";
import { z } from "zod";

/**
 * GET /api/me — Returns the current user's profile.
 * Requires JWT authentication via Supabase session cookie.
 */
export async function GET() {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, bio, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(profile);
}

const updateProfileSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-z0-9_-]+$/,
        "Username must contain only lowercase letters, numbers, hyphens, and underscores"
      )
      .optional(),
    display_name: z
      .string()
      .min(1, "Display name is required")
      .max(100, "Display name must be at most 100 characters")
      .optional(),
    avatar_url: z.string().url("Invalid avatar URL").nullable().optional(),
    bio: z
      .string()
      .max(500, "Bio must be at most 500 characters")
      .nullable()
      .optional(),
    onboarding_completed: z.boolean().optional(),
  })
  .strict();

/**
 * PATCH /api/me — Updates the current user's profile fields.
 * Requires JWT authentication. Input validated with Zod.
 */
export async function PATCH(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data: profile, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("username, display_name, avatar_url, bio, onboarding_completed")
    .single();

  if (updateError) {
    // Handle unique constraint violation on username
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }

  return NextResponse.json(profile);
}
