"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  Layers,
  Users,
  Settings,
  ChevronsUpDown,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Tours", href: "/dashboard", icon: Map },
  { label: "Scenes", href: "/dashboard/scenes", icon: Layers },
  { label: "Members", href: "/dashboard/members", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
] as const;

interface SidebarProps {
  orgName: string;
  plan: "free" | "pro" | "enterprise";
}

function PlanBadge({ plan }: { plan: SidebarProps["plan"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        plan === "free" && "bg-white/10 text-white/60",
        plan === "pro" && "bg-[var(--brand)]/20 text-[var(--brand-light)]",
        plan === "enterprise" && "bg-[var(--accent)]/20 text-[var(--accent)]"
      )}
    >
      {plan === "pro" && <Crown className="mr-1 h-3 w-3" />}
      {plan === "enterprise" && <Crown className="mr-1 h-3 w-3" />}
      {plan}
    </span>
  );
}

export function Sidebar({ orgName, plan }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col bg-[var(--text-primary)] md:flex">
      {/* Logo */}
      <div className="flex h-14 items-center px-5">
        <Link
          href="/dashboard"
          className="font-display text-lg font-semibold tracking-tight text-white"
        >
          CloudTour
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-[oklch(85%_0.015_68)] hover:bg-white/5 hover:text-white"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--brand-light)]" />
              )}
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Plan badge + Org switcher */}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex justify-center">
          <PlanBadge plan={plan} />
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[oklch(85%_0.015_68)] transition-colors duration-fast hover:bg-white/5 hover:text-white"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-xs font-semibold text-white">
            {orgName.charAt(0).toUpperCase()}
          </span>
          <span className="flex-1 truncate text-left">{orgName}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
      {navItems.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors",
              isActive
                ? "text-[var(--brand)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
