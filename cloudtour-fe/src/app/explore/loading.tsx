import { Skeleton } from "@cloudtour/ui";

export default function ExploreLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-2 h-5 w-80" />

      {/* Filters bar */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>

      {/* Tour grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            style={{
              animation: "dashboard-fade-up var(--duration-slow) var(--ease-out) both",
              animationDelay: `${i * 30}ms`,
            }}
          >
            <Skeleton className="aspect-[3/2] w-full rounded-none" />
            <div className="p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-2 h-4 w-full" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
