"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function WorkspaceOnboarding({ userId }: { userId: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { data: organisation, error: organisationError } = await supabase
        .from("organisations")
        .insert({
          name: name.trim(),
          created_by: userId,
        })
        .select("id")
        .single();

      if (organisationError || !organisation) {
        setMessage(organisationError?.message || "Unable to create workspace.");
        return;
      }

      const { error: membershipError } = await supabase
        .from("organisation_members")
        .insert({
          organisation_id: organisation.id,
          user_id: userId,
          role: "owner",
        });

      if (membershipError) {
        setMessage(membershipError.message);
        return;
      }

      window.location.reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-empty onboarding-card">
      <p className="eyebrow">Set up EngCalcs</p>
      <h1>Create your engineering workspace.</h1>
      <p>
        A workspace owns projects, calculations, reports and team access. You can invite
        engineers and reviewers later.
      </p>

      <form className="workspace-form" onSubmit={createWorkspace}>
        <label>
          Workspace name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Structural"
            minLength={1}
            maxLength={120}
            required
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
        {message ? <p className="form-message" role="alert">{message}</p> : null}
      </form>
    </section>
  );
}
