export const WIND_ASSESSMENT_ID = "au.wind.site_assessment";
export const FRAME_ANALYSIS_ID = "structural.pynite.frame_analysis";
export const HOUSING_ASSESSMENT_ID = "au.wind.as4055.housing_assessment";
export const WIND_FRAME_LOADS_ID = "au.wind.frame_loads";

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

export function calculationDisplayName(id: string, name: string) {
  return id === FRAME_ANALYSIS_ID ? "Frame analysis" : name;
}

export function calculationCatalogue(definitions: CatalogueDefinition[]): CatalogueDefinition[] {
  const wind = definitions.find((item) => windComponentIds.has(item.id));
  const entries = definitions.filter((item) => !windComponentIds.has(item.id))
    .map((item) => ({ ...item, name: calculationDisplayName(item.id, item.name) }));
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
  const anchor = isWindWorkspaceCalculation(id) ? "add-calculation" : "calculations";
  return `/dashboard/projects/${project}?calculation=${encodeURIComponent(id)}#${anchor}`;
}

export function isWindWorkspaceCalculation(id?: string) {
  return id === WIND_ASSESSMENT_ID || id === HOUSING_ASSESSMENT_ID || id === WIND_FRAME_LOADS_ID;
}
