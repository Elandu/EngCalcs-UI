import Link from "next/link";
import type { ReactNode } from "react";

type WorkspaceArea = "projects" | "calculations" | "drawings" | "structural" | "developer";

type WorkspaceHeaderProps = {
  area: WorkspaceArea;
  canManageApiKeys?: boolean;
  currentProject?: {
    id: string;
    name: string;
    projectNumber: string | null;
  };
  /** Project calculation tree shown under the navigation, as in the product preview. */
  projectTree?: ReactNode;
  trailing?: ReactNode;
};

const workspaceLinks: Array<{ area: WorkspaceArea; href: string; label: string }> = [
  { area: "projects", href: "/dashboard", label: "Projects" },
  { area: "calculations", href: "/dashboard/calculations", label: "Calculations" },
  { area: "structural", href: "/dashboard/structural-fea", label: "Frame analysis" },
  { area: "drawings", href: "/dashboard/drawings", label: "Drawings" },
  { area: "developer", href: "/dashboard/settings/api-keys", label: "API & MCP" },
];

/** Application sidebar: workspace navigation, then the open project and its calculations. */
export function WorkspaceHeader({
  area,
  canManageApiKeys = false,
  currentProject,
  projectTree,
  trailing,
}: WorkspaceHeaderProps) {
  const links = canManageApiKeys
    ? workspaceLinks
    : workspaceLinks.filter((item) => item.area !== "developer");

  return (
    <aside className="app-sidebar" aria-label="Workspace">
      <Link className="app-sidebar-brand" href="/dashboard" aria-label="OpenCalcs workspace">
        <span className="app-sidebar-logo" aria-hidden="true">OC</span>
        <span>OpenCalcs</span>
      </Link>
      <nav className="app-sidebar-nav">
        {links.map((item) => (
          <Link
            key={item.area}
            href={item.href}
            className={area === item.area && !currentProject ? "app-nav-item is-active" : "app-nav-item"}
            aria-current={area === item.area ? "page" : undefined}
          >
            <i aria-hidden="true" />
            {item.label}
          </Link>
        ))}
      </nav>
      {currentProject ? (
        <>
          <div className="app-sidebar-divider" />
          <Link className="app-sidebar-project" href={`/dashboard/projects/${currentProject.id}`} title={currentProject.name}>
            <small>{currentProject.projectNumber || "Project"}</small>
            <strong>{currentProject.name}</strong>
          </Link>
          {projectTree}
        </>
      ) : null}
      {trailing ? <div className="app-sidebar-trailing">{trailing}</div> : null}
    </aside>
  );
}
