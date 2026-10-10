"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calculationCatalogue, calculationGuide, calculationWorkspaceHref, WIND_ASSESSMENT_ID, type CatalogueDefinition as Definition } from "@/lib/calculation-catalogue";
import { connectionsForCalculation, engineeringConnectionLabel, type EngineeringConnection } from "@/lib/engineering-module-contracts";

type Project = { id: string; name: string; project_number: string | null; address: string | null };

function titleCase(value: string) {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reportedRevision(value?: string | null) {
  return value && value !== "unknown" ? value : "Not reported";
}

export function CalculationLibrary({
  projects,
  canCreateProject,
  hasWorkspaceMembership,
  initialQuery,
  initialProjectId,
}: {
  projects: Project[];
  canCreateProject: boolean;
  hasWorkspaceMembership: boolean;
  initialQuery: string;
  initialProjectId: string;
}) {
  const router = useRouter();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [connections, setConnections] = useState<EngineeringConnection[]>([]);
  const [connectionsAvailable, setConnectionsAvailable] = useState(true);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/calculations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load calculations.");
        if (!Array.isArray(payload)) throw new Error("The calculation library returned an invalid response.");
        return calculationCatalogue(payload as Definition[]);
      })
      .then((items) => {
        if (active) {
          setDefinitions(items);
          setSelectedId(items[0]?.id ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load calculations.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    fetch("/api/connections", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Dependency catalogue is not available.");
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("Invalid dependency catalogue.");
        return payload as EngineeringConnection[];
      })
      .then((items) => {
        if (active) {
          setConnections(items);
          setConnectionsAvailable(true);
        }
      })
      .catch(() => {
        if (active) {
          setConnections([]);
          setConnectionsAvailable(false);
        }
      });
    return () => { active = false; };
  }, [reloadKey]);

  const categories = useMemo(
    () => [...new Set(definitions.map((item) => item.category).filter(Boolean))].sort(),
    [definitions],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return definitions.filter((item) =>
      (category === "all" || item.category === category) &&
      (!normalized || `${item.name} ${item.description} ${item.category} ${item.standard?.name ?? ""} ${item.id}`.toLowerCase().includes(normalized)),
    );
  }, [category, definitions, query]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const guide = calculationGuide(selected?.id);
  const selectedConnections = selected ? connectionsForCalculation(connections, selected.id) : [];

  function useCalculation() {
    if (!selected || !projectId) return;
    router.push(calculationWorkspaceHref(selected.id, projectId));
  }

  function retryCatalog() {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="calculation-library" aria-labelledby="calculation-library-title">
      <header className="library-toolbar">
        <div>
          <p className="eyebrow">Calculation library</p>
          <h1 id="calculation-library-title">Choose a calculation</h1>
          <p>Browse versioned engineering modules, review their inputs, then add one to a project.</p>
        </div>
        {projects.length ? (
          <label className="library-project-select">
            Add to project
            <select aria-label="Add to project" aria-describedby="library-project-help" aria-required="true" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Choose a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_number ? `${project.project_number} · ` : ""}{project.name}
                </option>
              ))}
            </select>
            <small id="library-project-help" className="library-muted">Choose the project where this calculation and its linked inputs belong.</small>
          </label>
        ) : canCreateProject ? (
          <Link className="button button-secondary library-create-project" href="/dashboard/projects/new">
            Create a project <span aria-hidden="true">→</span>
          </Link>
        ) : !hasWorkspaceMembership ? (
          <Link className="button button-secondary library-create-project" href="/dashboard">
            Set up a workspace <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <p className="library-create-project-note">Ask a workspace owner, admin, or engineer to create a project.</p>
        )}
      </header>

      <div className="library-controls">
        <label className="library-search">
          <span className="sr-only">Search calculations</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, standard, or keyword" />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
          </select>
        </label>
        <span className="library-result-count" aria-live="polite">
          {loading
            ? "Loading…"
            : `${filtered.length} ${filtered.length === 1 ? "calculation" : "calculations"}`}
        </span>
      </div>

      {loading ? <div className="project-list-empty">Loading calculation library…</div> : null}
      {!loading && error ? (
        <div className="library-error" role="alert">
          <p>{error}</p>
          <button className="library-retry-button" type="button" onClick={retryCatalog}>Try again</button>
        </div>
      ) : null}
      {!loading && !error && !definitions.length ? (
        <div className="project-list-empty"><h2>No calculations available</h2><p>The runtime did not return any calculation definitions.</p></div>
      ) : null}
      {!loading && !error && definitions.length ? (
        <div className="library-layout">
          <div className="library-results" aria-label="Available calculations">
            {filtered.length ? filtered.map((item) => (
              <button className={`library-card${item.id === selected?.id ? " selected" : ""}`} key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selected?.id}>
                <span className="library-card-category">{titleCase(item.category || "Engineering")}</span>
                <strong>{item.name}</strong>
                <span>{calculationGuide(item.id)?.summary ?? item.description}</span>
                <small>{calculationGuide(item.id)?.scope ?? <>{item.standard?.name || "Engineering calculation"}{item.standard?.edition ? ` · ${item.standard.edition}` : ""}</>}</small>
              </button>
            )) : <div className="project-list-empty"><h2>No matches</h2><p>Try another search term or category.</p></div>}
          </div>

          <aside className="library-detail" aria-live="polite">
            {selected ? <>
              <p className="eyebrow">Calculation details</p>
              <h2>{selected.name}</h2>
              <p>{guide?.summary ?? selected.description}</p>
              {selectedConnections.length ? (
                <section className="library-integration-map" aria-label="Engineering calculation connections">
                  <h3>Connected engineering workflows</h3>
                  <p>Compatibility information only. Every transferred input still requires engineering review.</p>
                  <ul>
                    {selectedConnections.map((link) => (
                      <li key={link.id}>
                        <strong>{link.source_calculation_id === selected.id ? "Feeds" : "Uses"}: {link.source_calculation_id === selected.id ? link.target_calculation_id : link.source_calculation_id}</strong>
                        <span>{engineeringConnectionLabel(link)}</span>
                        <small>{link.reason}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : !connectionsAvailable ? (
                <p className="library-muted">Engineering dependency details are temporarily unavailable. Calculations remain accessible.</p>
              ) : null}
              {guide ? (
                <div className="library-guide">
                  <span className="library-scope-badge">{guide.scope}</span>
                  <div className="library-guide-columns">
                    <div><h3>You&apos;ll need</h3><ul>{guide.needs.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    <div><h3>You get</h3><ul>{guide.gives.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  </div>
                  <p className="library-muted">{guide.limits}</p>
                  <button className="button button-primary library-use-button" type="button" onClick={useCalculation} disabled={!projectId}>
                    {projectId ? `Open ${guide.title}` : "Choose a project to open"} <span aria-hidden="true">→</span>
                  </button>
                </div>
              ) : null}
              <details className="library-tech-details" open={!guide}>
                <summary>Engine and version details</summary>
              <dl>
                {selected.id === WIND_ASSESSMENT_ID ? (
                  <div><dt>Assessment</dt><dd>Combined wind calculation · six linked stages</dd></div>
                ) : <>
                  <div><dt>Definition</dt><dd><code>{selected.id}</code></dd></div>
                  <div><dt>Calculation version</dt><dd>{selected.version || "Not reported"}</dd></div>
                </>}
                <div><dt>Standard</dt><dd>{selected.standard?.name || "Not specified"}{selected.standard?.edition ? ` · ${selected.standard.edition}` : ""}</dd></div>
                <div><dt>Category</dt><dd>{titleCase(selected.category || "Engineering")}</dd></div>
                <div><dt>Engine</dt><dd>{[selected.plugin?.name ? `${selected.plugin.name}${selected.plugin.id ? ` (${selected.plugin.id})` : ""}` : selected.plugin?.id, selected.plugin?.version ? `v${selected.plugin.version}` : ""].filter(Boolean).join(" · ") || "Not reported"}</dd></div>
                <div><dt>Engine revision</dt><dd><code>{reportedRevision(selected.plugin?.revision)}</code></dd></div>
                <div><dt>Runtime</dt><dd>{[selected.runtime?.name, selected.runtime?.version ? `v${selected.runtime.version}` : ""].filter(Boolean).join(" · ") || "Not reported"}</dd></div>
                <div><dt>Runtime revision</dt><dd><code>{reportedRevision(selected.runtime?.revision)}</code></dd></div>
              </dl>
              </details>
              {selected.id === WIND_ASSESSMENT_ID ? <p className="library-muted">Includes site, wind region, terrain, shielding, topography and design wind speed. Each stage keeps its saved inputs, results and review history, and its outputs can feed linked calculations.</p> : null}
              {guide ? null : <h3>Inputs</h3>}
              {guide ? null : Object.entries(selected.input_schema?.properties ?? {}).length ? (
                <ul className="library-input-list">
                  {Object.entries(selected.input_schema?.properties ?? {}).map(([key, schema]) => (
                    <li key={key}>
                      <span className="library-input-name">{titleCase(key)}{selected.input_schema?.required?.includes(key) ? <b aria-label="required"> *</b> : null}</span>
                      <span className="library-input-meta"><small>{schema.type || "value"}{schema.unit ? ` · ${schema.unit}` : ""}</small></span>
                      {schema.description ? <span className="library-input-description">{schema.description}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="library-muted">Input details are supplied when the calculation is added.</p>}
              {guide ? null : <button className="button button-primary library-use-button" type="button" onClick={useCalculation} disabled={!projectId}>
                {projectId ? "Use in project" : "Choose a project to continue"} <span aria-hidden="true">→</span>
              </button>}
              {!projects.length ? (
                <p className="library-muted">
                  {hasWorkspaceMembership
                    ? "A project must exist before you can add a calculation."
                    : "Set up or join a workspace before you can add a calculation."}
                </p>
              ) : null}
            </> : <p>{filtered.length ? "Select a calculation to see its details." : "Adjust the filters to find a calculation."}</p>}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
