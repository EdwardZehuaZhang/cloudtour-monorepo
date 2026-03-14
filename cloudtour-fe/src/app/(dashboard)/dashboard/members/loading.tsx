import { Skeleton } from "@cloudtour/ui";

export default function MembersLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-16" />

      {/* Page title */}
      <Skeleton className="mt-1 h-8 w-28" />

      <div className="mt-8">
        {/* Invite button skeleton */}
        <div className="mb-6 flex justify-end">
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>

        {/* Members list skeleton */}
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
              style={{
                animation: "dashboard-fade-up var(--duration-slow) var(--ease-out) both",
                animationDelay: `${i * 30}ms`,
              }}
            >
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
