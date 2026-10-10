import Link from "next/link";
import { Brand } from "@/components/brand";
import { LandingProductPreview } from "@/components/landing-product-preview";
import "./landing.css";
import "./landing-v2.css";

const problems = [
  {
    number: "01",
    title: "Project data lives in fragments",
    body: "Geometry sits in drawings. Loads sit in spreadsheets. Member checks sit in separate software. The engineer has to keep those inputs consistent by hand.",
  },
  {
    number: "02",
    title: "A small revision creates rework",
    body: "When an opening, roof arrangement or load changes, the engineer must identify every affected calculation, update its inputs and check the downstream consequences.",
  },
  {
    number: "03",
    title: "The reasoning gets lost",
    body: "A result alone does not explain where its inputs came from, which engine produced it, or whether it still reflects the latest design.",
  },
];

const implemented = [
  {
    label: "AVAILABLE",
    title: "Wind assessment",
    scope: "AS/NZS 1170.2",
    body: "Site wind assessments with staged terrain, shielding and design wind speed inputs. Selected AS 4055 housing calculations are preliminary.",
  },
  {
    label: "AVAILABLE",
    title: "Frame analysis",
    scope: "Elastic structural analysis",
    body: "Model 2D and 3D frames using the PyNite solver, with loads, displacements, reactions and member force diagrams.",
  },
  {
    label: "AVAILABLE · LIMITED SCOPE",
    title: "Steel and concrete sections",
    scope: "AS 4100 and section mechanics",
    body: "Steel axial section capacity checks and reinforced concrete nominal bending calculations. These are not complete member-design or compliance suites.",
  },
  {
    label: "AVAILABLE",
    title: "Projects and calculation history",
    scope: "Saved work and linked inputs",
    body: "Save project calculations and run records, retain engine versions and provenance, and link selected results into downstream calculations.",
  },
];

const plannedAI = [
  {
    number: "01",
    title: "Read project information",
    body: "Interpret information from drawing sets, schedules and compatible model exports, retaining the original evidence for engineer review.",
  },
  {
    number: "02",
    title: "Build a coherent set of inputs",
    body: "Reconcile information across sources, identify conflicts or missing dimensions, and ask the engineer to confirm assumptions.",
  },
  {
    number: "03",
    title: "Plan the calculation workflow",
    body: "Identify which available engines are required, propose the calculation sequence and pass structured inputs between them.",
  },
  {
    number: "04",
    title: "Identify the effect of revisions",
    body: "Compare updated project information, flag affected calculations and propose re-runs before engineers approve revised results.",
  },
];

