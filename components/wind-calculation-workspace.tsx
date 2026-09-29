"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { CalculationLauncher } from "@/components/calculation-launcher";
import { HOUSING_ASSESSMENT_ID, WIND_FRAME_LOADS_ID } from "@/lib/calculation-catalogue";

export function WindCalculationWorkspace({ projectId, initialCalculationId, sourceRuns, children }: {
  projectId: string;
  initialCalculationId?: string;
  sourceRuns: ComponentProps<typeof CalculationLauncher>["sourceRuns"];
  children: ReactNode;
}) {
  const [method, setMethod] = useState(initialCalculationId === HOUSING_ASSESSMENT_ID ? "housing"
    : initialCalculationId === WIND_FRAME_LOADS_ID ? "loads" : "site");
  return <section id="add-calculation" className="wind-calculation-workspace" aria-label="Wind calculation workspace">
    <div className="wind-method-selector" role="group" aria-label="Wind calculation stage or method">
      <button type="button" aria-pressed={method === "site"} onClick={() => setMethod("site")}>AS/NZS 1170.2 · site</button>
      <button type="button" aria-pressed={method === "housing"} onClick={() => setMethod("housing")}>AS 4055 · housing</button>
      <button type="button" aria-pressed={method === "loads"} onClick={() => setMethod("loads")}>Pressures & frame loads</button>
    </div>
    <div hidden={method !== "site"}>{children}</div>
    <div hidden={method !== "housing"}>
      <p className="wind-method-note">AS 4055 uses its own housing classifications. Review site categories and both elevation directions. This preliminary method supports rectangular flat and gable houses without overhangs; independent engineering review is required.</p>
      <CalculationLauncher projectId={projectId} sourceRuns={sourceRuns}
        focusedCalculationId={HOUSING_ASSESSMENT_ID} heading="Housing wind assessment" />
    </div>
    <div hidden={method !== "loads"}>
      <p className="wind-method-note">Link both design speeds for each pressure case individually from the same saved AS/NZS 1170.2 wind run, and use that run ID as the case source. Review the external and internal shape factors, then assign each pressure area to frame members. Unlinked source references are manual assertions. Use the saved loads in Frame analysis with reviewed load cases and combinations.</p>
      <CalculationLauncher projectId={projectId} sourceRuns={sourceRuns}
        focusedCalculationId={WIND_FRAME_LOADS_ID} heading="Wind pressures & frame loads" />
    </div>
  </section>;
}
