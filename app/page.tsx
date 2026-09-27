import Link from "next/link";
import { Brand } from "@/components/brand";

const calculatorGroups = [
  ["Wind", "AS/NZS 1170.2", "Regional wind speed, terrain, shielding and design wind speed."],
  ["Loads", "AS/NZS 1170", "Permanent, imposed and environmental actions in one project model."],
  ["Steel", "AS 4100", "Member and connection design with visible utilisation and workings."],
  ["Concrete", "AS 3600", "Member and footing design with transparent assumptions."],
  ["Timber", "AS 1720", "Structural timber design with project-preferred sections."],
  ["Foundations", "Project linked", "Carry reactions through to footing and retaining calculations."],
];

const features = [
  ["Transparent by default", "Inputs, formulas, assumptions, warnings and standard references stay visible with the result."],
  ["Project-first workflow", "Set site data and project defaults once, then reuse them across every calculation in the job."],
  ["Connected calculation graph", "Design calculations are built to link together so upstream changes can flow through the load path."],
  ["Reviewable outputs", "Create consistent calculation packs that are easier for engineers, reviewers and clients to follow."],
  ["Versioned standards", "Keep the standard edition and calculation implementation attached to the saved calculation."],
  ["API-native", "The same calculation engine can power the browser workspace, integrations and engineering automation."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <div className="container nav-wrap">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#platform">Platform</a>
            <a href="#calculators">Calculators</a>
            <a href="#teams">For teams</a>
            <a href="#architecture">How it works</a>
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
              <span>AU engineering workspace</span>
              <span className="kicker-dot" />
              OpenWind is the first calculation module
            </div>
            <h1>Engineering calculations you can <em>inspect, connect and defend.</em></h1>
            <p className="hero-lead">
              OpenCalcs brings standards-referenced calculations, project data, review history
              and reports into one browser workspace — without turning the engineering into a
              black box.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/signup">Create a workspace <span aria-hidden="true">→</span></Link>
              <a className="button button-secondary" href="#platform">See the platform</a>
            </div>
            <div className="hero-proof">
              <span><b>Versioned</b> calculation engines</span>
              <span><b>Traceable</b> assumptions & references</span>
              <span><b>Built for</b> Australian practice</span>
            </div>
          </div>

          <div className="product-window" aria-label="OpenCalcs application preview">
            <div className="window-bar">
              <span /><span /><span />
              <div className="window-address">OpenCalcs / 24017 — Warehouse extension</div>
            </div>
            <div className="app-preview">
              <aside className="preview-sidebar">
                <div className="mini-logo">OC</div>
                <div className="side-block active"><i />Project</div>
                <div className="side-block"><i />Calculations</div>
                <div className="side-block"><i />Loads</div>
                <div className="side-block"><i />Reports</div>
                <div className="side-divider" />
                <div className="project-node"><span />Site wind</div>
                <div className="project-node child selected"><span />Design wind speed</div>
                <div className="project-node child"><span />Steel beam B1</div>
                <div className="project-node child"><span />Column C1</div>
              </aside>
              <div className="preview-main">
                <div className="preview-topline">
                  <div>
                    <small>WIND / AS/NZS 1170.2:2021</small>
                    <strong>Design wind speed</strong>
                  </div>
                  <button>Issue calc</button>
                </div>
                <div className="calc-grid">
                  <section className="calc-panel">
                    <h3>Inputs</h3>
                    <label>Wind region <span>A2</span></label>
                    <label>ARI <span>500 years</span></label>
                    <label>Structure height <span>10.0 m</span></label>
                    <label>Orientation <span>90°</span></label>
                    <div className="linked-input">
                      <b>Mz,cat</b><span>0.83</span>
                      <small>↗ linked from terrain assessment</small>
                    </div>
                  </section>
                  <section className="calc-panel result-panel">
                    <div className="result-status">SAMPLE</div>
                    <small>Vdes,θ — Front</small>
                    <div className="result-value">43.0 <span>m/s</span></div>
                    <div className="equation">
                      V<sub>sit,b</sub> = V<sub>R</sub> M<sub>c</sub> M<sub>d</sub> M<sub>z,cat</sub> M<sub>s</sub> M<sub>t</sub>
                    </div>
                    <div className="trace-row"><span>Standard</span><b>AS/NZS 1170.2:2021</b></div>
                    <div className="trace-row"><span>Reference</span><b>Clause 2.3</b></div>
                    <div className="trace-row"><span>Engine</span><b>OpenWind 0.8.0</b></div>
                  </section>
                </div>
                <div className="audit-line">
                  <span className="audit-dot" />
                  Illustrative values only · no project calculation has been run
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

      <section className="section" id="platform">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">One engineering workspace</p>
            <h2>From site inputs to issued calculation pack.</h2>
            <p>
              OpenCalcs is being built around the way engineering work actually moves:
              project defaults, calculations, linked results, review and issue.
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
              <p className="eyebrow">Calculation library</p>
              <h2>One platform. Separate, reviewable engines.</h2>
            </div>
            <p>
              Each discipline can evolve independently while OpenCalcs keeps the project,
              user experience and audit trail consistent.
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
                    <Link className="button button-light button-small" href="/dashboard/calculations">
                      Open wind calculations <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section workflow-section" id="architecture">
        <div className="container workflow-grid">
          <div className="section-heading left-heading">
            <p className="eyebrow">Connected by design</p>
            <h2>Change the roof load. Know what else needs review.</h2>
            <p>
              The long-term advantage is not a larger list of isolated calculators. It is
              a calculation graph that knows where values came from, which calculations
              depend on them and what changed.
            </p>
            <ul className="check-list">
              <li>Project defaults propagate into new calculations</li>
              <li>Outputs can become typed inputs to downstream calculations</li>
              <li>Changes flag affected calculations for review</li>
              <li>Every transfer retains source and version metadata</li>
            </ul>
          </div>
          <div className="flow-card">
            <div className="flow-node"><small>LOADS</small><b>Roof actions</b><span>G = 0.45 kPa · Q = 0.25 kPa</span></div>
            <div className="flow-line"><span>reactions</span></div>
            <div className="flow-node accent"><small>STEEL</small><b>Beam B1</b><span>Utilisation 0.72</span></div>
            <div className="flow-line"><span>R<sub>A</sub> = 38.4 kN</span></div>
            <div className="flow-node"><small>STEEL</small><b>Column C1</b><span>Utilisation 0.61</span></div>
            <div className="flow-line"><span>N* = 76.8 kN</span></div>
            <div className="flow-node"><small>CONCRETE</small><b>Footing F1</b><span>Bearing 118 kPa</span></div>
          </div>
        </div>
      </section>

      <section className="section team-section" id="teams">
        <div className="container team-grid">
          <div>
            <p className="eyebrow">For engineering teams</p>
            <h2>Make review easier without hiding the workings.</h2>
          </div>
          <div className="team-copy">
            <p>
              Shared project defaults, consistent output and calculation history give reviewers
              a common structure across the firm. Engineers keep control over assumptions and
              overrides; the platform keeps the provenance attached.
            </p>
            <div className="team-points">
              <span>Organisation workspaces</span><span>Roles & review states</span>
              <span>Reusable project templates</span><span>Company report branding</span>
              <span>Calculation history</span><span>API access</span>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-card">
          <div>
            <p className="eyebrow">OpenCalcs early access</p>
            <h2>Build the calculation workspace you would actually use.</h2>
            <p>
              OpenWind is the first module. The platform expands from there: loads, members,
              connections, foundations and linked project workflows.
            </p>
          </div>
          <div className="cta-actions">
            <Link className="button button-light" href="/signup">Create a workspace</Link>
            <a className="text-link" href="#platform">Explore the platform →</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-grid">
          <Brand />
          <p>Transparent engineering calculations, connected.</p>
          <div>
            <a href="#platform">Platform</a>
            <a href="#calculators">Calculators</a>
            <Link href="/login">Log in</Link>
          </div>
          <small>© 2026 OpenCalcs</small>
        </div>
      </footer>
    </main>
  );
}
