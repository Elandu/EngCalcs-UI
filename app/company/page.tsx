import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import "../landing.css";
import "../landing-v2.css";

export const metadata: Metadata = {
  title: "Company | EngCalcs",
  description:
    "EngCalcs is building an AI-assisted engineering calculation workspace, starting with Australian structural design. Learn what exists, how AI will be used and why the problem matters.",
};

const milestones = [
  {
    status: "BUILT",
    title: "A real calculation foundation",
    body: "A modular Python runtime with versioned calculation engines, REST and MCP interfaces, and a SaaS workspace with authenticated projects and saved calculation records.",
  },
  {
    status: "BUILT / DEFINED SCOPE",
    title: "Structural engineering starting point",
    body: "Australian site-wind assessment, reviewed wind-to-frame loads, 2D/3D elastic frame analysis and limited steel/concrete section calculations. This is not a complete code-design suite.",
  },
  {
    status: "DEVELOPMENT DIRECTION",
    title: "AI with engineering context",
    body: "Extracting project information from drawings and schedules, proposing traceable structured inputs, recognising design revisions and identifying calculations that need an engineer's review.",
  },
];

const business = [
  {
    label: "INITIAL CUSTOMER",
    title: "Structural engineering consultancies",
    body: "Start with Australian consulting engineers who regularly calculate, revise and document site wind actions, structural response and member checks.",
  },
  {
    label: "COMMERCIAL MODEL",
    title: "Subscription software",
    body: "A commercial engineering workspace for individuals and teams. API and integration offerings are a potential additional channel as the platform and demand develop.",
  },
  {
    label: "LONG-TERM EXPANSION",
    title: "More disciplines, one calculation record",
    body: "Extend beyond the initial structural workflow by adding specialist engines to the same project, provenance, review and integration foundation.",
  },
];

const aiFlow = [
  {
    step: "01",
    title: "Engineering information comes in",
    body: "Drawing revisions, schedules, site conditions and engineer instructions provide the design context. Today's product accepts structured inputs; document extraction is a future capability.",
  },
  {
    step: "02",
    title: "AI proposes structured work",
    body: "The planned AI layer will identify relevant dimensions and loads, cite their source locations, reconcile discrepancies and propose a calculation plan for engineer confirmation.",
  },
  {
    step: "03",
    title: "Engineering code calculates",
    body: "A versioned, deterministic engine performs the actual mathematics. The engineer reviews assumptions and outputs rather than treating generated text as an approved calculation.",
  },
  {
    step: "04",
    title: "The design history is retained",
    body: "Saved runs and linked inputs form an engineering record. The longer-term goal is to identify when a new document or revised input means a downstream result needs review.",
  },
];

