import { redirect } from "next/navigation";

import { NewProjectForm } from "@/components/new-project-form";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect(authPageHref("login", "/dashboard/projects/new"));
  }

  const { data: memberships, error } = await supabase
    .from("organisation_members")
    .select("organisation_id, role, organisations(id, name)")
    .in("role", ["owner", "admin", "engineer"]);

  if (error) {
    throw new Error(`Unable to load workspaces: ${error.message}`);
  }

  const organisations = (memberships ?? [])
    .map((membership) => membership.organisations)
    .filter((organisation): organisation is { id: string; name: string } => Boolean(organisation));

  if (!organisations.length) {
    redirect("/dashboard");
  }

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader
        area="projects"
        canManageApiKeys={memberships.some((membership) => membership.role === "owner" || membership.role === "admin")}
      />

      <section className="dashboard-workspace narrow-workspace">
        <p className="eyebrow">New project</p>
        <h1>Create a project</h1>
        <p>
          Project defaults and calculations will inherit the selected workspace permissions.
        </p>
        <NewProjectForm organisations={organisations} userId={userId} />
      </section>
    </main>
  );
}
