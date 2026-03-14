import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};

/** Rate limit tiers (requests per window). */
const RATE_LIMITS = {
  authenticated: { limit: 100, windowMs: 60_000 },
  unauthenticated: { limit: 30, windowMs: 60_000 },
  upload: { limit: 10, windowMs: 3_600_000 },
} as const;

/**
 * Derive a client identifier for rate limiting.
 * Uses user ID if authenticated, otherwise falls back to IP.
 */
function getClientKey(request: NextRequest, userId: string | null): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `ip:${ip}`;
}

function isUploadEndpoint(pathname: string): boolean {
  return pathname.includes("/upload") && !pathname.includes("/upload/confirm");
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isWebhookRoute(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/");
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // --- Auth guard for protected routes ---
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/editor");

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Rate limiting for API routes ---
  // Skip rate limiting for webhook endpoints (Stripe manages its own retry logic)
  if (isApiRoute(pathname) && !isWebhookRoute(pathname)) {
    const clientKey = getClientKey(request, user?.id ?? null);

    // Upload endpoints: 10 uploads/hour/org
    if (isUploadEndpoint(pathname) && request.method === "POST") {
      const result = checkRateLimit(
        `upload:${clientKey}`,
        RATE_LIMITS.upload.limit,
        RATE_LIMITS.upload.windowMs
      );

      if (!result.allowed) {
        return rateLimitResponse(result.limit, result.remaining, result.resetMs);
      }

      addRateLimitHeaders(supabaseResponse, result);
      return supabaseResponse;
    }

    // Standard rate limits: 100/min authenticated, 30/min unauthenticated
    const tier = user ? RATE_LIMITS.authenticated : RATE_LIMITS.unauthenticated;
    const result = checkRateLimit(
      `api:${clientKey}`,
      tier.limit,
      tier.windowMs
    );

    if (!result.allowed) {
      return rateLimitResponse(result.limit, result.remaining, result.resetMs);
    }

    addRateLimitHeaders(supabaseResponse, result);
  }

  return supabaseResponse;
}

function rateLimitResponse(
  limit: number,
  remaining: number,
  resetMs: number
): NextResponse {
  const retryAfter = Math.ceil(resetMs / 1000);
  const response = NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      retry_after_seconds: retryAfter,
    },
    { status: 429 }
  );
  response.headers.set("Retry-After", String(retryAfter));
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return response;
}

function addRateLimitHeaders(
  response: NextResponse,
  result: { limit: number; remaining: number }
): void {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
}

export const config = {
  matcher: ["/dashboard/:path*", "/editor/:path*", "/api/:path*"],
};
