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

export type CageInput = {
  width: number;
  depth: number;
  coverMm: number;
  tieMm: number;
  bottom: { count: number; diameterMm: number };
  top: { count: number; diameterMm: number };
  sidePerFace: number;
  sideDiameterMm: number;
};

/**
 * Bars for a rectangular cage from counts and sizes, measured to the bar centre as
 * cover + tie + Ø/2 from each face. Side bars are spaced evenly between the top and bottom
 * rows. Geometry only: cover, spacing and detailing adequacy are not checked here.
 */
export function cageBars(input: CageInput): { bars: SectionBar[]; error: string } {
  const { width, depth, coverMm, tieMm, bottom, top, sidePerFace, sideDiameterMm } = input;
  if (!(width > 0 && depth > 0)) return { bars: [], error: "Enter the section width and depth." };
  if (!(coverMm >= 0 && tieMm >= 0)) return { bars: [], error: "Cover and tie size must be zero or more." };
  const counts = [bottom.count, top.count, sidePerFace];
  if (!counts.every((count) => Number.isInteger(count) && count >= 0)) return { bars: [], error: "Bar counts must be whole numbers." };
  if (bottom.count + top.count + 2 * sidePerFace === 0) return { bars: [], error: "Add at least one bar." };

  const rows: SectionBar[] = [];
  const row = (prefix: string, count: number, diameter: number, y: number) => {
    if (!count) return null;
    if (!(diameter > 0)) return `Choose a ${prefix === "B" ? "bottom" : "top"} bar size.`;
    const inset = coverMm + tieMm + diameter / 2;
    if (2 * inset > width || count * diameter > width - 2 * (coverMm + tieMm)) return `The ${prefix === "B" ? "bottom" : "top"} bars do not fit across the width.`;
    for (let index = 0; index < count; index += 1) {
      const x = count === 1 ? width / 2 : inset + ((width - 2 * inset) * index) / (count - 1);
      rows.push({ id: `${prefix}${index + 1}`, area_mm2: barAreaFromDiameter(diameter), x_mm: Number(x.toFixed(1)), y_mm: Number(y.toFixed(1)) });
    }
    return null;
  };
  const yBottom = coverMm + tieMm + bottom.diameterMm / 2;
  const yTop = depth - (coverMm + tieMm + top.diameterMm / 2);
  const error = row("B", bottom.count, bottom.diameterMm, yBottom) ?? row("T", top.count, top.diameterMm, yTop);
  if (error) return { bars: [], error };
  if (yTop <= yBottom && bottom.count && top.count) return { bars: [], error: "The top and bottom bars overlap; increase the depth or reduce the cover." };

  if (sidePerFace) {
    if (!(sideDiameterMm > 0)) return { bars: [], error: "Choose a side bar size." };
    const x = coverMm + tieMm + sideDiameterMm / 2;
    const low = bottom.count ? yBottom : coverMm + tieMm + sideDiameterMm / 2;
    const high = top.count ? yTop : depth - (coverMm + tieMm + sideDiameterMm / 2);
    let id = 1;
    for (let index = 1; index <= sidePerFace; index += 1) {
      const y = low + ((high - low) * index) / (sidePerFace + 1);
      for (const xPosition of [x, width - x]) {
        rows.push({ id: `S${id}`, area_mm2: barAreaFromDiameter(sideDiameterMm), x_mm: Number(xPosition.toFixed(1)), y_mm: Number(y.toFixed(1)) });
        id += 1;
      }
    }
  }
  return { bars: rows, error: "" };
}
