import assert from "node:assert/strict";
import test from "node:test";

import {
  autoMagnification,
  cameraBasis,
  deformedMemberPoints,
  memberLocalAxes,
  projectPoint,
  snap,
  unprojectToPlane,
  VIEW_PRESETS,
} from "./frame-geometry.ts";

const close = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} != ${expected}`));
};

test("orbit camera keeps global Y upward and gives exact orthographic presets", () => {
  for (const preset of Object.values(VIEW_PRESETS)) {
    const { right, up, toward } = cameraBasis(preset);
    close([Math.hypot(...right), Math.hypot(...up), Math.hypot(...toward)], [1, 1, 1]);
  }
  assert.ok(projectPoint([0, 3, 0], VIEW_PRESETS.iso).y > projectPoint([0, 0, 0], VIEW_PRESETS.iso).y);
  close(Object.values(projectPoint([2, 3, 4], VIEW_PRESETS.front)), [2, 3]);
  close(Object.values(projectPoint([2, 3, 4], VIEW_PRESETS.plan)), [2, -4]);
  close(Object.values(projectPoint([2, 3, 4], VIEW_PRESETS.side)), [-4, 3]);
});

test("editable views invert their projection and keep the out-of-plane coordinate", () => {
  for (const key of ["front", "plan", "side"]) {
    const camera = VIEW_PRESETS[key];
    const point = [1.5, 2.5, -3];
    const screen = projectPoint(point, camera);
    const depth = point.reduce((sum, value, index) => sum + value * cameraBasis(camera).toward[index], 0);
    close(unprojectToPlane(screen, camera, depth), point);
  }
});

test("member local axes follow the PyNite Member3D convention", () => {
  close(memberLocalAxes([0, 0, 0], [0, 3, 0]).y, [-1, 0, 0]);
  close(memberLocalAxes([0, 3, 0], [0, 0, 0]).y, [1, 0, 0]);
  const beam = memberLocalAxes([0, 0, 0], [6, 0, 0]);
  close(beam.y, [0, 1, 0]);
  close(beam.z, [0, 0, 1]);
  const sloped = memberLocalAxes([0, 0, 0], [3, 4, 0]);
  close(sloped.x, [0.6, 0.8, 0]);
  close(sloped.y, [-0.8, 0.6, 0]);
  close(sloped.z, [0, 0, 1]);
  const rolled = memberLocalAxes([0, 0, 0], [6, 0, 0], 90);
  close(rolled.y, [0, 0, 1]);
  close(rolled.z, [0, -1, 0]);
});

test("deformed shape maps total local station deflections into global coordinates", () => {
  // Values from PyNite 3.2.0: cantilever A(0,0,0)→B(3,4,0) with FX = 5 kN at B.
  const model = {
    nodes: [{ id: "A", x_m: 0, y_m: 0, z_m: 0 }, { id: "B", x_m: 3, y_m: 4, z_m: 0 }],
    members: [{ id: "M", start_node: "A", end_node: "B", material: "S", section: "s" }],
    materials: [], sections: [], supports: [], load_cases: [], node_loads: [], member_distributed_loads: [], load_combinations: [],
  };
  const station = (x, dx, dy) => ({ x_m: x, deflection_x_m: dx, deflection_y_m: dy, deflection_z_m: 0, axial_kn: 0, shear_y_kn: 0, shear_z_kn: 0, moment_y_knm: 0, moment_z_knm: 0 });
  const result = { load_combination: "C", member_id: "M", length_m: 5, stations: [station(0, 0, 0), station(5, 3.75e-5, -0.008333333333333385)] };
  const points = deformedMemberPoints(model, model.members[0], result, 1);
  close(points[1], [3 + 0.00668916666666, 4 - 0.00497, 0], 1e-9);
  const magnified = deformedMemberPoints(model, model.members[0], result, autoMagnification(model, [result], 0.1));
  close([Math.hypot(magnified[1][0] - 3, magnified[1][1] - 4)], [0.4], 1e-9);
});

test("grid snapping avoids floating point residue", () => {
  assert.equal(snap(1.26, 0.25), 1.25);
  assert.equal(snap(0.1 + 0.2, 0.1), 0.3);
  assert.equal(snap(1.234, 0), 1.234);
});
