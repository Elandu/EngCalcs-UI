import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";

type WorkspaceArea = "projects" | "calculations" | "drawings" | "structural" | "developer";

type WorkspaceHeaderProps = {
  area: WorkspaceArea;
  canManageApiKeys?: boolean;
  currentProject?: {
    id: string;
    name: string;
    projectNumber: string | null;
  };
  trailing?: ReactNode;
};

const workspaceLinks: Array<{ area: WorkspaceArea; href: string; label: string }> = [
  { area: "projects", href: "/dashboard", label: "Projects" },
  { area: "calculations", href: "/dashboard/calculations", label: "Calculations" },
  { area: "drawings", href: "/dashboard/drawings", label: "Drawings" },
  { area: "structural", href: "/dashboard/structural-fea", label: "Structural FEA" },
  { area: "developer", href: "/dashboard/settings/api-keys", label: "API & MCP" },
];

export function WorkspaceHeader({
  area,
  canManageApiKeys = false,
  currentProject,
  trailing,
}: WorkspaceHeaderProps) {
  const links = canManageApiKeys
    ? workspaceLinks
    : workspaceLinks.filter((item) => item.area !== "developer");

  return (
    <header className="dashboard-header workspace-header">
      <Brand />
      <nav className="workspace-primary-nav" aria-label="Workspace">
        {links.map((item) => (
          <Link
            key={item.area}
            href={item.href}
            aria-current={area === item.area ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="workspace-header-meta">
        {currentProject ? (
          <Link
            className="workspace-current-project"
            href={`/dashboard/projects/${currentProject.id}`}
            title={currentProject.name}
          >
            <span>Current project</span>
            <strong>
              {currentProject.projectNumber ? `${currentProject.projectNumber} · ` : ""}
              {currentProject.name}
            </strong>
          </Link>
        ) : null}
        {trailing}
      </div>
    </header>
  );
}
