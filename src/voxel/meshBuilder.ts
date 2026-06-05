import { BufferGeometry, Float32BufferAttribute } from "three";
import type { VoxelData } from "./VoxelData";
import type { DssSettings } from "./dss";
import type { AoSettings } from "./ao";
import type { Palette } from "./palette";
import { hexToRgb01 } from "./palette";
import { buildVoxelMeshArrays } from "./meshBuilderCore";

export interface MeshBuildResult {
  geometry: BufferGeometry;
  faceCount: number;
}

/**
 * Build a culled, vertex-colored surface mesh for the voxel volume.
 *
 * Normals come from the chosen DSS mode:
 *  - "cube": geometric cube-face normals (classic voxel look).
 *  - "perVoxel": one derived normal per voxel (whitepaper 10.1).
 *  - "vertexInterpolated": continuous derived normals per vertex (10.2).
 *
 * Voxels are emitted centered on integer coordinates and offset by +0.5 so the
 * volume sits in the positive octant (the cell [0,0,0] spans world 0..1).
 */
export function buildVoxelMesh(
  data: VoxelData,
  palette: Palette,
  settings: DssSettings,
  ao: AoSettings,
): MeshBuildResult {
  const { positions, normals, colors, indices, faceCount } = buildVoxelMeshArrays(
    data,
    settings,
    ao,
    (colors, { colorIndex, aoFactor }) => {
      const [r, g, b] = hexToRgb01(palette[colorIndex] ?? "#ffffff");
      colors.push(r * aoFactor, g * aoFactor, b * aoFactor);
    },
  );

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return { geometry, faceCount };
}
