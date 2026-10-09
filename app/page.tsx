import Link from "next/link";
import { Brand } from "@/components/brand";

const workflowSteps = [
  ["01", "Bring the project in", "Start with PDF drawing sets, CAD/BIM data, schedules and specifications, then tell EngCalcs what you need designed."],
  ["02", "AI builds the project model", "EngCalcs extracts geometry, member tags, levels, materials, openings, notes and relationships, then reconciles them across drawings and models."],
  ["03", "AI plans the design workflow", "The AI identifies design tasks, chooses the required calculation engines, maps dependencies and asks only for missing or uncertain inputs."],
  ["04", "Deterministic engines run", "Standards-based engines execute the engineering maths. Results do not rely on LLM arithmetic."],
  ["05", "Revisions propagate", "When architectural or model data changes, EngCalcs identifies affected inputs, marks dependent calculations stale and re-runs the calculation chain for review."],
  ["06", "Engineer reviews and issues", "Inputs, assumptions, references, formulas, warnings, revisions and provenance remain visible before anything is issued."],
];

const sourceTypes = [
  ["PDF", "Architectural, structural and services drawing sets"],
  ["DWG / DXF", "CAD geometry, layers, text and dimensions"],
  ["IFC / BIM", "Objects, properties, levels and model relationships"],
  ["Revit", "Model data via supported exports and integrations"],
  ["Tekla", "Structural model data via supported exports and integrations"],
  ["Specs", "Schedules, specifications and design notes"],
];

const calculatorGroups = [
  ["Wind", "AS/NZS 1170.2", "Regional wind speed, terrain, shielding and design wind speed.", "live"],
  ["Steel", "AS 4100", "Member and connection design with visible utilisation and workings.", "live"],
  ["Concrete", "AS 3600", "Member and footing design with transparent assumptions.", "live"],
  ["Timber", "AS 1720", "Structural timber design with project-preferred sections.", "live"],
  ["Hydraulic", "AS/NZS 3500", "Standards-based plumbing and drainage calculations linked to project inputs.", "live"],
  ["Loads", "AS/NZS 1170", "Permanent, imposed and environmental actions linked into the project model.", "planned"],
];