const progress = [
  {
    label: "BUILT",
    title: "Calculation infrastructure",
    body: "A modular Python runtime with versioned calculation modules, a REST API and an overarching MCP interface for software and AI integrations.",
  },
  {
    label: "BUILT / DEVELOPING",
    title: "Engineering workspace",
    body: "A browser-based application for projects, calculation workflows, saved results, review history and selected linked calculation inputs.",
  },
  {
    label: "DEVELOPMENT ROADMAP",
    title: "AI project intelligence",
    body: "Automated interpretation of design information, cross-document reconciliation, calculation planning and revision impact detection.",
  },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Primary navigation">
            <a href="#problem">The problem</a>
            <a href="#product">The product</a>
            <a href="#ai">How AI fits</a>
            <Link href="/company">Company</Link>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-signin" href="/login">Log in</Link>
            <Link className="landing-button landing-header-button" href="/signup">Open EngCalcs <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-heading">
        <div className="landing-container landing-hero-grid">
          <div>
            <p className="landing-label">ENGINEERING CALCULATION SOFTWARE · AUSTRALIA</p>
            <h1 id="landing-heading">Engineering calculations, <em>connected to the project.</em></h1>
            <p className="landing-lead">
              EngCalcs is building a single workspace for the calculations behind an engineering design.
              It connects project inputs, calculation engines and review history, so engineers spend less
              time transferring data between tools and checking what changed.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button" href="/signup">Explore the workspace <span aria-hidden="true">↗</span></Link>
              <a className="landing-button landing-button-outline" href="#product">See what is built <span aria-hidden="true">↓</span></a>
            </div>
            <p className="landing-stage">
              Early-stage platform with working engineering calculation modules.
              AI-assisted drawing interpretation and automatic design coordination are in development.
            </p>
          </div>

          <LandingProductPreview />
        </div>
      </section>

      <div className="landing-evidence" aria-label="EngCalcs design principles">
        <div className="landing-container landing-evidence-grid">
          <div className="landing-evidence-item">
            <span className="landing-label">ENGINEERING FIRST</span>
            <strong>Deterministic calculations</strong>
            <p>Code runs the mathematics, not a language model.</p>
          </div>
          <div className="landing-evidence-item">
            <span className="landing-label">DESIGNED FOR PRACTICE</span>
            <strong>Australian standards</strong>
            <p>Starting with structural engineering workflows.</p>
          </div>
          <div className="landing-evidence-item">
            <span className="landing-label">REVIEWABLE BY DESIGN</span>
            <strong>Inputs, versions and provenance</strong>
            <p>Engineers stay accountable for the design.</p>
          </div>
        </div>
      </div>

      <section className="landing-section" id="problem">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PROBLEM</p>
            <h2>Engineering software calculates well. The work between calculations is still manual.</h2>
            <p>
              A structural design is not one calculation. It is a chain of decisions and inputs shared
              across drawings, standards, models, spreadsheets and specialised tools. Keeping that chain
              consistent takes time, and design revisions make the problem worse.
            </p>
          </div>
          <div className="landing-problems">
            {problems.map((item) => (
              <article className="landing-problem" key={item.number}>
                <span className="landing-label">{item.number} / WORKFLOW FRICTION</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="product">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PRODUCT / CURRENT CAPABILITIES</p>
            <h2>Start with useful engineering tools. Connect them as the project grows.</h2>
            <p>
              EngCalcs already includes a calculation runtime and browser workspace. The starting point
              is a practical set of structural engineering tools with saved work, reviewable inputs and
              selectively linked results. The scope of each engine is stated rather than implied.
            </p>
          </div>
          <div className="landing-available-grid">
            {implemented.map((item) => (
              <article className="landing-capability" key={item.title}>
                <span className="landing-label">{item.label}</span>
                <h3>{item.title}</h3>
                <strong className="landing-scope">{item.scope}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="landing-section-caption">
            Availability refers to implementation in the product code, not independent certification,
            complete standard coverage or autonomous design approval.
          </p>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="ai">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label landing-label-light">WHERE ARTIFICIAL INTELLIGENCE FITS</p>
            <h2>Use AI to understand the project. Use engineering code to calculate it.</h2>
            <p>
              The real opportunity for AI is organising the information around a calculation:
              reading design documents, identifying relevant data, finding missing assumptions and
              coordinating the next calculation. This is the AI layer we are developing.
            </p>
          </div>
          <div className="landing-ai-grid">
            <div className="landing-ai-list">
              {plannedAI.map((item) => (
                <article className="landing-ai-item" key={item.number}>
                  <span>{item.number}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <aside className="landing-boundary">
              <p className="landing-label">THE TRUST BOUNDARY</p>
              <h3>AI can propose a workflow. It cannot sign off an engineering result.</h3>
              <p>
                EngCalcs separates AI interpretation from numerical execution. Engineering calculations
                are performed by explicit, versioned calculation engines. Engineers must be able to
                inspect and correct inputs, assumptions and outputs before using the results.
              </p>
              <strong>AI-assisted coordination is planned; the deterministic calculation foundation is already being built and used.</strong>
            </aside>
          </div>
        </div>
      </section>

      <section className="landing-section" id="roadmap">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">BUILD PROGRESS</p>
            <h2>There is a working engineering foundation behind the ambition.</h2>
            <p>
              EngCalcs is being developed in stages. We distinguish software that exists today from
              the automated design workflow the platform is working towards.
            </p>
          </div>
          <div className="landing-roadmap-grid">
            {progress.map((item) => (
              <article className="landing-roadmap" key={item.title}>
                <span className="landing-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="practice">
        <div className="landing-container">
          <div className="landing-business-head">
            <div className="landing-business-heading">
              <p className="landing-label">ENGINEERING PRACTICE</p>
              <h2>Built for the work between the calculations.</h2>
            </div>
            <p>
              EngCalcs is being developed around the everyday needs of consulting engineers:
              transparent inputs, repeatable methods, linked design work and a reviewable record
              of what was calculated. AI is a supporting layer, not a substitute for judgement.
            </p>
          </div>
          <div className="landing-business-grid">
            <article><h3>Understand the input</h3><p>Keep assumptions, units and the engineering context with the calculation.</p></article>
            <article><h3>Keep work connected</h3><p>Link selected calculation outputs to downstream checks without retyping the same values.</p></article>
            <article><h3>Revisit a decision</h3><p>Retain versioned runs, provenance and the state of previous engineering work.</p></article>
          </div>
          <p className="landing-company-link">Interested in the business behind EngCalcs? <Link href="/company">Read our company overview <span aria-hidden="true">↗</span></Link></p>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <div>
            <p className="landing-label">ENGCALCS · EARLY STAGE</p>
            <h2>Less time reconciling calculations. More time engineering.</h2>
            <p>
              Explore the current workspace and calculation tools, or learn how the platform will
              connect engineering design information with AI-assisted workflows.
            </p>
          </div>
          <div className="landing-cta-actions">
            <Link className="landing-button" href="/signup">Create a workspace <span aria-hidden="true">↗</span></Link>
            <a className="landing-button landing-button-outline" href="#ai">Explore the AI approach <span aria-hidden="true">↑</span></a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <Brand />
            <p>EngCalcs is a commercial engineering software platform built around transparent,
              reproducible calculation workflows. All engineering outputs require professional review.</p>
            <div className="landing-footer-links">
              <a href="#problem">Problem</a>
              <a href="#product">Product</a>
              <a href="#ai">AI</a>
              <Link href="/login">Log in</Link>
              <Link href="/company">Company</Link>
            </div>
          </div>
          <div className="landing-legal">© 2026 EngCalcs. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
