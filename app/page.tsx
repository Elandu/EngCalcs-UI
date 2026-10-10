import Link from "next/link";

import { Brand } from "@/components/brand";
import { LandingProductPreview } from "@/components/landing-product-preview";
import "./landing.css";
import "./landing-v2.css";

const problems = [
  {
    number: "01",
    title: "The same inputs, entered again",
    body: "Geometry lives in drawings, exposure factors in wind calculations, and member actions in analysis software. Moving values between tools means recreating context and checking units by hand.",
  },
  {
    number: "02",
    title: "Every revision raises a question",
    body: "A change to a roof, opening or structural layout can affect several calculations. Engineers must find the right versions, identify what depends on what and decide which checks to revisit.",
  },
  {
    number: "03",
    title: "The result outlives its explanation",
    body: "A number in a report is only useful when its assumptions, source information, calculation version and review history can be recovered.",
  },
];

const workflow = [
  {
    number: "01",
    title: "Establish the design inputs",
    body: "Start with an engineering project, site information and the inputs needed for a defined calculation. The wind workflow guides engineers through region, terrain, shielding and topography.",
  },
  {
    number: "02",
    title: "Run explicit calculation engines",
    body: "Use the available wind and structural-analysis tools to produce numerical results. Reviewed wind loads can be transferred into a frame model rather than retyped into an unrelated file.",
  },
  {
    number: "03",
    title: "Keep the calculation record",
    body: "Save inputs, outputs and run versions against the project. Selected linked inputs retain the source run they were taken from, so engineers can see when upstream work has been revised.",
  },
];

const implemented = [
  {
    label: "WORKING MODULE",
    title: "Australian wind assessment",
    scope: "AS/NZS 1170.2",
    body: "A staged site workflow covering wind region, terrain, shielding, topography and design wind speed, with reviewed downstream frame-load inputs.",
  },
  {
    label: "WORKING MODULE",
    title: "Structural frame analysis",
    scope: "2D and 3D · PyNite",
    body: "Model frames, assign loads and inspect reactions, deflections and member forces using a deterministic analysis engine.",
  },
  {
    label: "LIMITED CALCULATION SCOPE",
    title: "Steel and concrete sections",
    scope: "AS 4100 axial checks · concrete section mechanics",
    body: "Available section-level tools support defined checks. Complete steel and concrete member-design suites are not yet available.",
  },
  {
    label: "PLATFORM FOUNDATION",
    title: "Project history and integrations",
    scope: "Saved runs · selected input links · REST / MCP",
    body: "Keep versioned calculation records with source provenance, project context and integration endpoints for engineering software.",
  },
];

const plannedAI = [
  {
    number: "01",
    title: "Input: engineering project documents",
    body: "An engineer provides drawings, schedules and project instructions. Relevant geometry, materials, loads and source references must be identified.",
  },
  {
    number: "02",
    title: "AI task: propose, reconcile, ask",
    body: "The planned AI layer will extract candidate values, flag contradictions or missing information, and suggest a calculation sequence. An engineer confirms what is adopted.",
  },
  {
    number: "03",
    title: "Output: calculations engineers can inspect",
    body: "Approved structured inputs are passed to versioned engineering engines. Results retain their assumptions and can be linked back to the project information that informed them.",
  },
];

