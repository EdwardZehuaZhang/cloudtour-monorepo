"use server";

import { createServerClient } from "@cloudtour/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { sendWelcomeEmail, sendPasswordResetEmail } from "@/lib/email";
import { createServiceClient } from "@cloudtour/db";

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z.string().min(1, "Display name is required").max(100),
  consent: z.literal(true, "You must agree to the privacy policy"),
});

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    display_name: formData.get("display_name"),
    consent: formData.get("consent") === "on",
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.display_name,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Fire-and-forget welcome email
  sendWelcomeEmail({
    to: parsed.data.email,
    displayName: parsed.data.display_name,
  }).catch(() => {
    // Email failure should not block signup
  });

  redirect("/dashboard");
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export type ForgotPasswordState = {
  error?: string;
  success?: boolean;
};

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function forgotPassword(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.email?.[0] ?? "Invalid email" };
  }

  const headersList = await headers();
  const origin = headersList.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    // Use service client to generate a recovery link
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
      options: {
        redirectTo: `${origin}/auth/callback?next=/reset-password`,
      },
    });

    if (error) {
      // Don't reveal whether the email exists
      return { success: true };
    }

    if (data?.properties?.action_link) {
      await sendPasswordResetEmail({
        to: parsed.data.email,
        resetUrl: data.properties.action_link,
      });
    }
  } catch {
    // Don't reveal errors to prevent email enumeration
  }

  // Always show success to prevent email enumeration
  return { success: true };
}

export type ResetPasswordState = {
  error?: string;
  success?: boolean;
};

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.password?.[0] ?? "Invalid password" };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signInWithOAuth(provider: "google" | "apple"): Promise<void> {
  const supabase = await createServerClient();
  const headersList = await headers();
  const origin = headersList.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }
}
