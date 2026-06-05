import type { VoxelData } from "./VoxelData";
import type { DssSettings } from "./dss";
import type { AoSettings } from "./ao";
import { NormalFieldCache } from "./dss";
import { OcclusionFieldCache } from "./ao";
import { FACES } from "./faces";
export interface MeshArrays {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  faceCount: number;
}

export interface MeshColorInput {
  colorIndex: number;
  aoFactor: number;
}

/**
 * Build a culled surface mesh as plain arrays.
 *
 * Geometry is one quad per exposed face with unique vertices (no sharing),
 * which is required for per-vertex derived normals.
 */
export function buildVoxelMeshArrays(
  data: VoxelData,
  settings: DssSettings,
  ao: AoSettings,
  pushColor: (colors: number[], input: MeshColorInput) => void,
): MeshArrays {
  const cache = new NormalFieldCache(data, settings);
  const aoCache =
    ao.mode === "off" ? null : new OcclusionFieldCache(data, ao);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  let faceCount = 0;

  data.forEach((v) => {
    const baseNormal =
      settings.shading === "cube" ? null : cache.get(v.x, v.y, v.z);
    const baseAo = aoCache ? aoCache.get(v.x, v.y, v.z) : 1;

    for (const f of FACES) {
      if (data.isSolid(v.x + f.d[0], v.y + f.d[1], v.z + f.d[2])) continue;

      for (const c of f.corners) {
        let normal = f.n;
        if (settings.shading === "vertexInterpolated") {
          normal = cache.vertexNormal(v.x, v.y, v.z, c, baseNormal!);
        } else if (settings.shading === "perVoxel") {
          normal = baseNormal!;
        }

        let aoFactor = 1;
        if (aoCache) {
          aoFactor =
            ao.mode === "vertexInterpolated"
              ? aoCache.vertexAO(v.x, v.y, v.z, c, baseAo)
              : baseAo;
        }

        positions.push(
          v.x + 0.5 + c[0],
          v.y + 0.5 + c[1],
          v.z + 0.5 + c[2],
        );
        normals.push(normal.x, normal.y, normal.z);
        pushColor(colors, { colorIndex: v.color, aoFactor });
      }

      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
      faceCount++;
    }
  });

  return { positions, normals, colors, indices, faceCount };
}
