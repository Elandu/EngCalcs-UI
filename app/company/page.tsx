import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import "../landing.css";
import "../landing-v2.css";

export const metadata: Metadata = {
  title: "Company | EngCalcs",
  description:
    "The engineering problem, commercial product, current development progress and AI roadmap behind EngCalcs.",
};

const opportunities = [
  ["01", "The entry point", "Australian structural engineering teams preparing and revising calculations across multiple disconnected tools."],
  ["02", "The product", "A commercial subscription workspace for projects, calculations, linked inputs, engineering history and review."],
  ["03", "The distribution", "Direct engineering teams first; REST and MCP integration surfaces allow the same engines to support other software and workflows."],
  ["04", "The expansion", "Additional engineering modules can reuse the same execution, project, review and integration infrastructure."],
];

export default function CompanyPage() {
  return (
    <main className="landing-page landing-company">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Primary navigation">
            <Link href="/#problem">Problem</Link>
            <Link href="/#product">Product</Link>
            <Link href="/#ai">AI approach</Link>
            <Link href="/company" aria-current="page">Company</Link>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-signin" href="/login">Log in</Link>
            <Link className="landing-button landing-header-button" href="/signup">Open EngCalcs <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>
      <section className="landing-company-hero">
        <div className="landing-container landing-company-hero-grid">
          <div>
            <p className="landing-label">ENGCALCS / COMPANY OVERVIEW</p>
            <h1>Making engineering calculations <em>work together.</em></h1>
          </div>
          <div>
            <p>
              EngCalcs is an engineering software business developing a connected,
              AI-assisted calculation workspace. Our initial focus is Australian structural
              engineering, where design inputs, calculations, software and drawing
              revisions are often handled as disconnected pieces of work.
            </p>
            <p>
              The platform combines deterministic engineering engines with a commercial
              SaaS application. An AI coordination layer is being developed to interpret
              project information and help engineers manage the calculation workflow.
            </p>
          </div>
        </div>
      </section>
      <section className="landing-section landing-section-muted">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">THE PROBLEM WE START WITH</p>
            <h2>A design change should not mean reconstructing the calculation trail.</h2>
            <p>
              Engineers are responsible for the calculation, but much of their time
              is spent finding the right information, moving values between tools,
              and tracing which results need to be reconsidered when drawings change.
              Those steps are a recurring source of duplication and coordination risk.
            </p>
          </div>
          <div className="landing-company-example">
            <div><span className="landing-label">EXAMPLE WORKFLOW</span><strong>Site wind</strong><p>Establish actions from project and exposure inputs.</p></div>
            <div><span className="landing-label">NEXT</span><strong>Frame analysis</strong><p>Apply relevant loads and recover reactions and forces.</p></div>
            <div><span className="landing-label">THEN</span><strong>Section design</strong><p>Use the design actions in the appropriate member or section checks.</p></div>
          </div>
          <p className="landing-section-caption">This is the target connected workflow, not a claim that every calculation is linked or automatically designed today.</p>
        </div>
      </section>
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-business-head">
            <div className="landing-business-heading">
              <p className="landing-label">WHY THIS IS AN AI PRODUCT</p>
              <h2>The difficulty is understanding the engineering task, not asking AI to do arithmetic.</h2>
            </div>
            <p>
              EngCalcs is developing AI for drawing and model interpretation,
              cross-document reconciliation, calculation planning and revision
              impact analysis. Versioned numerical engines perform the actual
              calculations and engineers retain review and approval responsibility.
            </p>
          </div>
          <div className="landing-business-grid">
            <article><h3>Interpret</h3><p>Identify geometry, materials, levels, loads and conflicting information from project sources, for engineer confirmation.</p></article>
            <article><h3>Orchestrate</h3><p>Propose a sequence of applicable modules, dependencies and questions needed to undertake the work.</p></article>
            <article><h3>Trace</h3><p>Show how revised inputs affect related calculations and support controlled re-runs for review.</p></article>
          </div>
        </div>
      </section>
      <section className="landing-section landing-section-dark">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label landing-label-light">CURRENT BUILD STATUS</p>
            <h2>A software foundation exists. End-to-end AI design automation does not yet.</h2>
            <p>
              The current codebase includes a modular calculation runtime, REST and MCP
              interfaces, a browser workspace, saved runs and calculation provenance.
              Wind assessment, elastic frame analysis and limited steel/concrete section
              tools provide the engineering starting point.
            </p>
          </div>
          <div className="landing-company-status">
            <div><span className="landing-label landing-label-light">IMPLEMENTED</span><strong>Versioned calculation modules, API/MCP and engineering workspace</strong></div>
            <div><span className="landing-label landing-label-light">DEVELOPING</span><strong>Workflow linking, review experience and broader standards coverage</strong></div>
            <div><span className="landing-label landing-label-light">ROADMAP</span><strong>AI interpretation, planning and design revision intelligence</strong></div>
          </div>
        </div>
      </section>
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">COMMERCIAL STRATEGY</p>
            <h2>Start with structural engineering. Build a platform that can grow.</h2>
            <p>
              The intended business is proprietary commercial SaaS, not a
              publicly maintained calculator library. Subscription pricing,
              adoption and customer demand remain to be validated.
            </p>
          </div>
          <div className="landing-opportunity-list">
            {opportunities.map(([index, title, body]) => (
              <article key={index}><span className="landing-label">{index}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
          <p className="landing-section-caption">No unverified revenue, customer-count, market-size or time-saved statistics are used in this overview.</p>
        </div>
      </section>
      <section className="landing-cta">
        <div className="landing-container landing-cta-inner">
          <div>
            <p className="landing-label">ENGCALCS / THE PRODUCT</p>
            <h2>See what has been built.</h2>
            <p>Explore the product overview or open the engineering workspace.</p>
          </div>
          <div className="landing-cta-actions">
            <Link className="landing-button" href="/#product">Explore capabilities <span aria-hidden="true">↗</span></Link>
            <Link className="landing-button landing-button-outline" href="/signup">Open EngCalcs <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <Brand />
            <p>Commercial engineering software with deterministic calculation engines
            and a developing AI coordination layer.</p>
            <div className="landing-footer-links">
              <Link href="/">Product</Link>
              <Link href="/#ai">AI approach</Link>
              <Link href="/login">Log in</Link>
            </div>
          </div>
          <div className="landing-legal">© 2026 EngCalcs. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
