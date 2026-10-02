"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Organisation = {
  id: string;
  name: string;
};

type ApiKeyRow = {
  id: string;
  organisation_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

const scopeOptions = [
  {
    id: "calculations:read",
    label: "Read calculation catalogue",
  },
  {
    id: "calculations:run",
    label: "Run calculations",
  },
  {
    id: "mcp:connect",
    label: "Connect through MCP",
  },
];

export function ApiKeyManager({
  organisations,
  apiKeys,
}: {
  organisations: Organisation[];
  apiKeys: ApiKeyRow[];
}) {
  const router = useRouter();
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(scopeOptions.map((scope) => scope.id));
  const [rawKey, setRawKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleScope(scopeId: string) {
    setScopes((current) =>
      current.includes(scopeId)
        ? current.filter((scope) => scope !== scopeId)
        : [...current, scopeId],
    );
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setRawKey("");

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("opencalcs-api-keys", {
      body: {
        action: "create",
        organisation_id: organisationId,
        name: name.trim(),
        scopes,
      },
    });

    setBusy(false);

    if (error || !data?.key) {
      setMessage(error?.message || data?.error || "Unable to create API key.");
      return;
    }

    setRawKey(data.key);
    setName("");
    setMessage("API key created. Copy it now; the full key will not be shown again.");
    router.refresh();
  }

  async function revokeKey(apiKeyId: string) {
    if (!window.confirm("Revoke this API key? Existing integrations will stop working.")) {
      return;
    }

    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("opencalcs-api-keys", {
      body: {
        action: "revoke",
        api_key_id: apiKeyId,
      },
    });

    setBusy(false);

    if (error || data?.error) {
      setMessage(error?.message || data?.error || "Unable to revoke API key.");
      return;
    }

    setMessage("API key revoked.");
    router.refresh();
  }

  return (
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">New credential</p>
            <h2>Create an organisation API key</h2>
            <p>
              Keys are organisation-scoped. Only a SHA-256 hash is stored; the full secret
              is shown once.
            </p>
          </div>
        </div>

        <form className="project-form" onSubmit={createKey}>
          <label>
            Organisation
            <select
              value={organisationId}
              onChange={(event) => setOrganisationId(event.target.value)}
              required
            >
              {organisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Key name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CI / engineering tool"
              maxLength={120}
              required
            />
          </label>

          <fieldset className="scope-fieldset">
            <legend>Scopes</legend>
            {scopeOptions.map((scope) => (
              <label className="scope-option" key={scope.id}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.id)}
                  onChange={() => toggleScope(scope.id)}
                />
                <span>
                  <strong>{scope.id}</strong>
                  <small>{scope.label}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !scopes.length}
            >
              {busy ? "Creating…" : "Create API key"}
            </button>
          </div>
        </form>

        {rawKey ? (
          <div className="secret-reveal">
            <strong>Copy this key now</strong>
            <code>{rawKey}</code>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => navigator.clipboard.writeText(rawKey)}
            >
              Copy
            </button>
          </div>
        ) : null}

        {message ? <p className="form-message">{message}</p> : null}
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Credentials</p>
            <h2>Existing API keys</h2>
            <p>Revoke a key immediately if it is no longer required or may be exposed.</p>
          </div>
        </div>

        {apiKeys.length ? (
          <div className="api-key-list">
            {apiKeys.map((apiKey) => (
              <article className="api-key-row" key={apiKey.id}>
                <div>
                  <div className="api-key-title">
                    <strong>{apiKey.name}</strong>
                    <code>{apiKey.key_prefix}…</code>
                  </div>
                  <p>{apiKey.scopes.join(" · ")}</p>
                  <small>
                    Last used{" "}
                    {apiKey.last_used_at
                      ? new Date(apiKey.last_used_at).toLocaleString()
                      : "never"}
                  </small>
                </div>
                <div className="api-key-actions">
                  <span className={apiKey.revoked_at ? "key-state revoked" : "key-state"}>
                    {apiKey.revoked_at ? "Revoked" : "Active"}
                  </span>
                  {!apiKey.revoked_at ? (
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      disabled={busy}
                      onClick={() => revokeKey(apiKey.id)}
                    >
                      Revoke
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="project-list-empty">
            <h3>No API keys yet</h3>
            <p>Create one for an MCP client, automation or external API integration.</p>
          </div>
        )}
      </section>
    </div>
  );
}
