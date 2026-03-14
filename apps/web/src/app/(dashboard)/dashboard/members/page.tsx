import { redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import { MembersPanel } from "@/components/dashboard/members-panel";

export default async function MembersPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's first org
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .single();

  const orgId = membership?.org_id ?? "";
  const currentUserRole = (membership?.role ?? "viewer") as "owner" | "admin" | "editor" | "viewer";

  return (
    <div>
      <nav className="mb-1 text-sm text-[var(--text-secondary)]">
        Dashboard
      </nav>

      <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
        Members
      </h1>

      <div className="mt-8">
        <MembersPanel orgId={orgId} currentUserRole={currentUserRole} />
      </div>
    </div>
  );
}
