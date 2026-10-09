import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceOnboarding } from "@/components/workspace-onboarding";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect(authPageHref("login", "/dashboard"));
  }

  const userId = claimsData.claims.sub;

  const [, membershipResult] = await Promise.all([
    supabase
      .from("profiles")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }),
    supabase
      .from("organisation_members")
      .select("role, organisation_id, organisations(id, name, slug)")
      .order("created_at", { ascending: true }),
  ]);
  const { data: memberships, error: membershipError } = membershipResult;

  if (membershipError) {
    throw new Error(`Unable to load workspace membership: ${membershipError.message}`);
  }

  const organisationIds = (memberships ?? []).map((membership) => membership.organisation_id);

  const [projectResult, activeProjectCountResult] = organisationIds.length
    ? await Promise.all([
        supabase
          .from("projects")
          .select("id, organisation_id, project_number, name, address, status, updated_at")
          .in("organisation_id", organisationIds)
          .order("updated_at", { ascending: false })
          .limit(12),
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .in("organisation_id", organisationIds)
          .eq("status", "active"),
      ])
    : [{ data: [], error: null }, { count: 0, error: null }];
  const { data: projects, error: projectError } = projectResult;
  const { count: activeProjectCount, error: activeProjectCountError } = activeProjectCountResult;

  if (projectError) {
    throw new Error(`Unable to load projects: ${projectError.message}`);
  }

  if (activeProjectCountError) {
    throw new Error(`Unable to count active projects: ${activeProjectCountError.message}`);
  }

  if (!memberships?.length) {
    return (
      <main className="dashboard-shell">
        <WorkspaceHeader area="projects" trailing={<span className="status-pill">New workspace</span>} />
        <WorkspaceOnboarding userId={userId} />
      </main>
    );
  }

  const canCreateProjects = memberships.some((membership) =>
    membership.role === "owner" || membership.role === "admin" || membership.role === "engineer",
  );

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader
        area="projects"
        canManageApiKeys={memberships.some((membership) => membership.role === "owner" || membership.role === "admin")}
        trailing={<span className="status-pill">Engineering workspace</span>}
      />

      <section className="dashboard-workspace">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">Projects</p>
            <h1>Your engineering workspace</h1>
            <p>
              Project data, linked calculations and issue history will stay together here.
            </p>
          </div>
          <Link className="button button-secondary" href="/dashboard/drawings">
            Drawing review
          </Link>
          {canCreateProjects ? (
            <Link className="button button-primary" href="/dashboard/projects/new">
              New project
            </Link>
          ) : null}
        </div>

        <div className="workspace-summary-grid">
          <article className="summary-card">
            <span>Organisations</span>
            <strong>{memberships.length}</strong>
          </article>
          <article className="summary-card">
            <span>Active projects</span>
            <strong>{activeProjectCount ?? 0}</strong>
          </article>
          <article className="summary-card">
            <span>Calculation engine</span>
            <strong>EngCalcs API</strong>
            <small>Versioned definitions and runs</small>
          </article>
        </div>

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Recent projects</h2>
              <p>Projects visible through your organisation membership.</p>
            </div>
            <Link className="button button-secondary button-small" href="/dashboard/projects">
              View all projects
            </Link>
          </div>

          {projects?.length ? (
            <div className="project-list">
              {projects.map((project) => (
                <article className="project-row" key={project.id}>
                  <div>
                    <small>{project.project_number || "UNNUMBERED"}</small>
                    <h3>{project.name}</h3>
                    <p>{project.address || "No site address set"}</p>
                  </div>
                  <div className="project-row-meta">
                    <span>{project.status}</span>
                    <Link href={`/dashboard/projects/${project.id}`}>Open →</Link>
                    <Link
                      className="button button-secondary button-small"
                      href={`/dashboard/calculations?project=${encodeURIComponent(project.id)}`}
                    >
                      Add calculation
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="project-list-empty">
              <h3>No projects yet</h3>
              <p>Create your first project to start adding engineering calculations.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
