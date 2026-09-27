import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StructuralProjectsPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect("/login");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .order("created_at", { ascending: true });
  if (membershipError) {
    throw new Error(`Unable to load workspace membership: ${membershipError.message}`);
  }

  const organisationIds = [...new Set((memberships ?? []).map((item) => item.organisation_id))];
  const { data: projects, error: projectError } = organisationIds.length
    ? await supabase
        .from("projects")
        .select("id, name, project_number, address, updated_at")
        .in("organisation_id", organisationIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (projectError) {
    throw new Error(`Unable to load projects: ${projectError.message}`);
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Brand />
        <Link href="/dashboard">Back to workspace</Link>
      </header>
      <section className="dashboard-workspace">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">PyNite workbench</p>
            <h1>Structural FEA</h1>
            <p>Open a project to model and analyse a 3D frame with PyNite.</p>
          </div>
        </div>

        {projects?.length ? (
          <div className="project-list-card">
            <div className="project-list-header">
              <div>
                <h2>Choose a project</h2>
                <p>Analysis runs are saved with the project and its calculation history.</p>
              </div>
            </div>
            <div className="project-list">
              {projects.map((project) => (
                <article className="project-row" key={project.id}>
                  <div>
                    <small>{project.project_number || "UNNUMBERED"}</small>
                    <h3>{project.name}</h3>
                    <p>{project.address || "No site address set"}</p>
                  </div>
                  <div className="project-row-meta">
                    <Link href={`/dashboard/structural-fea/${project.id}`}>Open modeler →</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="project-list-empty">
            <h2>Create a project first</h2>
            <p>Structural models and saved analysis runs belong to an OpenCalcs project.</p>
            <Link className="button button-primary" href="/dashboard/projects/new">
              Create a project
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
