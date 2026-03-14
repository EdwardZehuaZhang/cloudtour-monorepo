import { Skeleton } from "@cloudtour/ui";

export default function EditorLoading() {
  return (
    <div className="flex h-screen flex-col bg-[var(--bg)]">
      {/* Editor header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Editor panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene list panel */}
        <div className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
          <div className="flex h-10 items-center justify-between border-b border-[var(--border)] px-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-4" />
          </div>
          <div className="flex-1 space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-md p-1.5">
                <Skeleton className="h-12 w-16 shrink-0 rounded" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2 w-10" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Viewport skeleton */}
        <div className="flex-1">
          <Skeleton className="h-full w-full rounded-none" />
        </div>

        {/* Inspector panel */}
        <div className="w-[280px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] p-4">
          <Skeleton className="h-4 w-20" />
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
