import { redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import { DashboardShell } from "./dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's org memberships
  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  // Fetch the orgs for those memberships
  const orgIds = memberships?.map((m) => m.org_id) ?? [];
  const { data: organizations } = orgIds.length
    ? await supabase
        .from("organizations")
        .select("id, name, slug, plan")
        .in("id", orgIds)
    : { data: [] as { id: string; name: string; slug: string; plan: "free" | "pro" | "enterprise" }[] };

  // Combine into a single list
  const orgs = (memberships ?? []).map((m) => {
    const org = organizations?.find((o) => o.id === m.org_id);
    return {
      id: m.org_id,
      name: org?.name ?? "Unknown",
      slug: org?.slug ?? "",
      plan: (org?.plan ?? "free") as "free" | "pro" | "enterprise",
      role: m.role,
    };
  });

  // Default to first org
  const currentOrg = orgs[0] ?? {
    id: "",
    name: "My Org",
    slug: "my-org",
    plan: "free" as const,
    role: "owner" as const,
  };

  return (
    <DashboardShell orgName={currentOrg.name} plan={currentOrg.plan}>
      {children}
    </DashboardShell>
  );
}
