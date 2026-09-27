import { redirect } from "next/navigation";

import { CalculationLibrary } from "@/components/calculation-library";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

export default async function CalculationsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect(authPageHref("login", "/dashboard/calculations"));

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .order("created_at", { ascending: true });
  if (membershipError) throw new Error(`Unable to load workspace membership: ${membershipError.message}`);

  const organisationIds = [...new Set((memberships ?? []).map((item) => item.organisation_id))];
  const canCreateProject = (memberships ?? []).some((item) =>
    item.role === "owner" || item.role === "admin" || item.role === "engineer",
  );
  const hasWorkspaceMembership = Boolean(memberships?.length);
  const canManageApiKeys = (memberships ?? []).some((item) =>
    item.role === "owner" || item.role === "admin",
  );
  const { data: projects, error: projectError } = organisationIds.length
    ? await supabase
        .from("projects")
        .select("id, name, project_number, address")
        .in("organisation_id", organisationIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (projectError) throw new Error(`Unable to load projects: ${projectError.message}`);

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader
        area="calculations"
        canManageApiKeys={canManageApiKeys}
      />
      <section className="dashboard-workspace">
        <CalculationLibrary
          projects={projects ?? []}
          canCreateProject={canCreateProject}
          hasWorkspaceMembership={hasWorkspaceMembership}
        />
      </section>
    </main>
  );
}
