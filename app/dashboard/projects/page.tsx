import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const SEARCH_FIELDS = ["name", "project_number", "address"] as const;

type SearchParams = Promise<{
  page?: string | string[];
  q?: string | string[];
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;

  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function quotePostgrestValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function projectSearchFilter(value: string): string {
  const pattern = quotePostgrestValue(`%${escapeLikeTerm(value)}%`);
  return SEARCH_FIELDS.map((field) => `${field}.ilike.${pattern}`).join(",");
}

function projectsHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));

  const search = params.toString();
  return search ? `/dashboard/projects?${search}` : "/dashboard/projects";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const search = (firstValue(query.q) ?? "").trim().slice(0, 100);
  const requestedPage = parsePage(firstValue(query.page));

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    redirect(authPageHref("login", projectsHref(search, requestedPage)));
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id, role")
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(`Unable to load workspace membership: ${membershipError.message}`);
  }

  const organisationIds = [...new Set((memberships ?? []).map((item) => item.organisation_id))];
  const canManageApiKeys = (memberships ?? []).some(
    (item) => item.role === "owner" || item.role === "admin",
  );
  const canCreateProject = (memberships ?? []).some(
    (item) => item.role === "owner" || item.role === "admin" || item.role === "engineer",
  );

  let totalCount = 0;
  let projects: {
    id: string;
    organisation_id: string;
    project_number: string | null;
    name: string;
    address: string | null;
    status: string;
    updated_at: string;
  }[] = [];

  if (organisationIds.length) {
    let countQuery = supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .in("organisation_id", organisationIds);

    if (search) countQuery = countQuery.or(projectSearchFilter(search));

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(`Unable to count projects: ${countError.message}`);
    totalCount = count ?? 0;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  if (page !== requestedPage) {
    redirect(projectsHref(search, page));
  }

  if (organisationIds.length) {
    let projectsQuery = supabase
      .from("projects")
      .select("id, organisation_id, project_number, name, address, status, updated_at")
      .in("organisation_id", organisationIds)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (search) projectsQuery = projectsQuery.or(projectSearchFilter(search));

    const { data, error: projectError } = await projectsQuery;
    if (projectError) throw new Error(`Unable to load projects: ${projectError.message}`);
    projects = data ?? [];
  }

  const firstResult = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader area="projects" canManageApiKeys={canManageApiKeys} />
      <section className="dashboard-workspace">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">Projects</p>
            <h1>All projects</h1>
            <p>Search projects across the organisations you belong to.</p>
          </div>
          {canCreateProject ? (
            <Link className="button button-primary" href="/dashboard/projects/new">
              New project
            </Link>
          ) : null}
        </div>

        <div className="project-browser-controls">
          <form className="project-search-form" action="/dashboard/projects" method="get">
            <label htmlFor="project-search">Search by project name, number, or address</label>
            <div className="project-search-fields">
              <input
                autoComplete="off"
                id="project-search"
                maxLength={100}
                name="q"
                placeholder="e.g. 1024, Riverside, or 15 Harbour Street"
                type="search"
                defaultValue={search}
              />
              <button className="button button-primary" type="submit">
                Search
              </button>
            </div>
          </form>
          <p className="project-browser-count" aria-live="polite">
            {totalCount === 1 ? "1 project" : `${totalCount} projects`}
            {search ? ` matching “${search}”` : " in your workspaces"}
          </p>
        </div>

        <div className="project-list-card">
          <div className="project-list-header project-browser-list-header">
            <div>
              <h2>{search ? "Search results" : "All projects"}</h2>
              <p>Sorted by recent activity · {PAGE_SIZE} projects per page.</p>
            </div>
            {search ? (
              <Link className="button button-secondary button-small" href="/dashboard/projects">
                Clear search
              </Link>
            ) : null}
          </div>

          {projects.length ? (
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
              <h3>{search ? "No matching projects" : "No projects yet"}</h3>
              <p>
                {search
                  ? "Try a different name, project number, or address."
                  : "Projects in your organisation workspaces will appear here."}
              </p>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="project-pagination">
              <p>
                Showing {firstResult}–{lastResult} of {totalCount}
              </p>
              <nav aria-label="Project pages">
                {page > 1 ? (
                  <Link rel="prev" href={projectsHref(search, page - 1)}>
                    ← Previous
                  </Link>
                ) : (
                  <span aria-disabled="true">← Previous</span>
                )}
                <span aria-current="page">Page {page} of {totalPages}</span>
                {page < totalPages ? (
                  <Link rel="next" href={projectsHref(search, page + 1)}>
                    Next →
                  </Link>
                ) : (
                  <span aria-disabled="true">Next →</span>
                )}
              </nav>
            </div>
          ) : totalCount ? (
            <div className="project-pagination project-pagination-single">
              <p>
                Showing {firstResult}–{lastResult} of {totalCount}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
