"use client";

import { Sidebar, MobileTabBar } from "@/components/dashboard/sidebar";

interface DashboardShellProps {
  orgName: string;
  plan: "free" | "pro" | "enterprise";
  children: React.ReactNode;
}

export function DashboardShell({
  orgName,
  plan,
  children,
}: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar orgName={orgName} plan={plan} />
      <MobileTabBar />

      {/* Main content: offset by sidebar width on desktop, bottom padding for mobile tab bar */}
      <main className="min-h-screen pb-20 md:pl-[200px] md:pb-0">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
