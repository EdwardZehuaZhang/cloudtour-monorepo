import { redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";
import { BillingSettings } from "@/components/dashboard/billing-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's first org with billing details
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .single();

  const orgId = membership?.org_id ?? "";
  const currentUserRole = (membership?.role ?? "viewer") as
    | "owner"
    | "admin"
    | "editor"
    | "viewer";

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, plan, stripe_customer_id, stripe_subscription_id")
    .eq("id", orgId)
    .single();

  return (
    <div>
      <nav className="mb-1 text-sm text-[var(--text-secondary)]">
        Dashboard
      </nav>

      <h1 className="font-display text-display-sm font-semibold text-[var(--text-primary)]">
        Settings
      </h1>

      <div className="mt-8">
        <BillingSettings
          orgId={orgId}
          orgName={org?.name ?? ""}
          plan={org?.plan ?? "free"}
          hasStripeCustomer={!!org?.stripe_customer_id}
          hasSubscription={!!org?.stripe_subscription_id}
          isOwner={currentUserRole === "owner"}
        />
      </div>
    </div>
  );
}
