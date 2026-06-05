import type { Vec3 } from "./vec3";
import { vec3 } from "./vec3";

export interface FaceDef {
  /** Geometric cube-face normal. */
  n: Vec3;
  /** Neighbor direction used for face culling. */
  d: [number, number, number];
  /** Four corner offsets in local cube space (unit cube centered at origin). */
  corners: [number, number, number][];
}

export const FACES: FaceDef[] = [
  {
    n: vec3(1, 0, 0),
    d: [1, 0, 0],
    corners: [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    n: vec3(-1, 0, 0),
    d: [-1, 0, 0],
    corners: [
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
  {
    n: vec3(0, 1, 0),
    d: [0, 1, 0],
    corners: [
      [-0.5, 0.5, -0.5],
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
    ],
  },
  {
    n: vec3(0, -1, 0),
    d: [0, -1, 0],
    corners: [
      [-0.5, -0.5, 0.5],
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    n: vec3(0, 0, 1),
    d: [0, 0, 1],
    corners: [
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
  },
  {
    n: vec3(0, 0, -1),
    d: [0, 0, -1],
    corners: [
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5],
    ],
  },
];
