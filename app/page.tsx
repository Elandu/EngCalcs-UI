import Link from "next/link";
import { Brand } from "@/components/brand";

const workflowSteps = [
  ["01", "Describe the design", "Start with the engineering task in plain language. EngCalcs turns intent into a structured design brief."],
  ["02", "AI builds the workflow", "The AI selects the required calculation modules, identifies dependencies and asks only for missing inputs."],
  ["03", "Deterministic engines run", "Standards-based calculation engines execute the maths. Results do not rely on LLM arithmetic."],
  ["04", "Engineer reviews and issues", "Assumptions, references, formulas, warnings and provenance stay visible before anything is issued."],
];

const calculatorGroups = [
  ["Wind", "AS/NZS 1170.2", "Regional wind speed, terrain, shielding and design wind speed."],
  ["Loads", "AS/NZS 1170", "Permanent, imposed and environmental actions linked into the project model."],
  ["Steel", "AS 4100", "Member and connection design with visible utilisation and workings."],
  ["Concrete", "AS 3600", "Member and footing design with transparent assumptions."],
  ["Timber", "AS 1720", "Structural timber design with project-preferred sections."],
  ["Foundations", "Project linked", "Carry reactions through to footing and retaining calculations."],
];

const features = [
  ["AI workflow planning", "Describe what you need designed. EngCalcs decomposes the task into the calculation chain required to solve it."],
  ["Deterministic calculation engines", "The AI never invents the final engineering maths. Versioned engines execute the standards-based calculations."],
  ["Missing-input discovery", "EngCalcs identifies what it still needs and asks targeted questions instead of making hidden assumptions."],
  ["Connected calculation graph", "Outputs from one calculation can become typed inputs to the next, preserving source and dependency information."],
  ["Transparent review", "Inputs, assumptions, formulas, warnings, references and overrides stay attached to every result."],
  ["Issue-ready outputs", "Turn the reviewed calculation graph into consistent calculation packs with traceable provenance."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="container nav-wrap">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#workflow">AI workflow</a>
            <a href="#platform">Platform</a>
            <a href="#calculators">Engines</a>
            <a href="#teams">For teams</a>
          </nav>
          <div className="nav-actions">
            <Link className="nav-login" href="/login">Log in</Link>
            <Link className="button button-small button-primary" href="/signup">Join early access</Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span>AI-native engineering workspace</span>
              <span className="kicker-dot" />
              Built for Australian practice
            </div>
            <h1>Describe the design. <em>EngCalcs builds the calculation workflow.</em></h1>
            <p className="hero-lead">
              EngCalcs uses AI to understand the engineering task, plan the calculation chain and
              orchestrate standards-based tools. Deterministic engines run the maths. You review,
              verify and issue the result.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/signup">Create a workspace <span aria-hidden="true">→</span></Link>
              <a className="button button-secondary" href="#workflow">See the AI workflow</a>
            </div>
            <div className="hero-proof">
              <span><b>AI plans</b> the workflow</span>
              <span><b>Code runs</b> the calculations</span>
              <span><b>Engineers keep</b> control</span>
            </div>
          </div>

          <div className="product-window" aria-label="EngCalcs AI workflow preview">
            <div className="window-bar">
              <span /><span /><span />
              <div className="window-address">EngCalcs / AI design workflow</div>
            </div>
            <div className="app-preview">
              <aside className="preview-sidebar">
                <div className="mini-logo">EC</div>
                <div className="side-block active"><i />AI workflow</div>
                <div className="side-block"><i />Project</div>
                <div className="side-block"><i />Calculations</div>
                <div className="side-block"><i />Reports</div>
                <div className="side-divider" />
                <div className="project-node"><span />Design brief</div>
                <div className="project-node child selected"><span />Workflow plan</div>
                <div className="project-node child"><span />Wind actions</div>
                <div className="project-node child"><span />Steel beam B1</div>
              </aside>
              <div className="preview-main">
                <div className="preview-topline">
                  <div>
                    <small>AI DESIGN BRIEF</small>
                    <strong>Lintel over 4.2 m opening</strong>
                  </div>
                  <button>Review workflow</button>
                </div>
                <div className="calc-grid">
                  <section className="calc-panel">
                    <h3>Engineer request</h3>
                    <p style={{ fontSize: 10, lineHeight: 1.6, color: "#40564d", margin: 0 }}>
                      Design a steel lintel over a 4.2 m opening supporting brick veneer and a tiled
                      roof. Two-storey Class 1 dwelling in Shellharbour.
                    </p>
                    <div className="linked-input" style={{ marginTop: 14 }}>
                      <b>AI status</b><span>Planning</span>
                      <small>2 inputs require confirmation</small>
                    </div>
                  </section>
                  <section className="calc-panel result-panel">
                    <div className="result-status">AI PLAN</div>
                    <small>Calculation workflow</small>
                    <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
                      <div className="trace-row"><span>1</span><b>Wind actions</b></div>
                      <div className="trace-row"><span>2</span><b>Gravity loads</b></div>
                      <div className="trace-row"><span>3</span><b>Load combinations</b></div>
                      <div className="trace-row"><span>4</span><b>Steel member check</b></div>
                      <div className="trace-row"><span>5</span><b>Deflection + reactions</b></div>
                    </div>
                  </section>
                </div>
                <div className="audit-line">
                  <span className="audit-dot" />
                  AI plans the workflow · deterministic engines execute the calculations
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="container trust-row">
          <span>Designed around the standards Australian engineers use</span>
          <b>AS/NZS 1170</b><b>AS 4100</b><b>AS 3600</b><b>AS 1720</b><b>AS 3700</b>
        </div>
      </section>

      <section className="section" id="workflow">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">AI orchestrates. Engineering stays deterministic.</p>
            <h2>From design intent to calculation pack, without stitching tools together by hand.</h2>
            <p>
              EngCalcs uses AI where it adds value: interpreting the task, planning the workflow,
              identifying missing information and coordinating the calculation graph. The engineering
              maths stays inside reviewable, versioned calculation engines.
            </p>
          </div>
          <div className="feature-grid">
            {workflowSteps.map(([number, title, text]) => (
              <article className="feature-card" key={title}>
                <div className="feature-number">{number}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section workflow-section" id="platform">
        <div className="container workflow-grid">
          <div className="section-heading left-heading">
            <p className="eyebrow">The calculation graph</p>
            <h2>AI can plan across disciplines because the calculations are connected.</h2>
            <p>
              A design is not a collection of isolated calculators. EngCalcs keeps the load path,
              dependencies and provenance attached so the AI can coordinate the work without hiding
              how the answer was produced.
            </p>
            <ul className="check-list">
              <li>AI selects the calculation modules required for the task</li>
              <li>Outputs become typed inputs to downstream calculations</li>
              <li>Upstream changes flag affected calculations for review</li>
              <li>Every value retains its source, standard and engine version</li>
            </ul>
          </div>
          <div className="flow-card">
            <div className="flow-node accent"><small>AI PLANNER</small><b>Design workflow</b><span>Task decomposed into 5 checks</span></div>
            <div className="flow-line"><span>requires</span></div>
            <div className="flow-node"><small>WIND / LOADS</small><b>Design actions</b><span>AS/NZS 1170</span></div>
            <div className="flow-line"><span>feeds</span></div>
            <div className="flow-node"><small>STEEL</small><b>Beam B1</b><span>AS 4100 member checks</span></div>
            <div className="flow-line"><span>reactions</span></div>
            <div className="flow-node"><small>DOWNSTREAM</small><b>Connection / support</b><span>Linked for further design</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Why AI belongs here</p>
            <h2>Less time deciding which spreadsheet to open next.</h2>
            <p>
              The AI is not replacing engineering judgement. It removes the repetitive coordination
              around the judgement: task decomposition, missing inputs, calculation sequencing,
              cross-checks and report assembly.
            </p>
          </div>
          <div className="feature-grid">
            {features.map(([title, text], index) => (
              <article className="feature-card" key={title}>
                <div className="feature-number">0{index + 1}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-soft" id="calculators">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Deterministic calculation engines</p>
              <h2>The AI does not get to make up the maths.</h2>
            </div>
            <p>
              Each calculation engine is versioned, standards-referenced and independently reviewable.
              EngCalcs orchestrates them as one workflow while preserving the workings.
            </p>
          </div>
          <div className="calculator-grid">
            {calculatorGroups.map(([title, standard, description], index) => {
              const isWindPreview = index === 0;
              return (
                <article className={`calculator-card ${isWindPreview ? "live" : "planned"}`} key={title}>
                  <div className="calculator-top">
                    <span>{isWindPreview ? "AVAILABLE IN PREVIEW" : "PLANNED"}</span>
                    <b>0{index + 1}</b>
                  </div>
                  <h3>{title}</h3>
                  <small>{standard}</small>
                  <p>{description}</p>
                  {isWindPreview ? (
                    <Link className="button button-light button-small" href="/dashboard/calculations?q=wind">
                      Open wind calculations <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section team-section" id="teams">
        <div className="container team-grid">
          <div>
            <p className="eyebrow">For engineering teams</p>
            <h2>AI assistance without giving up reviewability.</h2>
          </div>
          <div className="team-copy">
            <p>
              Engineers remain responsible for the design. EngCalcs gives teams a consistent way to
              plan, calculate, review and issue work while keeping assumptions, overrides and
              calculation provenance visible.
            </p>
            <div className="team-points">
              <span>AI workflow planning</span><span>Roles & review states</span>
              <span>Reusable project defaults</span><span>Company report branding</span>
              <span>Calculation history</span><span>API access</span>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-card">
          <div>
            <p className="eyebrow">EngCalcs early access</p>
            <h2>AI plans the calculation. Code proves the answer.</h2>
            <p>
              Start with wind and linked project calculations. The platform expands into loads,
              members, connections, foundations and end-to-end engineering design workflows.
            </p>
          </div>
          <div className="cta-actions">
            <Link className="button button-light" href="/signup">Create a workspace</Link>
            <a className="text-link" href="#workflow">See how it works →</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <Brand />
          <p>AI-orchestrated engineering calculations, deterministically verified.</p>
          <div>
            <a href="#workflow">AI workflow</a>
            <a href="#calculators">Engines</a>
            <Link href="/login">Log in</Link>
          </div>
          <small>© 2026 EngCalcs</small>
        </div>
      </footer>
    </main>
  );
}
