import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { WorkspaceOnboarding } from "@/components/workspace-onboarding";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const userId = claimsData.claims.sub;

  await supabase
    .from("profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("role, organisation_id, organisations(id, name, slug)")
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(`Unable to load workspace membership: ${membershipError.message}`);
  }

  const organisationIds = (memberships ?? []).map((membership) => membership.organisation_id);

  const { data: projects, error: projectError } = organisationIds.length
    ? await supabase
        .from("projects")
        .select("id, organisation_id, project_number, name, address, status, updated_at")
        .in("organisation_id", organisationIds)
        .order("updated_at", { ascending: false })
        .limit(12)
    : { data: [], error: null };

  if (projectError) {
    throw new Error(`Unable to load projects: ${projectError.message}`);
  }

  if (!memberships?.length) {
    return (
      <main className="dashboard-shell">
        <header className="dashboard-header">
          <Brand />
          <span className="status-pill">New workspace</span>
        </header>
        <WorkspaceOnboarding userId={userId} />
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Brand />
        <div className="dashboard-header-actions">
          <Link href="/dashboard/settings/api-keys">API & MCP keys</Link>
          <span className="status-pill">Engineering workspace</span>
        </div>
      </header>

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
          <Link className="button button-primary" href="/dashboard/projects/new">
            New project
          </Link>
        </div>

        <div className="workspace-summary-grid">
          <article className="summary-card">
            <span>Organisations</span>
            <strong>{memberships.length}</strong>
          </article>
          <article className="summary-card">
            <span>Active projects</span>
            <strong>{projects?.filter((project) => project.status === "active").length ?? 0}</strong>
          </article>
          <article className="summary-card">
            <span>Calculation modules</span>
            <strong>1</strong>
            <small>OpenWind connected</small>
          </article>
        </div>

        <div className="project-list-card">
          <div className="project-list-header">
            <div>
              <h2>Recent projects</h2>
              <p>Projects visible through your organisation membership.</p>
            </div>
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
