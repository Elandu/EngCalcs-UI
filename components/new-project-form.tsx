"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Organisation = {
  id: string;
  name: string;
};

export function NewProjectForm({
  organisations,
  userId,
}: {
  organisations: Organisation[];
  userId: string;
}) {
  const router = useRouter();
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "");
  const [projectNumber, setProjectNumber] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          organisation_id: organisationId,
          project_number: projectNumber.trim() || null,
          name: name.trim(),
          address: address.trim() || null,
          standards_region: "AU",
          created_by: userId,
        })
        .select("id")
        .single();

      if (error || !data) {
        setMessage(error?.message || "Unable to create project.");
        return;
      }

      router.push(`/dashboard/projects/${data.id}`);
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      <label>
        Workspace
        <select
          value={organisationId}
          onChange={(event) => setOrganisationId(event.target.value)}
          required
        >
          {organisations.map((organisation) => (
            <option value={organisation.id} key={organisation.id}>
              {organisation.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Project number
        <input
          value={projectNumber}
          onChange={(event) => setProjectNumber(event.target.value)}
          placeholder="24017"
        />
      </label>

      <label>
        Project name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Warehouse extension"
          maxLength={200}
          required
        />
      </label>

      <label>
        Site address
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Sydney NSW"
        />
      </label>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create project"}
        </button>
      </div>

      {message ? <p className="form-message" role="alert">{message}</p> : null}
    </form>
  );
}