export default function CompanyPage() {
  return (
    <main className="landing-page landing-company">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Primary navigation">
            <Link href="/#problem">The problem</Link>
            <Link href="/#product">The product</Link>
            <a href="#approach">How AI fits</a>
            <a href="#model">Business model</a>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-signin" href="/login">Log in</Link>
            <Link className="landing-button landing-header-button" href="/signup">Explore EngCalcs <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>

      <section className="landing-company-hero">
        <div className="landing-container landing-company-hero-grid">
          <div>
            <p className="landing-label">ENGCALCS / THE COMPANY</p>
            <h1>The engineering calculation is only as good as <em>the information behind it.</em></h1>
          </div>
          <div>
            <p>
              EngCalcs is building the connected calculation workspace for engineering practice.
              The product starts with structural calculations and the project record surrounding them:
              inputs, assumptions, linked results and run history.
            </p>
            <p>
              Our next step is an AI layer that understands engineering documents and helps engineers
              organise, check and revise the information before it reaches deterministic calculation
              engines. The ambition is substantial, but the software is being built in verifiable stages.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="problem">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PROBLEM / A FAMILIAR DESIGN REVISION</p>
            <h2>A roof changes. Which calculations need to change with it?</h2>
            <p>
              The drawings, site conditions, adopted loads, structural models and design checks
              often live in different places. An engineer must reconstruct the trail, work out
              what has changed, and repeat the affected calculations without losing the record
              of the earlier design. The friction is not a lack of formulas; it is the missing
              connection between the information and the engineering work.
            </p>
          </div>
          <div className="landing-company-example">
            <div>
              <span className="landing-label">01 / SOURCE</span>
              <strong>Site and drawings</strong>
              <p>Exposure, building geometry and relevant design changes must be established and reviewed.</p>
            </div>
            <div>
              <span className="landing-label">02 / ENGINEERING</span>
              <strong>Wind and frame actions</strong>
              <p>Loads are derived and applied to the structural model using supported calculation engines.</p>
            </div>
            <div>
              <span className="landing-label">03 / REVIEW</span>
              <strong>Design checks and history</strong>
              <p>The engineer assesses affected outputs and retains the assumptions behind the updated work.</p>
            </div>
          </div>
          <p className="landing-section-caption">
            This illustrates the engineering process EngCalcs is working to connect. Automated drawing-to-approved-design execution is not currently available.
          </p>
        </div>
      </section>

      <section className="landing-section" id="approach">
        <div className="landing-container landing-split">
          <div className="landing-split-copy">
            <p className="landing-label">WHY THIS NEEDS AI</p>
            <h2>Engineers don't need AI to guess the answer. They need help assembling the question.</h2>
            <p>
              Structural calculations are deterministic once the correct model, inputs and assumptions
              are established. Much of the difficult coordination happens before and after that
              numerical step. Our planned AI layer focuses on interpreting project context and
              helping engineers manage the calculation sequence.
            </p>
            <p className="landing-split-note">
              AI interpretation, drawing comparison and automated revision-impact detection are
              development goals. The current platform executes defined numerical modules and retains project run records.
            </p>
          </div>
          <div className="landing-steps">
            {aiFlow.map((item) => (
              <article className="landing-step" key={item.step}>
                <span className="landing-step-index">{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-dark" id="built">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label landing-label-light">PRODUCT EVIDENCE / OCTOBER 2026</p>
            <h2>There is an engineering platform behind the idea.</h2>
            <p>
              The starting point is real calculation infrastructure, not an AI prompt wrapped
              around generic design advice. EngCalcs already has modules, execution interfaces
              and a browser workspace. Its coverage and limitations are stated explicitly.
            </p>
          </div>
          <div className="landing-company-status">
            {milestones.map((item) => (
              <div key={item.title}>
                <span className="landing-label landing-label-light">{item.status}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-muted" id="founder">
        <div className="landing-container">
          <div className="landing-business-head">
            <div className="landing-business-heading">
              <p className="landing-label">ENGINEERING-LED FROM THE START</p>
              <h2>Designed around professional accountability, not AI autonomy.</h2>
            </div>
            <p>
              EngCalcs is led by an Australian Chartered Professional Engineer with experience in
              forensic engineering, where reconstructing the assumptions and decisions behind
              a design is a practical part of the work. That perspective informs the product:
              an answer must be traceable, its limits must be explicit, and its engineering review
              must remain with the responsible professional.
            </p>
          </div>
          <div className="landing-business-grid">
            <article>
              <h3>Defined calculation scope</h3>
              <p>Individual modules must state what is implemented and where additional checks or engineering judgement are required.</p>
            </article>
            <article>
              <h3>Provenance, not mystery</h3>
              <p>Keep a record of calculation inputs, engine versions, source runs and available review history.</p>
            </article>
            <article>
              <h3>Human decisions remain visible</h3>
              <p>AI should propose and help coordinate work. An engineer must confirm assumptions and approve professional use.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section" id="model">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE BUSINESS / WHERE WE START</p>
            <h2>Start with a repeatable structural workflow. Build a broader engineering platform.</h2>
            <p>
              The first market is Australian structural engineering consultancies that use separate
              tools to establish design actions, model structural response and document the result.
              The commercial product is a subscription-based workspace, with integration services
              as a longer-term opportunity. Pricing and demand are still being validated.
            </p>
          </div>
          <div className="landing-roadmap-grid">
            {business.map((item) => (
              <article className="landing-roadmap" key={item.title}>
                <span className="landing-label">{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <p className="landing-section-caption">
            Customer adoption, time savings, revenue and total addressable market have not been presented as established metrics.
            The next commercial milestone is a validated workflow and engineering-practice pilot evidence.
          </p>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <div>
            <p className="landing-label">ENGCALCS / THE ENGINEERING WORKSPACE</p>
            <h2>One place for the calculation and the story behind it.</h2>
            <p>
              See the available tools and how they form the foundation for more connected,
              AI-assisted engineering work.
            </p>
          </div>
          <div className="landing-cta-actions">
            <Link className="landing-button" href="/#product">See the product <span aria-hidden="true">↗</span></Link>
            <Link className="landing-button landing-button-outline" href="/signup">Explore the workspace <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <Brand />
            <p>
              A commercial engineering calculation platform being built from professional
              practice, with deterministic numerical engines and an AI coordination roadmap.
            </p>
            <div className="landing-footer-links">
              <Link href="/">Product</Link>
              <Link href="/#workflow">Workflow</Link>
              <Link href="/#ai">AI strategy</Link>
              <Link href="/login">Log in</Link>
            </div>
          </div>
          <div className="landing-legal">© 2026 EngCalcs. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
