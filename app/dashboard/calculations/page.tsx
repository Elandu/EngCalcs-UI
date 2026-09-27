import { redirect } from "next/navigation";

import { CalculationLibrary } from "@/components/calculation-library";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

export default async function CalculationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;
  const initialQuery = query?.slice(0, 80) ?? "";

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const nextPath = initialQuery
    ? `/dashboard/calculations?q=${encodeURIComponent(initialQuery)}`
    : "/dashboard/calculations";
  if (!claimsData?.claims?.sub) redirect(authPageHref("login", nextPath));

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
          initialQuery={initialQuery}
        />
      </section>
    </main>
  );
}