const progress = [
  {
    label: "IMPLEMENTED",
    title: "A calculation platform, not just a concept",
    body: "Versioned Python calculation modules, a shared execution runtime, REST and MCP interfaces, and a browser application for projects and saved engineering work.",
  },
  {
    label: "IMPLEMENTED / LIMITED",
    title: "A connected structural starting point",
    body: "Wind calculations, frame analysis, selected section checks and source-linked run records. Each calculation is described within its implemented technical scope.",
  },
  {
    label: "IN DEVELOPMENT",
    title: "AI-assisted engineering coordination",
    body: "Drawing and schedule interpretation, structured input proposals, source-evidence reconciliation and change-impact workflows. These are not represented as shipped automation.",
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
            <a href="#workflow">How it works</a>
            <a href="#product">Product</a>
            <a href="#ai">AI approach</a>
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
            <p className="landing-label">ENGINEERING SOFTWARE · BUILT FOR AUSTRALIAN STRUCTURAL PRACTICE</p>
            <h1 id="landing-heading">Engineering calculations, <em>without the disconnected work.</em></h1>
            <p className="landing-lead">
              EngCalcs brings engineering inputs, calculations and their history into one project
              workspace. Start with real Australian wind and structural-analysis tools. We are
              building the AI layer that will help engineers turn project documents and design
              changes into reviewable calculation workflows.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button" href="/signup">Explore the workspace <span aria-hidden="true">↗</span></Link>
              <a className="landing-button landing-button-outline" href="#workflow">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="landing-stage">
              Working calculation engines and saved project records are available today.
              AI-driven document interpretation and automatic revision coordination remain development goals.
            </p>
          </div>
          <LandingProductPreview />
        </div>
      </section>

      <div className="landing-evidence" aria-label="Engineering principles">
        <div className="landing-container landing-evidence-grid">
          <div className="landing-evidence-item">
            <span className="landing-label">ENGINEERING-LED</span>
            <strong>Built around the way engineers work</strong>
            <p>Start with defined structural calculations and real project requirements.</p>
          </div>
          <div className="landing-evidence-item">
            <span className="landing-label">DETERMINISTIC BY DESIGN</span>
            <strong>The engine does the mathematics</strong>
            <p>AI will assist with context and coordination, not invent engineering answers.</p>
          </div>
          <div className="landing-evidence-item">
            <span className="landing-label">TRACEABLE OUTPUTS</span>
            <strong>Keep the inputs with the result</strong>
            <p>Run history, provenance and selected calculation dependencies.</p>
          </div>
        </div>
      </div>

      <section className="landing-section" id="problem">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PROBLEM WE ARE SOLVING</p>
            <h2>The calculation is only part of the engineering work.</h2>
            <p>
              Engineering software is good at solving a defined problem. The work around it is
              harder to keep organised: finding the correct inputs, transferring values between
              tools, reviewing assumptions and reconstructing what changed when a design is revised.
              For small and mid-sized consultancies, this coordination is still often manual.
            </p>
          </div>
          <div className="landing-problems">
            {problems.map((item) => (
              <article className="landing-problem" key={item.number}>
                <span className="landing-label">{item.number} / ENGINEERING FRICTION</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="workflow">
        <div className="landing-container landing-split">
          <div className="landing-split-copy">
            <p className="landing-label">ONE PROJECT / LINKED ENGINEERING WORK</p>
            <h2>A wind calculation should not end as an isolated number.</h2>
            <p>
              A site's wind conditions inform design actions. Those actions are applied to
              a frame. Its results inform later member checks. EngCalcs is built around that
              chain of engineering work, starting with real wind-to-frame functionality.
            </p>
            <p className="landing-split-note">
              The full end-to-end design process is not yet automated. Calculation coverage,
              load assumptions and member checks remain subject to engineer review.
            </p>
          </div>
          <div className="landing-steps">
            {workflow.map((item) => (
              <article className="landing-step" key={item.number}>
                <span className="landing-step-index">{item.number}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="product">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PRODUCT / AVAILABLE TODAY</p>
            <h2>Real engineering tools, with the project context kept alongside them.</h2>
            <p>
              EngCalcs is an early-stage commercial software platform, not a collection of AI-generated
              calculations. Its numerical engines are explicit, versioned and limited to declared
              engineering functions. The workspace connects these tools to projects and saved run records.
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
            Available means implemented in the platform, not independently certified,
            comprehensive standards coverage or autonomous engineering sign-off.
          </p>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="ai">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label landing-label-light">THE AI STRATEGY / IN DEVELOPMENT</p>
            <h2>AI to understand the project. Engineering engines to calculate it.</h2>
            <p>
              We are not building a chatbot that guesses structural capacity. The opportunity
              is to convert unstructured project information into organised, source-referenced
              inputs that an engineer can check before an approved calculation is executed.
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
              <p className="landing-label">THE ENGINEERING TRUST BOUNDARY</p>
              <h3>AI proposes the inputs. An engineer decides what gets adopted.</h3>
              <p>
                Engineering calculations are executed by explicit numerical modules, not a
                language model. Inputs and assumptions must remain inspectable, and every
                output must be reviewable before it is used for professional design.
              </p>
              <strong>The deterministic calculation foundation exists. AI extraction, reconciliation and revision intelligence are future product capabilities.</strong>
            </aside>
          </div>
        </div>
      </section>

      <section className="landing-section" id="roadmap">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">WHAT WE HAVE BUILT / WHAT COMES NEXT</p>
            <h2>A working foundation with a focused direction.</h2>
            <p>
              The long-term goal is a calculation workspace that can understand which
              engineering decisions depend on which project inputs. We are building towards
              that goal in defined steps rather than claiming the entire workflow is automated.
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
              <p className="landing-label">BUILT FROM ENGINEERING PRACTICE</p>
              <h2>More time checking the design. Less time reconstructing the work.</h2>
            </div>
            <p>
              EngCalcs starts with a problem familiar to structural engineers: the
              need to demonstrate not only a result, but which inputs, assumptions
              and revisions produced it. Our first focus is Australian structural
              consulting, with a modular foundation for broader engineering disciplines.
            </p>
          </div>
          <div className="landing-business-grid">
            <article><h3>For practising engineers</h3><p>Defined calculation modules, familiar units and clear scope limitations.</p></article>
            <article><h3>For the reviewer</h3><p>Retained inputs, results, versions and the source of linked values.</p></article>
            <article><h3>For a growing practice</h3><p>A shared project workspace and integration architecture designed to expand beyond individual spreadsheets.</p></article>
          </div>
          <p className="landing-company-link">
            Interested in the business and product roadmap?
            <Link href="/company">Explore the company overview <span aria-hidden="true">↗</span></Link>
          </p>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <div>
            <p className="landing-label">ENGCALCS / EARLY STAGE</p>
            <h2>Make the calculation part of the project, not another separate file.</h2>
            <p>
              Explore the available engineering tools and the approach behind an AI-assisted,
              revision-aware calculation workspace.
            </p>
          </div>
          <div className="landing-cta-actions">
            <Link className="landing-button" href="/signup">Explore the workspace <span aria-hidden="true">↗</span></Link>
            <Link className="landing-button landing-button-outline" href="/company">Why we are building it <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <Brand />
            <p>
              Commercial engineering calculation software for a more connected, reviewable
              design workflow. Engineering outputs require professional review.
            </p>
            <div className="landing-footer-links">
              <a href="#product">Product</a>
              <a href="#workflow">Workflow</a>
              <a href="#ai">AI approach</a>
              <Link href="/company">Company</Link>
              <Link href="/login">Log in</Link>
            </div>
          </div>
          <div className="landing-legal">© 2026 EngCalcs. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
