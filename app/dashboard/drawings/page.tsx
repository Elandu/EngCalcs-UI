import Link from "next/link";
import { redirect } from "next/navigation";

import { DrawingReviewHeader } from "@/components/drawing-review-header";
import styles from "@/components/drawing-review-shell.module.css";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DrawingsPageProps = {
  searchParams: Promise<{ projectId?: string | string[] }>;
};

export default async function DrawingsPage({ searchParams }: DrawingsPageProps) {
  const query = await searchParams;
  const requestedProjectId = Array.isArray(query.projectId) ? query.projectId[0] : query.projectId;
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
        .select("id, name, project_number")
        .in("organisation_id", organisationIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (projectError) {
    throw new Error(`Unable to load projects: ${projectError.message}`);
  }

  const projectList = projects ?? [];
  const selectedProject =
    projectList.find((project) => project.id === requestedProjectId) ?? projectList[0] ?? null;
  const projectId = selectedProject?.id ?? "";
  const viewerUrl = projectId
    ? `/drawing-review.html?projectId=${encodeURIComponent(projectId)}`
    : "/drawing-review.html";
  const canManageApiKeys = (memberships ?? []).some((item) =>
    item.role === "owner" || item.role === "admin",
  );

  return (
    <main className="dashboard-shell">
      <DrawingReviewHeader canManageApiKeys={canManageApiKeys} />
      <section className={`dashboard-workspace ${styles.workspace}`}>
        <div className={styles.heading}>
          <div>
            <p className="eyebrow">EngCalcs workspace · Calculation-linked drawings</p>
            <h1>Drawing review</h1>
            <p>Mark up structural elements and link them to saved project calculations.</p>
          </div>
          {projectList.length ? (
            <form className={styles.projectPicker} action="/dashboard/drawings" method="get">
              <label htmlFor="drawing-project">EngCalcs project</label>
              <div>
                <select id="drawing-project" name="projectId" defaultValue={projectId}>
                  {projectList.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.project_number ? `${project.project_number} · ` : ""}
                      {project.name}
                    </option>
                  ))}
                </select>
                <button className="button button-secondary button-small" type="submit">
                  Open project
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {!projectList.length ? (
          <aside className={styles.emptyProject}>
            <div>
              <strong>No EngCalcs project is available yet</strong>
              <p>You can still annotate and export drawings. Create a project to save calculation runs.</p>
            </div>
            <Link className="button button-primary button-small" href="/dashboard/projects/new">
              Create a project
            </Link>
          </aside>
        ) : null}

        <div className={styles.viewerFrame}>
          <iframe
            key={projectId || "no-project"}
            title="EngCalcs drawing review"
            src={viewerUrl}
            allow="clipboard-write"
          />
        </div>
      </section>
    </main>
  );
}
