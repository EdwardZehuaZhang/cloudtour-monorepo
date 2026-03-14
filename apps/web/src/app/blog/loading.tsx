import { Skeleton } from "@cloudtour/ui";

export default function BlogLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <Skeleton className="h-10 w-32" />
      <Skeleton className="mt-2 h-5 w-64" />

      {/* Blog post list */}
      <div className="mt-10 space-y-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 sm:flex-row"
            style={{
              animation: "dashboard-fade-up var(--duration-slow) var(--ease-out) both",
              animationDelay: `${i * 30}ms`,
            }}
          >
            <Skeleton className="aspect-[3/2] w-full shrink-0 rounded-lg sm:w-48" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
