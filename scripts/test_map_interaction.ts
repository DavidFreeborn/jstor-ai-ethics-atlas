import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  backingSize,
  cameraFor3D,
  normalise3D,
  openingCamera,
  OPENING_ZOOM,
  orbit3D,
  pan2D,
  pan3D,
  project2D,
  project3D,
  scale2D,
  wheelFactor,
  zoom2D,
  zoom3D,
  type Camera3D,
  type Vec3,
} from '../lib/map-camera.ts';
import {
  facetGroup,
  groupFingerprint,
  topicGroup,
} from '../lib/paper-selection.ts';
import { decodeHtmlEntities } from '../lib/display-text.ts';
import type { MapData } from '../lib/atlas-types.ts';
const data: MapData = JSON.parse(readFileSync('public/data/map.json', 'utf8'));
const source = JSON.parse(
  readFileSync('public/data/projection-3d.json', 'utf8'),
);
const size = { width: 1144, height: 832 },
  base = scale2D(data.geometry.bounds, size);
const initial = openingCamera(data.points);
assert.equal(initial.zoom, OPENING_ZOOM);
assert.deepEqual(project2D(initial, initial, base, size), {
  x: size.width / 2,
  y: size.height / 2,
});
const visible = data.points.filter((p) => {
  const v = project2D(p, initial, base, size);
  return v.x >= 0 && v.x <= size.width && v.y >= 0 && v.y <= size.height;
}).length;
assert(
  visible > data.points.length * 0.7 && visible < data.points.length * 0.95,
  `Opening view should frame the main group (${visible})`,
);
let camera = initial;
for (let i = 0; i < 20000; i++) {
  const anchor = { x: (i * 47) % size.width, y: (i * 29) % size.height };
  const world = {
    x: camera.x + (anchor.x - size.width / 2) / (base * camera.zoom),
    y: camera.y - (anchor.y - size.height / 2) / (base * camera.zoom),
  };
  camera = zoom2D(camera, i % 2 ? 1.25 : 0.8, anchor, base, size);
  const projected = project2D(world, camera, base, size);
  assert(
    Math.abs(projected.x - anchor.x) < 1e-6 &&
      Math.abs(projected.y - anchor.y) < 1e-6,
  );
  camera = pan2D(camera, (i % 7) - 3, (i % 5) - 2, base);
  assert(Object.values(camera).every(Number.isFinite));
}
for (const bad of [NaN, Infinity, -Infinity, 0, -1])
  assert.deepEqual(zoom2D(initial, bad, { x: 0, y: 0 }, base, size), initial);
assert.equal(zoom2D(initial, 1e300, { x: 0, y: 0 }, base, size).zoom, 64);
assert.equal(zoom2D(initial, 1e-300, { x: 0, y: 0 }, base, size).zoom, 0.5);
assert.equal(wheelFactor(1, 1, 800), wheelFactor(16, 0, 800));
assert.equal(wheelFactor(1, 2, 800), wheelFactor(800, 0, 800));
assert.deepEqual(
  source.ids,
  data.points.map((p) => p.id),
);
assert.equal(new Set(source.ids).size, 7076);
assert(
  source.coordinates.every(
    (p: Vec3) => p.length === 3 && p.every(Number.isFinite),
  ),
);
const coordinates = normalise3D(source.coordinates);
let camera3 = cameraFor3D(coordinates);
const origin: Camera3D = { target: [0, 0, 0], distance: 3, yaw: 0, pitch: 0 };
assert.deepEqual(project3D([0, 0, 0], origin, size), {
  x: size.width / 2,
  y: size.height / 2,
  depth: 3,
});
assert.equal(project3D([0, 0, 4], origin, size), null);
assert.equal(project3D([NaN, 0, 0], origin, size), null);
const fit = cameraFor3D(coordinates, true);
assert(
  coordinates.every((p) => {
    const v = project3D(p, fit, size);
    return v && v.x >= 0 && v.y >= 0 && v.x <= size.width && v.y <= size.height;
  }),
);
for (let i = 0; i < 20000; i++) {
  camera3 = orbit3D(camera3, (i % 19) - 9, (i % 11) - 5);
  camera3 = zoom3D(camera3, i % 2 ? 1.25 : 0.8);
  camera3 = pan3D(camera3, (i % 7) - 3, (i % 5) - 2, size);
  assert(
    [...camera3.target, camera3.yaw, camera3.pitch, camera3.distance].every(
      Number.isFinite,
    ),
  );
  assert(camera3.distance >= 0.08 && camera3.distance <= 30);
  assert(Math.abs(camera3.pitch) <= 1.515);
}
for (const size of [
  { width: 100, height: 100 },
  { width: 7680, height: 4320 },
])
  for (const dpr of [1, 2, 4, Infinity]) {
    const b = backingSize(size, dpr);
    assert(b.width * b.height <= 8000000);
    assert(b.width > 0 && b.height > 0);
  }
const topic = data.topics.bertopic[0],
  group = topicGroup(data.points, 'bertopic', topic.id, topic.label),
  hash = groupFingerprint(group.ids);
assert.equal(
  group.ids.size,
  data.points.filter((p) => p.bertopic === topic.id).length,
);
for (const lens of ['publisher', 'journal', 'keywords'] as const) {
  const other = facetGroup(data.points, lens, ['not a value']);
  assert.equal(other.ids.size, 0);
  assert.equal(groupFingerprint(group.ids), hash);
}
const keys = data.facets.keywords.slice(0, 10).map((v) => v.value),
  keywords = facetGroup(data.points, 'keywords', keys);
assert.deepEqual(
  [...keywords.ids].sort(),
  data.points
    .filter((p) => p.keywords.some((k) => keys.includes(k)))
    .map((p) => p.id)
    .sort(),
);
assert.equal(groupFingerprint(new Set([...group.ids].reverse())), hash);
assert.equal(decodeHtmlEntities('A &amp; B &#x1F600;'), 'A & B 😀');
assert.equal(decodeHtmlEntities('&#999999999999; &#xD800;'), '� �');
console.log(
  `Camera, projection, selection and entity tests passed. Initial view: ${visible}/7076 papers; 40,000 finite interaction updates.`,
);
