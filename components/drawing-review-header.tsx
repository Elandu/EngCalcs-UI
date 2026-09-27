import Link from "next/link";

import { Brand } from "@/components/brand";

type DrawingReviewHeaderProps = {
  canManageApiKeys: boolean;
};

export function DrawingReviewHeader({ canManageApiKeys }: DrawingReviewHeaderProps) {
  return (
    <header className="dashboard-header">
      <Brand />
      <div className="dashboard-header-actions">
        <Link href="/dashboard">Projects</Link>
        <Link href="/dashboard/drawings" aria-current="page">
          Drawings
        </Link>
        {canManageApiKeys ? <Link href="/dashboard/settings/api-keys">API &amp; MCP keys</Link> : null}
        <span className="status-pill">Drawing review</span>
      </div>
    </header>
  );
}