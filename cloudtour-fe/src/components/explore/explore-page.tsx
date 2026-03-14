"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Search,
  Eye,
  MapPin,
  Layers,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExploreTour {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  category: string;
  tags: string[];
  location: string | null;
  cover_image_url: string | null;
  view_count: number;
  created_at: string;
  scene_count: number;
  first_scene_thumbnail_url: string | null;
}

interface ApiResponse {
  data: ExploreTour[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "real_estate", label: "Real Estate" },
  { value: "tourism", label: "Tourism" },
  { value: "museum", label: "Museum" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
  { value: "alphabetical", label: "A �?Z" },
] as const;

// ─── Tour Card ──────────────────────────────────────────────────────────────

function ExploreTourCard({
  tour,
  isHero,
  index,
}: {
  tour: ExploreTour;
  isHero: boolean;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      href={`/tours/${tour.slug}`}
      className={`group relative block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow hover:shadow-lg ${isHero ? "col-span-1 md:col-span-2 row-span-1" : ""}`}
      style={{
        animation: `dashboard-fade-up var(--duration-slow) var(--ease-out) both`,
        animationDelay: `${index * 30}ms`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail Area */}
      <div
        className={`relative overflow-hidden bg-[var(--surface-alt)] ${isHero ? "aspect-[16/9]" : "aspect-[3/2]"}`}
      >
        {tour.first_scene_thumbnail_url || tour.cover_image_url ? (
          <Image
            src={tour.first_scene_thumbnail_url ?? tour.cover_image_url ?? ""}
            alt={tour.title}
            fill
            className="object-cover transition-transform duration-slow"
            style={{ transform: isHovered ? "scale(1.03)" : "scale(1)" }}
            sizes={
              isHero
                ? "(min-width: 768px) 66vw, 100vw"
                : "(min-width: 768px) 33vw, 100vw"
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-10 w-10 text-[var(--text-secondary)] opacity-30" />
          </div>
        )}

        {/* Hover overlay gradient */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent transition-opacity"
          style={{
            opacity: isHovered ? 1 : 0,
            transitionDuration: "var(--duration-base)",
          }}
        />

        {/* Category badge */}
        {tour.category !== "other" && (
          <div className="absolute left-3 top-3 z-10">
            <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium capitalize text-[var(--text-primary)] backdrop-blur-sm">
              {tour.category.replace("_", " ")}
            </span>
          </div>
        )}

        {/* View count overlay */}
        {tour.view_count > 0 && (
          <div
            className="absolute bottom-3 left-3 z-10 flex items-center gap-1 text-xs text-white transition-opacity"
            style={{
              opacity: isHovered ? 1 : 0,
              transitionDuration: "var(--duration-base)",
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{tour.view_count.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className={`font-display font-semibold text-[var(--text-primary)] ${isHero ? "text-lg" : "text-base"}`}
        >
          {tour.title}
        </h3>

        {tour.description && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {tour.description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {tour.scene_count} {tour.scene_count === 1 ? "scene" : "scenes"}
          </span>
          {tour.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {tour.location}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function ExploreEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Layers className="mb-4 h-12 w-12 text-[var(--text-secondary)] opacity-40" />
      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        {hasFilters ? "No tours match your filters" : "No tours published yet"}
      </h3>
      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        {hasFilters
          ? "Try adjusting your search or filters to find what you're looking for."
          : "Be the first to create and publish a spatial tour on CloudTour."}
      </p>
      {hasFilters ? null : (
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-light)]"
        >
          Get Started
        </Link>
      )}
    </div>
  );
}

// ─── Explore Page ───────────────────────────────────────────────────────────

export function ExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL search params
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [location, setLocation] = useState(
    searchParams.get("location") ?? ""
  );
  const [sort, setSort] = useState(searchParams.get("sort") ?? "newest");
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") ?? "1", 10) || 1
  );

  const [tours, setTours] = useState<ExploreTour[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasFilters = !!(search || category || location);

  // Build query string and update URL
  const buildQueryString = useCallback(
    (overrides: Record<string, string | number> = {}) => {
      const params = new URLSearchParams();
      const s = (overrides.search as string) ?? search;
      const c = (overrides.category as string) ?? category;
      const l = (overrides.location as string) ?? location;
      const so = (overrides.sort as string) ?? sort;
      const p = (overrides.page as number) ?? page;

      if (s) params.set("search", s);
      if (c) params.set("category", c);
      if (l) params.set("location", l);
      if (so && so !== "newest") params.set("sort", so);
      if (p > 1) params.set("page", String(p));

      return params.toString();
    },
    [search, category, location, sort, page]
  );

  // Fetch tours
  const fetchTours = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (location) params.set("location", location);
      if (sort) params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", "20");

      const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/tours?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ApiResponse = await res.json();
      setTours(data.data);
      setPagination(data.pagination);
    } catch {
      setTours([]);
    } finally {
      setLoading(false);
    }
  }, [search, category, location, sort, page]);

  // Update URL when filters change
  useEffect(() => {
    const qs = buildQueryString();
    const newUrl = qs ? `/explore?${qs}` : "/explore";
    router.replace(newUrl, { scroll: false });
  }, [search, category, location, sort, page, buildQueryString, router]);

  // Fetch on filter/page change
  useEffect(() => {
    fetchTours();
  }, [fetchTours]);

  // Debounced search handler
  const handleSearchChange = (value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const handleSortChange = (value: string) => {
    setSort(value);
    setPage(1);
  };

  const handleLocationChange = (value: string) => {
    setLocation(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setLocation("");
    setSort("newest");
    setPage(1);
    if (searchInputRef.current) searchInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="font-display text-lg font-semibold text-[var(--text-primary)]">
            CloudTour
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <Link
              href="/explore"
              className="font-medium text-[var(--brand)]"
            >
              Explore
            </Link>
            <Link
              href="/pricing"
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-light)]"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
            Explore Tours
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Discover immersive spatial tours from creators around the world.
          </p>
        </div>

        {/* Filters Bar */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* Search */}
          <div className="relative flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tours..."
              defaultValue={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </div>

          {/* Desktop filters */}
          <div className="hidden items-center gap-3 md:flex">
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Location..."
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="w-40 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />

            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-md px-2 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {/* Mobile filter toggle */}
          <button
            onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand)] text-[10px] text-white">
                !
              </span>
            )}
          </button>
        </div>

        {/* Mobile filters panel */}
        {mobileFiltersOpen && (
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:hidden">
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Location..."
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            />

            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Results count */}
        {!loading && (
          <p className="mb-4 text-xs text-[var(--text-secondary)]">
            {pagination.total} {pagination.total === 1 ? "tour" : "tours"}
            {hasFilters ? " found" : " published"}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className={`overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] ${i === 0 ? "col-span-1 md:col-span-2" : ""}`}
                style={{
                  animation: `dashboard-fade-up var(--duration-slow) var(--ease-out) both`,
                  animationDelay: `${i * 30}ms`,
                }}
              >
                <div
                  className={`animate-pulse bg-[var(--surface-alt)] ${i === 0 ? "aspect-[16/9]" : "aspect-[3/2]"}`}
                />
                <div className="p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-alt)]" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-[var(--surface-alt)]" />
                  <div className="mt-3 flex gap-3">
                    <div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-alt)]" />
                    <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-alt)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tour grid */}
        {!loading && tours.length === 0 && (
          <ExploreEmptyState hasFilters={hasFilters} />
        )}

        {!loading && tours.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {tours.map((tour, i) => (
              <ExploreTourCard
                key={tour.id}
                tour={tour}
                isHero={i === 0 && page === 1}
                index={i}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.total_pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-alt)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            <span className="px-3 text-sm text-[var(--text-secondary)]">
              Page {page} of {pagination.total_pages}
            </span>

            <button
              onClick={() =>
                setPage(Math.min(pagination.total_pages, page + 1))
              }
              disabled={page >= pagination.total_pages}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-alt)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs text-[var(--text-secondary)]">
            &copy; {new Date().getFullYear()} CloudTour. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