const features = [
  ["Multimodal project understanding", "AI combines drawing text, geometry, schedules, notes and model objects instead of treating each page or file in isolation."],
  ["Cross-sheet reasoning", "Architectural, structural and roof information can be reconciled to understand what an element is actually supporting."],
  ["AI workflow planning", "EngCalcs decomposes the design problem into the calculation chain required to solve it."],
  ["Deterministic calculation engines", "The AI never invents the final engineering maths. Versioned engines execute the standards-based calculations."],
  ["Revision-aware design", "Architectural and model revisions are compared against the project model so EngCalcs can identify which calculations are affected and re-run the dependent chain."],
  ["Connected calculation graph", "Outputs from one calculation become typed inputs to the next, preserving source and dependency information."],
  ["Transparent review", "Every extracted input, assumption, formula, warning, reference and override remains reviewable."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="container nav-wrap">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#workflow">AI workflow</a>
            <a href="#drawings">Drawings & models</a>
            <a href="#platform">Platform</a>
            <a href="#calculators">Engines</a>
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
            <h1>Bring the project. <em>EngCalcs understands, calculates and keeps it current.</em></h1>
            <p className="hero-lead">
              EngCalcs interprets drawings, CAD/BIM data and engineering intent, turns them into a
              structured project model, then plans and runs the calculation chain. When the design
              changes, EngCalcs traces the impact and re-runs affected calculations for engineer review.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/signup">Create a workspace <span aria-hidden="true">→</span></Link>
              <a className="button button-secondary" href="#workflow">See the AI workflow</a>
            </div>
            <div className="hero-proof">
              <span><b>AI understands</b> drawings & models</span>
              <span><b>AI plans</b> the workflow</span>
              <span><b>Changes propagate</b> through the design</span>
            </div>
          </div>

          <div className="product-window" aria-label="EngCalcs drawing-to-calculation workflow preview">
            <div className="window-bar">
              <span /><span /><span />
              <div className="window-address">EngCalcs / Project intelligence</div>
            </div>
            <div className="app-preview">
              <aside className="preview-sidebar">
                <div className="mini-logo">EC</div>
                <div className="side-block active"><i />Project AI</div>
                <div className="side-block"><i />Drawings</div>
                <div className="side-block"><i />Model</div>
                <div className="side-block"><i />Calculations</div>
                <div className="side-divider" />
                <div className="project-node"><span />A203.pdf</div>
                <div className="project-node"><span />S104.dwg</div>
                <div className="project-node"><span />Structure.ifc</div>
                <div className="project-node child selected"><span />Beam B1</div>
              </aside>

              <div className="preview-main">
                <div className="preview-topline">
                  <div>
                    <small>AI PROJECT MODEL</small>
                    <strong>Beam B1 · rear opening</strong>
                  </div>
                  <button>Review source</button>
                </div>

                <div className="drawing-preview-grid">
                  <section className="drawing-sheet">
                    <div className="sheet-toolbar">
                      <span>A203 · Ground floor</span>
                      <b>ARCH</b>
                    </div>
                    <div className="plan-sketch" aria-hidden="true">
                      <span className="plan-wall wall-a" />
                      <span className="plan-wall wall-b" />
                      <span className="plan-wall wall-c" />
                      <span className="plan-opening">4200</span>
                      <span className="plan-member">B1</span>
                      <span className="plan-note">rear opening</span>
                    </div>
                  </section>

                  <section className="model-facts">
                    <div className="result-status">AI EXTRACTED</div>
                    <small>Structured design facts</small>
                    <div className="model-fact-row"><span>Span</span><b>4.20 m</b></div>
                    <div className="model-fact-row"><span>Upper wall</span><b>Brick veneer</b></div>
                    <div className="model-fact-row"><span>Roof</span><b>Tiled · 22.5°</b></div>
                    <div className="model-fact-row"><span>Tributary width</span><b>3.1 m</b></div>
                    <div className="model-fact-row"><span>Confidence</span><b>Review 1 item</b></div>
                  </section>
                </div>

                <div className="audit-line">
                  <span className="audit-dot" />
                  Sources reconciled across architectural, structural and model data · revision-aware
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="container trust-row">
          <span>Designed around the standards Australian engineers use</span>
          <b>AS/NZS 1170.2</b><b>AS 4100</b><b>AS 3600</b><b>AS 1720</b><b>AS/NZS 3500</b>
        </div>
      </section>

      <section className="section" id="workflow">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">From project information to engineering output</p>
            <h2>Understand the design. Calculate it. Keep it current when the design changes.</h2>
            <p>
              EngCalcs uses AI to interpret project information, reconcile it into a structured
              engineering model and decide what needs to be designed. When source geometry or
              specifications change, the dependency graph shows what is affected and the relevant
              calculation chain can be re-run. The maths remains deterministic, versioned and reviewable.
            </p>
          </div>

          <div className="pipeline-diagram" aria-label="EngCalcs workflow">
            <div className="pipeline-stage source-stage">
              <small>INPUT</small>
              <strong>Drawings & models</strong>
              <span>PDF · DWG · IFC · BIM · specs</span>
            </div>
            <div className="pipeline-arrow"><span>AI interprets</span></div>
            <div className="pipeline-stage ai-stage">
              <small>UNDERSTAND</small>
              <strong>Project model</strong>
              <span>geometry · elements · loads · relationships</span>
            </div>
            <div className="pipeline-arrow"><span>AI plans</span></div>
            <div className="pipeline-stage ai-stage">
              <small>PLAN</small>
              <strong>Design tasks</strong>
              <span>beam · column · footing · wind · bracing</span>
            </div>
            <div className="pipeline-arrow"><span>code executes</span></div>
            <div className="pipeline-stage calc-stage">
              <small>CALCULATE</small>
              <strong>Deterministic engines</strong>
              <span>standards-based · versioned · traceable</span>
            </div>
            <div className="pipeline-arrow"><span>engineer reviews</span></div>
            <div className="pipeline-stage output-stage">
              <small>OUTPUT</small>
              <strong>Calculation pack</strong>
              <span>workings · references · assumptions · provenance</span>
            </div>
          </div>

          <div className="revision-loop" aria-label="Revision-aware calculation loop">
            <div className="revision-source">
              <small>ARCHITECTURAL REVISION</small>
              <strong>A203 Rev C</strong>
              <span>Rear opening: 4200 → 4500 mm</span>
            </div>
            <div className="revision-arrow">→</div>
            <div className="revision-impact">
              <small>AI IMPACT ANALYSIS</small>
              <strong>3 calculations affected</strong>
              <span>Beam B1 · Column C1 · Footing F1</span>
            </div>
            <div className="revision-arrow">→</div>
            <div className="revision-rerun">
              <small>RE-CALCULATE</small>
              <strong>Dependent chain re-run</strong>
              <span>New results held for engineer review</span>
            </div>
            <div className="revision-loopback">↺ source → model → calculations → review</div>
          </div>

          <div className="workflow-step-grid">
            {workflowSteps.map(([number, title, text]) => (
              <article className="workflow-step-card" key={title}>
                <div className="feature-number">{number}</div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-soft" id="drawings">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Drawings, CAD and BIM</p>
              <h2>The project model should not care where the geometry came from.</h2>
            </div>
            <p>
              EngCalcs is designed around a common internal engineering model. PDF drawings can be
              interpreted visually and geometrically, while CAD/BIM sources can contribute richer
              object, property and relationship data.
            </p>
          </div>

          <div className="source-grid">
            {sourceTypes.map(([title, text]) => (
              <article className="source-card" key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className="cross-sheet-card">
            <div className="cross-sheet-copy">
              <p className="eyebrow">Cross-source reasoning</p>
              <h3>A beam is more than a line on one drawing.</h3>
              <p>
                EngCalcs can combine information from several project sources before deciding what a
                structural element actually supports.
              </p>
            </div>

            <div className="cross-sheet-flow">
              <div className="source-evidence">
                <small>ARCHITECTURAL</small>
                <b>A203</b>
                <span>4.2 m rear opening</span>
              </div>
              <div className="source-evidence">
                <small>STRUCTURAL</small>
                <b>S104</b>
                <span>Beam B1 over opening</span>
              </div>
              <div className="source-evidence">
                <small>ROOF / BIM</small>
                <b>Model</b>
                <span>Trusses span to B1</span>
              </div>
              <div className="cross-sheet-merge">+</div>
              <div className="inference-card">
                <small>AI INFERENCE</small>
                <b>Beam B1 design task</b>
                <span>Roof actions + upper wall load + self-weight</span>
                <em>Confirm masonry bearing condition before run</em>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section workflow-section" id="platform">
        <div className="container workflow-grid">
          <div className="section-heading left-heading">
            <p className="eyebrow">The calculation graph</p>
            <h2>The model and calculations stay connected.</h2>
            <p>
              Once EngCalcs understands the project, the design becomes a graph of sources, extracted
              facts, assumptions, calculations and downstream dependencies.
            </p>
            <ul className="check-list">
              <li>Every extracted value can retain its drawing/model source</li>
              <li>AI identifies the calculation modules required for each design task</li>
              <li>Outputs become typed inputs to downstream calculations</li>
              <li>Architectural and model revisions identify affected calculations automatically</li>
              <li>Dependent calculations can be re-run against the revised design</li>
            </ul>
          </div>

          <div className="flow-card">
            <div className="flow-node"><small>PROJECT SOURCE</small><b>Beam B1 geometry</b><span>A203 + S104 + model</span></div>
            <div className="flow-line"><span>interpreted by AI</span></div>
            <div className="flow-node accent"><small>AI PLANNER</small><b>B1 design workflow</b><span>5 linked checks</span></div>
            <div className="flow-line"><span>requires</span></div>
            <div className="flow-node"><small>WIND / LOADS</small><b>Design actions</b><span>AS/NZS 1170</span></div>
            <div className="flow-line"><span>feeds</span></div>
            <div className="flow-node"><small>STEEL</small><b>Beam B1</b><span>AS 4100 member checks</span></div>
            <div className="flow-line"><span>reactions</span></div>
            <div className="flow-node"><small>DOWNSTREAM</small><b>Column / footing</b><span>Linked for further design</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">Why AI belongs here</p>
            <h2>AI handles interpretation and coordination. Code handles engineering maths.</h2>
            <p>
              The useful AI work happens before and around the calculation: understanding project
              information, reconciling sources, identifying missing data, decomposing the design and
              coordinating linked calculations.
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
              EngCalcs orchestrates them as one workflow while preserving the workings. Wind,
              steel, concrete, timber and hydraulic calculation engines are already available.
            </p>
          </div>

          <div className="calculator-grid">
            {calculatorGroups.map(([title, standard, description, status], index) => {
              const isAvailable = status === "live";
              const isWind = title === "Wind";
              return (
                <article className={`calculator-card ${isAvailable ? "live" : "planned"}`} key={title}>
                  <div className="calculator-top">
                    <span>{isAvailable ? "AVAILABLE" : "PLANNED"}</span>
                    <b>0{index + 1}</b>
                  </div>
                  <h3>{title}</h3>
                  <small>{standard}</small>
                  <p>{description}</p>
                  {isWind ? (
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

      <section className="section team-section">
        <div className="container team-grid">
          <div>
            <p className="eyebrow">For engineering teams</p>
            <h2>AI assistance without giving up reviewability.</h2>
          </div>
          <div className="team-copy">
            <p>
              Engineers remain responsible for the design. EngCalcs gives teams a consistent way to
              understand project information, plan, calculate, review and issue work while keeping
              assumptions, overrides and provenance visible.
            </p>
            <div className="team-points">
              <span>Drawing & model intelligence</span><span>Revision impact analysis</span>
              <span>Roles & review states</span><span>Reusable project defaults</span>
              <span>Calculation history</span><span>API access</span>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-card">
          <div>
            <p className="eyebrow">EngCalcs early access</p>
            <h2>From project model to calculations that stay aligned with the design.</h2>
            <p>
              Bring the project information. EngCalcs interprets the design, plans the engineering
              workflow, runs deterministic calculation engines and traces design revisions through
              dependent calculations with the workings left visible.
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
            <a href="#drawings">Drawings & models</a>
            <a href="#calculators">Engines</a>
            <a href="https://github.com/Elandu/OpenCalcs" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
          <small>© 2026 EngCalcs</small>
        </div>
      </footer>
    </main>
  );
}
