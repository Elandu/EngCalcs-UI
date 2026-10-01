import assert from "node:assert/strict";
import test from "node:test";
import { calculationCatalogue, calculationWorkspaceHref, WIND_ASSESSMENT_ID, FRAME_ANALYSIS_ID } from "./calculation-catalogue.ts";

const definition = (id, name = id) => ({ id, name, category: "wind", description: "Calculation", version: "1" });

test("the library combines wind components and retains unrelated calculations and engine provenance", () => {
  const plugin = { name: "OpenWind-AU", revision: "engine-revision" };
  const entries = calculationCatalogue([
    { ...definition("au.wind.regional_wind_speed"), plugin },
    definition("au.wind.direction_multipliers"),
    definition("au.wind.site_wind_speed"),
    definition("au.wind.frame_loads"),
    definition("au.wind.as4055.housing_assessment"),
    definition("au.wind.as4055.racking_pressure"),
    definition(FRAME_ANALYSIS_ID, "PyNite frame analysis"),
    definition("au.wind.future_housing_calculation"),
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), [WIND_ASSESSMENT_ID, FRAME_ANALYSIS_ID, "au.wind.future_housing_calculation"]);
  assert.equal(entries[0].plugin, plugin);
  assert.equal(entries[0].version, undefined, "do not pass a component version off as the combined assessment version");
  assert.equal(entries[1].name, "Frame analysis");
});

test("an empty or non-wind catalogue does not advertise an unavailable wind engine", () => {
  assert.deepEqual(calculationCatalogue([]), []);
  assert.equal(calculationCatalogue([definition(FRAME_ANALYSIS_ID)])[0].id, FRAME_ANALYSIS_ID);
});

test("specialist cards open their complete workspaces while other definitions keep the linked launcher", () => {
  assert.equal(calculationWorkspaceHref(WIND_ASSESSMENT_ID, "project-1"), "/dashboard/projects/project-1?calculation=au.wind.site_assessment#add-calculation");
  assert.equal(calculationWorkspaceHref(FRAME_ANALYSIS_ID, "project-1"), "/dashboard/structural-fea/project-1");
  assert.equal(calculationWorkspaceHref("other.example", "project-1"), "/dashboard/projects/project-1?calculation=other.example#calculations");
  assert.equal(calculationWorkspaceHref("au.wind.as4055.housing_assessment", "project-1"), "/dashboard/projects/project-1?calculation=au.wind.as4055.housing_assessment#add-calculation");
  assert.equal(calculationWorkspaceHref("au.wind.frame_loads", "project-1"), "/dashboard/projects/project-1?calculation=au.wind.frame_loads#add-calculation");
});
