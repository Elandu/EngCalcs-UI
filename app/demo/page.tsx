import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { RevisionDemo } from "@/components/revision-demo";
import "../landing.css";
import "../landing-v2.css";
import "./demo.css";

export const metadata: Metadata = {
  title: "Connected Calculation Demo | EngCalcs",
  description:
    "Explore a transparent, engineer-supervised revision impact example. See how a changed wind input affects a saved frame load and downstream structural checks.",
};

export default function DemoPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Primary navigation">
            <Link href="/#product">Product</Link>
            <Link href="/#ai">AI approach</Link>
            <Link href="/company">Company</Link>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-signin" href="/login">Log in</Link>
            <Link className="landing-button landing-header-button" href="/signup">Open EngCalcs <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </header>
      <section className="revision-demo-hero">
        <div className="landing-container">
          <Link className="revision-demo-back" href="/">← EngCalcs overview</Link>
          <div className="revision-demo-hero-grid">
            <div>
              <p className="landing-label">INTERACTIVE PRODUCT WALKTHROUGH / SAMPLE DATA</p>
              <h1>One changed input.<br /><em>Every affected calculation.</em></h1>
            </div>
            <div>
              <p>
                Explore why a source-linked engineering workspace is useful. Change an assumed
                wind pressure and see how the saved provenance identifies the frame and member
                calculations that need attention.
              </p>
              <p className="revision-demo-hero-caveat">
                This demonstration uses an existing engineering test fixture and an illustrative
                amendment. It does not call an AI model, run a new structural solver analysis,
                or claim design approval.
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="revision-demo-section">
        <div className="landing-container"><RevisionDemo /></div>
      </section>
      <section className="landing-section landing-section-muted">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="landing-label">HOW THE PLATFORM WORKS</p>
            <h2>Numerical engines calculate. The project record preserves context.</h2>
            <p>
              Real EngCalcs projects retain calculation runs, source-run snapshots and selected
              linked inputs. Revised upstream runs can invalidate those links without silently
              rewriting previously saved results. A new review screen traces the dependencies
              and displays changes directly from saved outputs.
            </p>
          </div>
          <div className="landing-business-grid revision-demo-principles">
            <article><h3>Source identity</h3><p>Every linked result carries the source calculation, run and output path used when it was adopted.</p></article>
            <article><h3>Review, not guesswork</h3><p>A new source run prompts downstream review. We do not fabricate new forces or design utilisation without re-running an engine.</p></article>
            <article><h3>AI is a separate layer</h3><p>Future AI will propose values from drawings and identify changes, with original evidence and engineer confirmation required.</p></article>
          </div>
        </div>
      </section>
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <Brand />
            <p>EngCalcs develops connected, reviewable engineering calculation workflows. Calculation output requires professional engineering review.</p>
            <div className="landing-footer-links">
              <Link href="/">Overview</Link>
              <Link href="/company">Company</Link>
              <Link href="/signup">Workspace</Link>
            </div>
          </div>
          <div className="landing-legal">© 2026 EngCalcs. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
