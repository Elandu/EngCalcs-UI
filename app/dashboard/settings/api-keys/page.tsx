import { redirect } from "next/navigation";

import { ApiKeyManager } from "@/components/api-key-manager";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createClient } from "@/lib/supabase/server";
import { authPageHref } from "@/lib/safe-auth-redirect";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect(authPageHref("login", "/dashboard/settings/api-keys"));
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organisation_members")
    .select("organisation_id, role, organisations(id, name)")
    .in("role", ["owner", "admin"]);

  if (membershipError) {
    throw new Error(`Unable to load API-key organisations: ${membershipError.message}`);
  }

  const organisations = (memberships ?? [])
    .map((membership) => membership.organisations)
    .filter((organisation): organisation is { id: string; name: string } => Boolean(organisation));

  if (!organisations.length) {
    redirect("/dashboard");
  }

  const organisationIds = organisations.map((organisation) => organisation.id);
  const { data: apiKeys, error: keyError } = await supabase
    .from("api_keys")
    .select(
      "id, organisation_id, name, key_prefix, scopes, expires_at, revoked_at, last_used_at, created_at",
    )
    .in("organisation_id", organisationIds)
    .order("created_at", { ascending: false });

  if (keyError) {
    throw new Error(`Unable to load API keys: ${keyError.message}`);
  }

  return (
    <main className="dashboard-shell">
      <WorkspaceHeader area="developer" canManageApiKeys />

      <section className="dashboard-workspace narrow-settings">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">Developer access</p>
            <h1>API & MCP keys</h1>
            <p>
              Organisation-scoped credentials for integrations, automation and engineering
              agents.
            </p>
          </div>
        </div>

        <ApiKeyManager organisations={organisations} apiKeys={apiKeys ?? []} />
      </section>
    </main>
  );
}
