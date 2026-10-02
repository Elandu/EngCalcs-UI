import assert from "node:assert/strict";
import test from "node:test";

import {
  BAR_ID_PATTERN,
  barAreaFromDiameter,
  barDiameterFromArea,
  layerBars,
  neutralAxisGeometry,
  nextBarId,
} from "./concrete-section.ts";

test("bar layers are evenly spaced, inside the section and uniquely named", () => {
  const bars = layerBars({ width: 300, depth: 500, count: 3, diameterMm: 24, edgeMm: 60, face: "bottom", existingIds: ["B1"] });
  assert.deepEqual(bars.map((bar) => [bar.id, bar.x_mm, bar.y_mm]), [["B2", 60, 60], ["B3", 150, 60], ["B4", 240, 60]]);
  assert.ok(bars.every((bar) => BAR_ID_PATTERN.test(bar.id) && bar.area_mm2 === 452.4));
  assert.deepEqual(layerBars({ width: 300, depth: 500, count: 1, diameterMm: 16, edgeMm: 50, face: "top", existingIds: [] }).map((bar) => [bar.x_mm, bar.y_mm]), [[150, 450]]);
  assert.deepEqual(layerBars({ width: 100, depth: 500, count: 2, diameterMm: 16, edgeMm: 60, face: "top", existingIds: [] }), []);
  assert.deepEqual(layerBars({ width: 300, depth: 500, count: 0, diameterMm: 16, edgeMm: 50, face: "top", existingIds: [] }), []);
});

test("bar diameter and area round-trip", () => {
  assert.ok(Math.abs(barDiameterFromArea(barAreaFromDiameter(20)) - 20) < 0.01);
  assert.equal(barDiameterFromArea(0), 0);
  assert.equal(nextBarId(["B1", "B3"]), "B2");
});

test("neutral axis follows the engine angle convention", () => {
  // Zero compresses the top face: the zone spans the top dn of the section.
  const top = neutralAxisGeometry(300, 500, 0, 122);
  assert.deepEqual(top.axis.map((point) => Math.round(point.y)), [378, 378]);
  assert.ok(top.zone.every((point) => point.y >= 378 - 1e-6));
  // +90° compresses the left face (verified against concreteproperties 0.8.0 via the plugin).
  const left = neutralAxisGeometry(300, 500, 90, 50);
  assert.ok(left.zone.every((point) => point.x <= 50 + 1e-6));
  // 180° compresses the bottom face.
  const bottom = neutralAxisGeometry(300, 500, 180, 40);
  assert.ok(bottom.zone.every((point) => point.y <= 40 + 1e-6));
  // A skew angle measures depth from the extreme compressed corner.
  const skew = neutralAxisGeometry(300, 500, 30, 200);
  assert.ok(skew.zone.some((point) => point.x === 0 && point.y === 500));
  assert.equal(skew.axis.length, 2);
  assert.equal(neutralAxisGeometry(0, 500, 0, 10), null);
});

test("parametric cage places bars at cover + tie + half diameter", async () => {
  const { cageBars } = await import("./concrete-section.ts");
  const { bars, error } = cageBars({ width: 400, depth: 600, coverMm: 40, tieMm: 10, bottom: { count: 4, diameterMm: 20 }, top: { count: 2, diameterMm: 16 }, sidePerFace: 1, sideDiameterMm: 12 });
  assert.equal(error, "");
  assert.deepEqual(bars.filter((bar) => bar.id.startsWith("B")).map((bar) => [bar.x_mm, bar.y_mm]), [[60, 60], [153.3, 60], [246.7, 60], [340, 60]]);
  assert.deepEqual(bars.filter((bar) => bar.id.startsWith("T")).map((bar) => [bar.x_mm, bar.y_mm]), [[58, 542], [342, 542]]);
  assert.deepEqual(bars.filter((bar) => bar.id.startsWith("S")).map((bar) => [bar.x_mm, bar.y_mm]), [[56, 301], [344, 301]]);
  assert.equal(new Set(bars.map((bar) => bar.id)).size, bars.length);
});

test("parametric cage reports layouts that do not fit", async () => {
  const { cageBars } = await import("./concrete-section.ts");
  const base = { width: 200, depth: 300, coverMm: 40, tieMm: 10, top: { count: 0, diameterMm: 16 }, sidePerFace: 0, sideDiameterMm: 12 };
  assert.match(cageBars({ ...base, bottom: { count: 6, diameterMm: 32 } }).error, /do not fit/);
  assert.match(cageBars({ ...base, bottom: { count: 0, diameterMm: 20 } }).error, /at least one bar/);
  assert.match(cageBars({ ...base, width: 0, bottom: { count: 2, diameterMm: 20 } }).error, /width and depth/);
});
