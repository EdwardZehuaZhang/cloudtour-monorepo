import { Skeleton } from "@cloudtour/ui";

export default function SettingsLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-16" />

      {/* Page title */}
      <Skeleton className="mt-1 h-8 w-28" />

      <div className="mt-8 space-y-6">
        {/* Settings sections */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
            style={{
              animation: "dashboard-fade-up var(--duration-slow) var(--ease-out) both",
              animationDelay: `${i * 30}ms`,
            }}
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-64" />
            <div className="mt-4 space-y-4">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
