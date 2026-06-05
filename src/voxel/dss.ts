import type { VoxelData } from "./VoxelData";
import type { Vec3 } from "./vec3";
import {
  addScaledVec3,
  cloneVec3,
  lengthSq,
  normalize,
  setVec3,
  subVec3,
  vec3,
} from "./vec3";

/**
 * Derived Surface Shading (DSS).
 *
 * Implements the two normal-generation methods from the whitepaper:
 *  - "gradient": density-gradient field (direction from solid toward empty).
 *  - "centroid": occupancy-centroid field (direction away from nearby mass).
 *
 * Geometry is never changed; only the source of normal information is.
 * See whitepaper sections 6 and 7.
 */

export type NormalField = "gradient" | "centroid";
export type ShadingMode = "cube" | "perVoxel" | "vertexInterpolated";

export interface DssSettings {
  field: NormalField;
  shading: ShadingMode;
  /** Kernel radius r: 1 => 3x3x3, 2 => 5x5x5, etc. */
  kernelRadius: number;
}

export const DEFAULT_DSS: DssSettings = {
  field: "gradient",
  shading: "perVoxel",
  kernelRadius: 1,
};

function gaussianWeight(dx: number, dy: number, dz: number, r: number): number {
  const d2 = dx * dx + dy * dy + dz * dz;
  const sigma = Math.max(0.75, r * 0.65);
  return Math.exp(-d2 / (2 * sigma * sigma));
}

/**
 * Computes and caches derived surface normals for a voxel volume.
 *
 * A fresh cache should be created whenever the volume or DSS settings change.
 */
export class NormalFieldCache {
  private cache = new Map<number, Vec3>();

  constructor(
    private readonly data: VoxelData,
    private readonly settings: DssSettings,
  ) {}

  private key(x: number, y: number, z: number): number {
    return (x << 16) | (y << 8) | z;
  }

  get(x: number, y: number, z: number): Vec3 {
    const k = this.key(x, y, z);
    let n = this.cache.get(k);
    if (!n) {
      n = this.computeBaseNormal(x, y, z);
      this.cache.set(k, n);
    }
    return n;
  }

  private computeBaseNormal(x: number, y: number, z: number): Vec3 {
    const n =
      this.settings.field === "centroid"
        ? this.computeCentroidNormal(x, y, z)
        : this.computeGradientNormal(x, y, z);

    if (lengthSq(n) < 1e-4) {
      // Fall back to the direction away from the volume center.
      setVec3(
        n,
        x - this.data.dims.x / 2,
        y - this.data.dims.y / 2,
        z - this.data.dims.z / 2,
      );
      if (lengthSq(n) < 1e-4) setVec3(n, 0, 1, 0);
    }
    return normalize(n);
  }

  private computeCentroidNormal(x: number, y: number, z: number): Vec3 {
    const r = this.settings.kernelRadius;
    const centroid = vec3(0, 0, 0);
    let total = 0;

    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (!this.data.isSolid(x + dx, y + dy, z + dz)) continue;
          const w = gaussianWeight(dx, dy, dz, r);
          centroid.x += (x + dx) * w;
          centroid.y += (y + dy) * w;
          centroid.z += (z + dz) * w;
          total += w;
        }

    if (total <= 1e-4) return vec3(0, 0, 0);
    centroid.x /= total;
    centroid.y /= total;
    centroid.z /= total;
    return subVec3(vec3(), vec3(x, y, z), centroid);
  }

  private smoothedDensity(x: number, y: number, z: number, axisToIgnore: number): number {
    const r = this.settings.kernelRadius;
    let sum = 0;
    let total = 0;

    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++) {
          const wx = axisToIgnore === 0 ? 0 : dx;
          const wy = axisToIgnore === 1 ? 0 : dy;
          const wz = axisToIgnore === 2 ? 0 : dz;
          const w = gaussianWeight(wx, wy, wz, r);
          sum += (this.data.isSolid(x + dx, y + dy, z + dz) ? 1 : 0) * w;
          total += w;
        }

    return total > 0 ? sum / total : 0;
  }

  private computeGradientNormal(x: number, y: number, z: number): Vec3 {
    const r = this.settings.kernelRadius;
    const nx =
      this.smoothedDensity(x - r, y, z, 0) - this.smoothedDensity(x + r, y, z, 0);
    const ny =
      this.smoothedDensity(x, y - r, z, 1) - this.smoothedDensity(x, y + r, z, 1);
    const nz =
      this.smoothedDensity(x, y, z - r, 2) - this.smoothedDensity(x, y, z + r, 2);
    return vec3(nx, ny, nz);
  }

  /**
   * Vertex-interpolated normal: blend base normals of occupied voxels touching
   * a cube corner. `corner` is the local corner offset in {-0.5,+0.5}^3.
   */
  vertexNormal(
    vx: number,
    vy: number,
    vz: number,
    corner: [number, number, number],
    fallback: Vec3,
  ): Vec3 {
    const sx = corner[0] > 0 ? 1 : -1;
    const sy = corner[1] > 0 ? 1 : -1;
    const sz = corner[2] > 0 ? 1 : -1;

    const acc = vec3(0, 0, 0);
    let total = 0;

    for (const ox of [0, sx])
      for (const oy of [0, sy])
        for (const oz of [0, sz]) {
          const nx = vx + ox;
          const ny = vy + oy;
          const nz = vz + oz;
          if (!this.data.isSolid(nx, ny, nz)) continue;
          const n = this.get(nx, ny, nz);
          const w = ox === 0 && oy === 0 && oz === 0 ? 1.5 : 1.0;
          addScaledVec3(acc, n, w);
          total += w;
        }

    if (total <= 1e-4 || lengthSq(acc) < 1e-4) return cloneVec3(fallback);
    return normalize(acc);
  }
}
