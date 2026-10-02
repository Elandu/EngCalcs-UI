/**
 * Geometry helpers for the reinforced concrete section editor. These describe and draw the
 * model only; section mechanics and capacities come from the calculation engine.
 */

export type Point = { x: number; y: number };

export type SectionBar = { id: string; area_mm2: number; x_mm: number; y_mm: number };

export const BAR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;

export function barAreaFromDiameter(diameterMm: number) {
  return Number(((Math.PI * diameterMm * diameterMm) / 4).toFixed(1));
}

export function barDiameterFromArea(areaMm2: number) {
  return areaMm2 > 0 ? Math.sqrt((4 * areaMm2) / Math.PI) : 0;
}

export function nextBarId(existing: string[], prefix = "B") {
  const used = new Set(existing);
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

/**
 * Evenly spaced bars across the section width at a fixed distance from the top or bottom face.
 * `edgeMm` is measured from each face to the bar centre.
 */
export function layerBars({
  width,
  depth,
  count,
  diameterMm,
  edgeMm,
  face,
  existingIds,
}: {
  width: number;
  depth: number;
  count: number;
  diameterMm: number;
  edgeMm: number;
  face: "top" | "bottom";
  existingIds: string[];
}): SectionBar[] {
  if (!(width > 0 && depth > 0 && diameterMm > 0 && edgeMm >= 0) || !Number.isInteger(count) || count < 1) return [];
  if (2 * edgeMm > width || edgeMm > depth) return [];
  const y = face === "bottom" ? edgeMm : depth - edgeMm;
  const area = barAreaFromDiameter(diameterMm);
  const ids = [...existingIds];
  return Array.from({ length: count }, (_, index) => {
    const x = count === 1 ? width / 2 : edgeMm + ((width - 2 * edgeMm) * index) / (count - 1);
    const id = nextBarId(ids);
    ids.push(id);
    return { id, area_mm2: area, x_mm: Number(x.toFixed(1)), y_mm: Number(y.toFixed(1)) };
  });
}

/**
 * Unit normal pointing toward the compressed face. The engine measures the neutral-axis angle
 * counterclockwise from +x; zero compresses the top face and +90° compresses the left face.
 */
export function compressionNormal(angleDeg: number): Point {
  const theta = (angleDeg * Math.PI) / 180;
  return { x: -Math.sin(theta), y: Math.cos(theta) };
}

function clipHalfPlane(polygon: Point[], normal: Point, offset: number) {
  const inside = (point: Point) => point.x * normal.x + point.y * normal.y >= offset - 1e-9;
  const output: Point[] = [];
  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const a = previous.x * normal.x + previous.y * normal.y - offset;
      const b = current.x * normal.x + current.y * normal.y - offset;
      const t = a / (a - b);
      output.push({ x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t });
    }
    if (currentInside) output.push(current);
  });
  return output;
}

/**
 * Compression zone polygon and neutral-axis segment for a rectangular section, from the
 * engine's neutral-axis angle and depth (measured from the extreme compression fibre).
 */
export function neutralAxisGeometry(width: number, depth: number, angleDeg: number, neutralAxisDepth: number) {
  if (!(width > 0 && depth > 0 && neutralAxisDepth >= 0) || !Number.isFinite(angleDeg)) return null;
  const rectangle: Point[] = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }];
  const normal = compressionNormal(angleDeg);
  const extreme = Math.max(...rectangle.map((point) => point.x * normal.x + point.y * normal.y));
  const offset = extreme - neutralAxisDepth;
  const zone = clipHalfPlane(rectangle, normal, offset);
  const axis = zone.filter((point) => Math.abs(point.x * normal.x + point.y * normal.y - offset) < 1e-6);
  return { normal, zone, axis: axis.length >= 2 ? [axis[0], axis[axis.length - 1]] as const : null };
}
