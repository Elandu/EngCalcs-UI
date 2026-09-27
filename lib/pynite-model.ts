export type FrameNode = {
  id: string;
  x_m: number;
  y_m: number;
  z_m: number;
};

export type FrameMaterial = {
  id: string;
  elastic_modulus_kpa: number;
  poisson_ratio: number;
  density_tonnes_m3: number;
};

export type FrameSection = {
  id: string;
  area_m2: number;
  iy_m4: number;
  iz_m4: number;
  j_m4: number;
};

export type FrameMember = {
  id: string;
  start_node: string;
  end_node: string;
  material: string;
  section: string;
  rotation_degrees?: number;
};

export type FrameSupport = {
  node_id: string;
  dx: boolean;
  dy: boolean;
  dz: boolean;
  rx: boolean;
  ry: boolean;
  rz: boolean;
};

export type FrameLoadCase = { id: string; name: string };

export type FrameNodeLoad = {
  node_id: string;
  load_case: string;
  direction: "FX" | "FY" | "FZ" | "MX" | "MY" | "MZ";
  value: number;
};

export type FrameDistributedLoad = {
  member_id: string;
  load_case: string;
  direction: "Fx" | "Fy" | "Fz" | "FX" | "FY" | "FZ";
  start_kn_m: number;
  end_kn_m: number;
  start_m?: number;
  end_m?: number;
};

export type FrameLoadCombination = {
  id: string;
  factors: Record<string, number>;
};

export type FrameModel = {
  nodes: FrameNode[];
  materials: FrameMaterial[];
  sections: FrameSection[];
  members: FrameMember[];
  supports: FrameSupport[];
  load_cases: FrameLoadCase[];
  node_loads: FrameNodeLoad[];
  member_distributed_loads: FrameDistributedLoad[];
  load_combinations: FrameLoadCombination[];
};

export type PyniteInputs = {
  analysis_type: "linear" | "p_delta";
  model: FrameModel;
};

export type PyniteStation = {
  x_m: number;
  axial_kn: number;
  shear_y_kn: number;
  shear_z_kn: number;
  moment_y_knm: number;
  moment_z_knm: number;
  deflection_x_m: number;
  deflection_y_m: number;
  deflection_z_m: number;
};

export type PyniteNodeResult = {
  load_combination: string;
  node_id: string;
  dx_m: number;
  dy_m: number;
  dz_m: number;
  rx_rad: number;
  ry_rad: number;
  rz_rad: number;
  reaction_fx_kn: number;
  reaction_fy_kn: number;
  reaction_fz_kn: number;
  reaction_mx_knm: number;
  reaction_my_knm: number;
  reaction_mz_knm: number;
};

export type PyniteMemberResult = {
  load_combination: string;
  member_id: string;
  length_m: number;
  stations: PyniteStation[];
};

export type PyniteResult = {
  solver: { name: string; version: string };
  analysis_type: "linear" | "p_delta";
  load_combinations: string[];
  node_results: PyniteNodeResult[];
  member_results: PyniteMemberResult[];
  warnings: string[];
  limitations: string[];
  _provenance?: Record<string, unknown>;
};

export const SAMPLE_FRAME_INPUTS: PyniteInputs = {
  analysis_type: "linear",
  model: {
    nodes: [
      { id: "N1", x_m: 0, y_m: 0, z_m: 0 },
      { id: "N2", x_m: 6, y_m: 0, z_m: 0 },
    ],
    materials: [
      {
        id: "Steel",
        elastic_modulus_kpa: 200_000_000,
        poisson_ratio: 0.3,
        density_tonnes_m3: 7.85,
      },
    ],
    sections: [
      {
        id: "DemoSection",
        area_m2: 0.0023,
        iy_m4: 0.0000067,
        iz_m4: 0.000084,
        j_m4: 0.00000026,
      },
    ],
    members: [
      {
        id: "M1",
        start_node: "N1",
        end_node: "N2",
        material: "Steel",
        section: "DemoSection",
      },
    ],
    supports: [
      { node_id: "N1", dx: true, dy: true, dz: true, rx: true, ry: true, rz: false },
      { node_id: "N2", dx: false, dy: true, dz: true, rx: true, ry: true, rz: false },
    ],
    load_cases: [{ id: "D", name: "Dead" }],
    node_loads: [],
    member_distributed_loads: [
      {
        member_id: "M1",
        load_case: "D",
        direction: "FY",
        start_kn_m: -2,
        end_kn_m: -2,
      },
    ],
    load_combinations: [{ id: "Service", factors: { D: 1 } }],
  },
};

export function isPyniteInputs(value: unknown): value is PyniteInputs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PyniteInputs>;
  return Boolean(
    candidate.model &&
      Array.isArray(candidate.model.nodes) &&
      Array.isArray(candidate.model.members) &&
      Array.isArray(candidate.model.materials) &&
      Array.isArray(candidate.model.sections) &&
      Array.isArray(candidate.model.supports) &&
      Array.isArray(candidate.model.load_cases) &&
      Array.isArray(candidate.model.load_combinations),
  );
}
