export const WIND_ASSESSMENT_ID = "au.wind.site_assessment";
export const FRAME_ANALYSIS_ID = "structural.pynite.frame_analysis";
export const HOUSING_ASSESSMENT_ID = "au.wind.as4055.housing_assessment";
export const WIND_FRAME_LOADS_ID = "au.wind.frame_loads";
export const AS3600_SECTION_ID = "structural.as3600.section_analysis";
export const AS4100_SECTION_ID = "structural.as4100.section_analysis";

/** Calculations whose unsaved engine results may be previewed while inputs are edited. */
export const PREVIEWABLE_CALCULATION_IDS: ReadonlySet<string> = new Set([
  FRAME_ANALYSIS_ID,
  AS3600_SECTION_ID,
  AS4100_SECTION_ID,
]);

const windComponentIds = new Set([
  "au.wind.climate_change_multiplier",
  "au.wind.design_wind_speed",
  "au.wind.direction_multipliers",
  "au.wind.regional_wind_speed",
  "au.wind.shielding_multiplier",
  "au.wind.site_wind_speed",
  "au.wind.as4055.classify_housing_site",
  "au.wind.as4055.housing_surface_loads",
  "au.wind.as4055.racking_force",
  "au.wind.as4055.pressure_zone_areas",
  "au.wind.as4055.roof_anchoring",
  "au.wind.as4055.racking_pressure",
  HOUSING_ASSESSMENT_ID,
  WIND_FRAME_LOADS_ID,
]);

export type CatalogueDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  version?: string;
  standard?: { name?: string; edition?: string } | null;
  plugin?: { id?: string; name?: string; version?: string; revision?: string | null } | null;
  runtime?: { name?: string; version?: string; revision?: string | null } | null;
  input_schema?: {
    required?: string[];
    properties?: Record<string, { type?: string; unit?: string; description?: string }>;
  };
};

export type CalculationGuide = {
  /** Short name used on cards, buttons and headings. */
  title: string;
  /** Library grouping shown to users. */
  category: string;
  /** Honest scope label; never implies a compliance check the engine does not perform. */
  scope: string;
  summary: string;
  needs: string[];
  gives: string[];
  limits: string;
};

/** Plain-language guidance for calculations with dedicated workspaces. */
export const CALCULATION_GUIDES: Record<string, CalculationGuide> = {
  [FRAME_ANALYSIS_ID]: {
    title: "Frame analysis",
    category: "Structural analysis",
    scope: "PyNite 3D frame solver",
    summary: "Draw a 2D or 3D frame, apply loads and see deflections, reactions and force diagrams update as you edit.",
    needs: ["Node coordinates and member connections", "Supports (restrained directions)", "Section and material stiffness", "Load cases and combination factors"],
    gives: ["Deformed shape and reactions", "Bending, shear and axial diagrams", "Saved runs with linked wind loads"],
    limits: "Elastic analysis results only; member design checks are separate.",
  },
  [AS3600_SECTION_ID]: {
    title: "Concrete section",
    category: "Structural sections",
    scope: "Section mechanics · AS 3600 checks not yet included",
    summary: "Draw a rectangular reinforced concrete section, place bars and see its nominal bending capacity and neutral axis.",
    needs: ["Section width and depth", "Bar sizes and positions", "Concrete stress-block coefficients", "Reinforcement yield strength", "Axial force and bending direction"],
    gives: ["Nominal moment capacity (Mx, My)", "Neutral-axis depth and steel strain", "Gross section properties and centroid"],
    limits: "Nominal capacity only. No capacity reduction factor or AS 3600 compliance check is applied.",
  },
  [AS4100_SECTION_ID]: {
    title: "Steel section · axial",
    category: "Structural sections",
    scope: "AS 4100:2020 · section axial capacity",
    summary: "Check a steel section's tension and compression section capacity against design actions, with utilisation shown live.",
    needs: ["Gross and net areas", "Yield and tensile strength for the product", "Assessed kt and kf factors", "Factored tension and compression actions"],
    gives: ["Design capacities φNt and φNs", "Utilisation and governing mode", "Gross yielding and net fracture capacities"],
    limits: "Section capacity only. Member buckling, bending, shear and connections are not checked.",
  },
};

export function calculationGuide(id?: string): CalculationGuide | undefined {
  return id ? CALCULATION_GUIDES[id] : undefined;
}

export function calculationDisplayName(id: string, name: string) {
  return CALCULATION_GUIDES[id]?.title ?? name;
}

export function calculationCatalogue(definitions: CatalogueDefinition[]): CatalogueDefinition[] {
  const wind = definitions.find((item) => windComponentIds.has(item.id));
  const entries = definitions.filter((item) => !windComponentIds.has(item.id))
    .map((item) => ({
      ...item,
      name: calculationDisplayName(item.id, item.name),
      category: CALCULATION_GUIDES[item.id]?.category ?? item.category,
    }));
  if (wind) entries.unshift({
    id: WIND_ASSESSMENT_ID,
    name: "Wind calculation",
    description: "One wind workspace for AS/NZS 1170.2 site assessment, AS 4055 housing loads, and reviewed pressures and tributary frame loads.",
    category: "wind",
    standard: wind.standard,
    plugin: wind.plugin,
    runtime: wind.runtime,
    input_schema: {
      required: ["address", "building_height_m", "average_roof_height_m", "annual_exceedance_probability"],
      properties: {
        address: { type: "string", description: "Site address used to assess regional and local conditions." },
        building_height_m: { type: "number", unit: "m", description: "Overall building height." },
        average_roof_height_m: { type: "number", unit: "m", description: "Mean roof height for the terrain and shielding assessment." },
        annual_exceedance_probability: { type: "string", description: "Design annual exceedance probability." },
        structure_orientation_deg: { type: "number", unit: "deg", description: "Building orientation for orthogonal design wind speeds." },
      },
    },
  });
  return entries;
}

export function calculationWorkspaceHref(id: string, projectId: string) {
  const project = encodeURIComponent(projectId);
  if (id === FRAME_ANALYSIS_ID) return `/dashboard/structural-fea/${project}`;
  const anchor = isWindWorkspaceCalculation(id) ? "add-calculation" : CALCULATION_GUIDES[id] ? "workspace" : "calculations";
  return `/dashboard/projects/${project}?calculation=${encodeURIComponent(id)}#${anchor}`;
}

export function isWindWorkspaceCalculation(id?: string) {
  return id === WIND_ASSESSMENT_ID || id === HOUSING_ASSESSMENT_ID || id === WIND_FRAME_LOADS_ID;
}
