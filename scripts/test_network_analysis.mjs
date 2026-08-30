import assert from 'node:assert/strict';

import {
  buildAdjacency,
  highestDegreeShortestPath,
  oneHop,
  separatedCommunityNodes,
  twoNeighbourhoods,
} from '../lib/network-analysis.ts';

const edges = [
  { source: 'a', target: 'b', weight: 1 },
  { source: 'a', target: 'c', weight: 1 },
  { source: 'b', target: 'd', weight: 1 },
  { source: 'c', target: 'd', weight: 1 },
];
const adjacency = buildAdjacency(edges);

assert.deepEqual([...oneHop('a', adjacency)].sort(), ['a', 'b', 'c']);
assert.deepEqual([...twoNeighbourhoods(['b', 'c'], adjacency)].sort(), ['a', 'b', 'c', 'd']);
assert.deepEqual(
  highestDegreeShortestPath('a', 'd', adjacency, new Map([['a', 2], ['b', 2], ['c', 9], ['d', 2]])),
  ['a', 'c', 'd'],
);
assert.equal(highestDegreeShortestPath('a', 'a', adjacency, new Map()), null);

const nodes = [
  { id: 'a', x: 0, y: 0, topCommunity: 1, splitCommunity: '1.1' },
  { id: 'b', x: 10, y: 5, topCommunity: 1, splitCommunity: '1.1' },
  { id: 'c', x: 20, y: 30, topCommunity: 2, splitCommunity: '2.1' },
  { id: 'd', x: 25, y: 35, topCommunity: 2, splitCommunity: '2.1' },
];
const separated = separatedCommunityNodes(nodes, 'top');
assert.equal(separated.length, nodes.length);
assert.ok(separated.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
assert.ok(Math.hypot(separated[0].x - separated[2].x, separated[0].y - separated[2].y) > 500);

console.log(JSON.stringify({ status: 'pass', checks: 7 }));
