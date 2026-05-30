import type { VoxelData } from "./VoxelData";

/** Palette index used for all starter shapes (slot 1 is white in the default palette). */
export const STARTER_COLOR = 1;

export type StarterShapeId = "sphere" | "cylinder" | "blob" | "csg";

export interface StarterShapeDef {
  id: StarterShapeId;
  label: string;
  description: string;
}

export const STARTER_SHAPES: StarterShapeDef[] = [
  {
    id: "sphere",
    label: "Sphere",
    description: "Smooth round form",
  },
  {
    id: "cylinder",
    label: "Cylinder",
    description: "Vertical column",
  },
  {
    id: "blob",
    label: "Blob",
    description: "Organic terrain-like mound",
  },
  {
    id: "csg",
    label: "Blocks",
    description: "Cuboids added and carved away",
  },
];

type OccupancyFn = (x: number, y: number, z: number) => boolean;

function fillFromPredicate(
  data: VoxelData,
  isSolid: OccupancyFn,
  color: number,
): void {
  const { x: dx, y: dy, z: dz } = data.dims;
  for (let x = 0; x < dx; x++)
    for (let y = 0; y < dy; y++)
      for (let z = 0; z < dz; z++) {
        if (isSolid(x, y, z)) data.set(x, y, z, color);
      }
}

function inBox(
  x: number,
  y: number,
  z: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
}

function makeSphere(data: VoxelData): OccupancyFn {
  const { x: dx, y: dy, z: dz } = data.dims;
  const cx = dx / 2;
  const cy = dy / 2;
  const cz = dz / 2;
  const r = Math.min(dx, dy, dz) * 0.32;
  return (x, y, z) =>
    Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) <= r;
}

function makeCylinder(data: VoxelData): OccupancyFn {
  const { x: dx, y: dy, z: dz } = data.dims;
  const cx = dx / 2;
  const cy = dy / 2;
  const cz = dz / 2;
  const radius = Math.min(dx, dz) * 0.22;
  const halfHeight = dy * 0.28;
  return (x, y, z) => {
    const dx_ = x + 0.5 - cx;
    const dy_ = y + 0.5 - cy;
    const dz_ = z + 0.5 - cz;
    return dx_ * dx_ + dz_ * dz_ <= radius * radius && Math.abs(dy_) <= halfHeight;
  };
}

function makeBlob(data: VoxelData): OccupancyFn {
  const { x: dx, y: dy, z: dz } = data.dims;
  const cx = dx / 2;
  const cy = dy / 2 - 2;
  const cz = dz / 2;
  const scale = Math.min(dx, dy, dz) / 32;

  return (x, y, z) => {
    const wx = (x + 0.5 - cx) / scale;
    const wy = (y + 0.5 - cy) / scale;
    const wz = (z + 0.5 - cz) / scale;
    const h = 1.2 * Math.sin(wx * 0.9) + 1.0 * Math.cos(wz * 0.8) + 1.0;
    return wy <= h && wy >= -3.5 && Math.hypot(wx, wz) < 5.3;
  };
}

/** A small architectural form built from union/subtraction of axis-aligned boxes. */
function makeCsg(_data: VoxelData): OccupancyFn {
  return (x, y, z) => {
    // Main hall.
    let solid = inBox(x, y, z, 9, 5, 9, 23, 17, 23);
    // Hollow interior.
    solid = solid && !inBox(x, y, z, 12, 7, 12, 20, 15, 20);
    // Chimney stack.
    solid = solid || inBox(x, y, z, 14, 17, 14, 17, 25, 17);
    // Side wings.
    solid = solid || inBox(x, y, z, 4, 8, 11, 8, 13, 21);
    solid = solid || inBox(x, y, z, 24, 8, 11, 28, 13, 21);
    // Front porch slab.
    solid = solid || inBox(x, y, z, 11, 4, 4, 21, 5, 8);
    // Carve doorway and windows.
    solid = solid && !inBox(x, y, z, 14, 5, 8, 17, 10, 9);
    solid = solid && !inBox(x, y, z, 8, 9, 15, 9, 12, 17);
    solid = solid && !inBox(x, y, z, 23, 9, 15, 24, 12, 17);
    // Corner notch subtracted from the main block.
    solid = solid && !inBox(x, y, z, 21, 14, 21, 24, 17, 24);
    return solid;
  };
}

const BUILDERS: Record<StarterShapeId, (data: VoxelData) => OccupancyFn> = {
  sphere: makeSphere,
  cylinder: makeCylinder,
  blob: makeBlob,
  csg: makeCsg,
};

export function fillStarterShape(
  data: VoxelData,
  shape: StarterShapeId,
  color: number = STARTER_COLOR,
): void {
  data.clear();
  fillFromPredicate(data, BUILDERS[shape](data), color);
}
