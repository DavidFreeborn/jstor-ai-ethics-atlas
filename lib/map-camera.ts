/** Camera mathematics; these distances describe a projection, not semantic metrics. */
export type Vec3 = [number, number, number];
export type Viewport = { width: number; height: number };
export type XY = { x: number; y: number };
export type Camera2D = { x: number; y: number; zoom: number };
export type Camera3D = {
  target: Vec3;
  yaw: number;
  pitch: number;
  distance: number;
};
export type Bounds2D = { x: [number, number]; y: [number, number] };
export const OPENING_ZOOM = 1.25 ** 5.5;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const finite = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);
export const quantile = (values: number[], q: number) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
};
export function openingCamera(points: XY[], zoom = OPENING_ZOOM): Camera2D {
  return {
    x: quantile(
      points.map((p) => p.x),
      0.5,
    ),
    y: quantile(
      points.map((p) => p.y),
      0.5,
    ),
    zoom,
  };
}
export function scale2D(bounds: Bounds2D, size: Viewport) {
  return Math.max(
    0.00001,
    Math.min(
      Math.max(1, size.width - 60) /
        Math.max(0.00001, bounds.x[1] - bounds.x[0]),
      Math.max(1, size.height - 60) /
        Math.max(0.00001, bounds.y[1] - bounds.y[0]),
    ),
  );
}
export function project2D(
  point: XY,
  camera: Camera2D,
  base: number,
  size: Viewport,
): XY {
  return {
    x: size.width / 2 + (point.x - camera.x) * base * camera.zoom,
    y: size.height / 2 - (point.y - camera.y) * base * camera.zoom,
  };
}
export function pan2D(
  camera: Camera2D,
  dx: number,
  dy: number,
  base: number,
): Camera2D {
  const scale = base * camera.zoom;
  return {
    ...camera,
    x: clamp(finite(camera.x - dx / scale, camera.x), -1e6, 1e6),
    y: clamp(finite(camera.y + dy / scale, camera.y), -1e6, 1e6),
  };
}
export function zoom2D(
  camera: Camera2D,
  factor: number,
  anchor: XY,
  base: number,
  size: Viewport,
): Camera2D {
  if (!Number.isFinite(factor) || factor <= 0) return camera;
  const zoom = clamp(camera.zoom * factor, 0.5, 64),
    delta = (1 / camera.zoom - 1 / zoom) / base;
  return {
    zoom,
    x: clamp(
      finite(camera.x + (anchor.x - size.width / 2) * delta, camera.x),
      -1e6,
      1e6,
    ),
    y: clamp(
      finite(camera.y - (anchor.y - size.height / 2) * delta, camera.y),
      -1e6,
      1e6,
    ),
  };
}
export function basis3D(camera: Camera3D) {
  const cy = Math.cos(camera.yaw),
    sy = Math.sin(camera.yaw),
    cp = Math.cos(camera.pitch),
    sp = Math.sin(camera.pitch);
  return {
    right: [cy, 0, -sy] as Vec3,
    up: [-sy * sp, cp, -cy * sp] as Vec3,
    back: [sy * cp, sp, cy * cp] as Vec3,
  };
}
export const focalLength = (size: Viewport) =>
  Math.min(size.width, size.height) / (2 * Math.tan((46 * Math.PI) / 360));
export function project3D(
  point: Vec3,
  camera: Camera3D,
  size: Viewport,
  basis = basis3D(camera),
) {
  const [x, y, z] = point.map((v, i) => v - camera.target[i]);
  const depth =
    camera.distance -
    (x * basis.back[0] + y * basis.back[1] + z * basis.back[2]);
  if (!Number.isFinite(depth) || depth < 0.025 || depth > 100) return null;
  const f = focalLength(size) / depth;
  return {
    x:
      size.width / 2 +
      (x * basis.right[0] + y * basis.right[1] + z * basis.right[2]) * f,
    y:
      size.height / 2 -
      (x * basis.up[0] + y * basis.up[1] + z * basis.up[2]) * f,
    depth,
  };
}
export function orbit3D(camera: Camera3D, dx: number, dy: number): Camera3D {
  return {
    ...camera,
    yaw: finite((camera.yaw - dx * 0.006) % (Math.PI * 2), camera.yaw),
    pitch: clamp(
      finite(camera.pitch + dy * 0.006, camera.pitch),
      -1.515,
      1.515,
    ),
  };
}
export function pan3D(
  camera: Camera3D,
  dx: number,
  dy: number,
  size: Viewport,
): Camera3D {
  const { right, up } = basis3D(camera),
    scale = camera.distance / focalLength(size);
  return {
    ...camera,
    target: camera.target.map((v, i) =>
      clamp(
        finite(v - dx * scale * right[i] + dy * scale * up[i], v),
        -100,
        100,
      ),
    ) as Vec3,
  };
}
export function zoom3D(camera: Camera3D, factor: number): Camera3D {
  return !Number.isFinite(factor) || factor <= 0
    ? camera
    : { ...camera, distance: clamp(camera.distance / factor, 0.08, 30) };
}
export function normalise3D(coordinates: Vec3[]) {
  const bounds = [0, 1, 2].map((i) => [
    Math.min(...coordinates.map((p) => p[i])),
    Math.max(...coordinates.map((p) => p[i])),
  ]);
  const span = Math.max(...bounds.map(([lo, hi]) => hi - lo), 0.00001);
  return coordinates.map(
    (p) =>
      p.map(
        (v, i) => ((v - (bounds[i][0] + bounds[i][1]) / 2) * 2) / span,
      ) as Vec3,
  );
}
export function cameraFor3D(points: Vec3[], fitAll = false): Camera3D {
  const target = [0, 1, 2].map((i) =>
    quantile(
      points.map((p) => p[i]),
      0.5,
    ),
  ) as Vec3;
  const radii = points.map((p) =>
    Math.hypot(...p.map((v, i) => v - target[i])),
  );
  // The upper quartile frames the dense body; the next quantile includes distant islands.
  const radius = fitAll ? Math.max(...radii) : quantile(radii, 0.75);
  return {
    target,
    yaw: 0.36,
    pitch: 0.24,
    distance: clamp((radius / Math.sin((46 * Math.PI) / 360)) * 1.06, 0.3, 30),
  };
}
export function backingSize(size: Viewport, dpr: number) {
  const ratio = Math.min(
    clamp(finite(dpr, 1), 0.5, 2),
    Math.sqrt(8_000_000 / Math.max(1, size.width * size.height)),
  );
  return {
    width: Math.max(1, Math.floor(size.width * ratio)),
    height: Math.max(1, Math.floor(size.height * ratio)),
    ratio,
  };
}
export function wheelFactor(delta: number, mode: number, height: number) {
  const pixels = finite(delta) * (mode === 1 ? 16 : mode === 2 ? height : 1);
  return Math.exp(clamp(-pixels * 0.0012, -2, 2));
}
