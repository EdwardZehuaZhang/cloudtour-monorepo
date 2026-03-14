import { Skeleton } from "@cloudtour/ui";

export default function DashboardLoading() {
  return (
    <div>
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-4 w-16" />

      {/* Page title skeleton */}
      <Skeleton className="mt-1 h-8 w-24" />

      <div className="mt-8">
        {/* Create button skeleton */}
        <div className="mb-6 flex justify-end">
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>

        {/* Tour grid skeleton — asymmetric masonry matching actual layout */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Hero card (spans 2 cols) */}
          <div
            className="col-span-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
            style={{
              animation: "dashboard-fade-up var(--duration-slow) var(--ease-out) both",
              animationDelay: "0ms",
            }}
          >
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
            <div className="p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <div className="mt-3 flex gap-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>

          {/* Regular cards */}
          {[1, 2, 3, 4].map((i) => (
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
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
                <div className="mt-3 flex gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
