export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function setVec3(v: Vec3, x: number, y: number, z: number): Vec3 {
  v.x = x;
  v.y = y;
  v.z = z;
  return v;
}

export function lengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(lengthSq(v));
  if (len < 1e-8) return setVec3(v, 0, 1, 0);
  v.x /= len;
  v.y /= len;
  v.z /= len;
  return v;
}

export function subVec3(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function addScaledVec3(out: Vec3, v: Vec3, scale: number): Vec3 {
  out.x += v.x * scale;
  out.y += v.y * scale;
  out.z += v.z * scale;
  return out;
}

export function resetVec3(v: Vec3): Vec3 {
  return setVec3(v, 0, 0, 0);
}
