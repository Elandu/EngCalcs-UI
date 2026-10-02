import type { FrameMember, FrameModel, FrameNode, PyniteMemberResult } from "@/lib/pynite-model";

export type Vec3 = [number, number, number];

export type Camera = { yawDeg: number; pitchDeg: number };

export type ViewPreset = "iso" | "front" | "plan" | "side";

export const VIEW_PRESETS: Record<ViewPreset, Camera & { label: string; editable: boolean }> = {
  iso: { yawDeg: -38, pitchDeg: 25, label: "3D", editable: false },
  front: { yawDeg: 0, pitchDeg: 0, label: "Elevation X–Y", editable: true },
  plan: { yawDeg: 0, pitchDeg: 90, label: "Plan X–Z", editable: true },
  side: { yawDeg: 90, pitchDeg: 0, label: "Side Z–Y", editable: true },
};

const EPSILON = 1e-9;

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function add(...vectors: Vec3[]): Vec3 {
  return vectors.reduce<Vec3>((sum, vector) => [sum[0] + vector[0], sum[1] + vector[1], sum[2] + vector[2]], [0, 0, 0]);
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(...a);
  return length > EPSILON ? scale(a, 1 / length) : [0, 0, 0];
}

function isClose(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function nodePosition(node: FrameNode): Vec3 {
  return [node.x_m, node.y_m, node.z_m];
}

/**
 * Orthonormal screen basis for an orbit camera. `right` and `up` span the screen;
 * `toward` points from the model to the viewer. Yaw rotates about global Y and
 * positive pitch looks down on the model, so front, plan and side views are exact.
 */
export function cameraBasis({ yawDeg, pitchDeg }: Camera) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)];
  return { right, up, toward: cross(right, up) };
}

/** Screen-plane coordinates (x right, y up) of a global point. */
export function projectPoint(point: Vec3, camera: Camera) {
  const { right, up } = cameraBasis(camera);
  return { x: dot(point, right), y: dot(point, up) };
}

/**
 * Member local axes using PyNite's Member3D.T() convention, including member rotation.
 * Rows map global vectors into local coordinates: local = axes · global.
 */
export function memberLocalAxes(start: Vec3, end: Vec3, rotationDeg = 0) {
  const delta: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const length = Math.hypot(...delta);
  if (length <= EPSILON) return null;
  const x = scale(delta, 1 / length);
  let y: Vec3;
  let z: Vec3;
  if (isClose(start[0], end[0]) && isClose(start[2], end[2])) {
    y = end[1] > start[1] ? [-1, 0, 0] : [1, 0, 0];
    z = [0, 0, 1];
  } else if (isClose(start[1], end[1])) {
    y = [0, 1, 0];
    z = normalize(cross(x, y));
  } else {
    const projection: Vec3 = [delta[0], 0, delta[2]];
    z = normalize(end[1] > start[1] ? cross(projection, x) : cross(x, projection));
    y = normalize(cross(z, x));
  }
  if (rotationDeg) {
    const theta = (rotationDeg * Math.PI) / 180;
    const rotate = (v: Vec3) => normalize(add(
      scale(v, Math.cos(theta)),
      scale(cross(x, v), Math.sin(theta)),
      scale(x, dot(x, v) * (1 - Math.cos(theta))),
    ));
    y = rotate(y);
    z = rotate(z);
  }
  return { x, y, z, length };
}

export function localToGlobal(axes: { x: Vec3; y: Vec3; z: Vec3 }, local: Vec3): Vec3 {
  return add(scale(axes.x, local[0]), scale(axes.y, local[1]), scale(axes.z, local[2]));
}

export function memberEnds(model: FrameModel, member: FrameMember) {
  const start = model.nodes.find((node) => node.id === member.start_node);
  const end = model.nodes.find((node) => node.id === member.end_node);
  return start && end ? { start: nodePosition(start), end: nodePosition(end) } : null;
}

export function modelExtent(model: FrameModel) {
  if (!model.nodes.length) return 1;
  const axes = [0, 1, 2].map((index) => model.nodes.map((node) => nodePosition(node)[index]));
  return Math.max(...axes.map((values) => Math.max(...values) - Math.min(...values)), 1);
}

/**
 * Deformed global positions along a member from solver stations. PyNite station
 * deflections are total local displacements, so they map to global through the
 * member axes without adding end-node displacements again.
 */
export function deformedMemberPoints(
  model: FrameModel,
  member: FrameMember,
  result: PyniteMemberResult,
  magnification: number,
): Vec3[] {
  const ends = memberEnds(model, member);
  const axes = ends ? memberLocalAxes(ends.start, ends.end, member.rotation_degrees ?? 0) : null;
  if (!ends || !axes) return [];
  return result.stations
    .filter((station) => [station.x_m, station.deflection_x_m, station.deflection_y_m, station.deflection_z_m].every(Number.isFinite))
    .map((station) => add(
      ends.start,
      scale(axes.x, station.x_m),
      scale(localToGlobal(axes, [station.deflection_x_m, station.deflection_y_m, station.deflection_z_m]), magnification),
    ));
}

/** Largest absolute station displacement over all members, in metres. */
export function maxDisplacement(results: PyniteMemberResult[]) {
  return results.reduce((maximum, member) => member.stations.reduce((inner, station) => {
    const magnitude = Math.hypot(station.deflection_x_m, station.deflection_y_m, station.deflection_z_m);
    return Number.isFinite(magnitude) ? Math.max(inner, magnitude) : inner;
  }, maximum), 0);
}

/** Auto magnification so the largest displacement draws at roughly `fraction` of the model extent. */
export function autoMagnification(model: FrameModel, results: PyniteMemberResult[], fraction = 0.08) {
  const displacement = maxDisplacement(results);
  return displacement > EPSILON ? (modelExtent(model) * fraction) / displacement : 1;
}

/** Inverse of projectPoint for editable orthographic views, keeping the out-of-plane coordinate. */
export function unprojectToPlane(screen: { x: number; y: number }, camera: Camera, depth: number): Vec3 | null {
  const { right, up, toward } = cameraBasis(camera);
  const point = add(scale(right, screen.x), scale(up, screen.y), scale(toward, depth));
  return point.every(Number.isFinite) ? point.map((value) => Math.abs(value) < 1e-12 ? 0 : value) as Vec3 : null;
}

export function snap(value: number, step: number) {
  if (!(step > 0)) return value;
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(6));
}
