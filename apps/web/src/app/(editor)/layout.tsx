import { redirect } from "next/navigation";
import { createServerClient } from "@cloudtour/db";

export const dynamic = "force-dynamic";

export default async function EditorLayout({
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

  return <>{children}</>;
}
