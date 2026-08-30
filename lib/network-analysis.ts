import type { KeywordNode, NetworkEdge } from '@/lib/atlas-types';

export type CommunityLevel = 'top' | 'split';

export function communityId(node: KeywordNode, level: CommunityLevel): string {
  return String(level === 'top' ? node.topCommunity : node.splitCommunity);
}

export function buildAdjacency(edges: NetworkEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  return adjacency;
}

export function oneHop(id: string, adjacency: Map<string, Set<string>>): Set<string> {
  return new Set([id, ...(adjacency.get(id) ?? [])]);
}

export function twoNeighbourhoods(ids: string[], adjacency: Map<string, Set<string>>): Set<string> {
  const result = new Set<string>();
  for (const id of ids) for (const member of oneHop(id, adjacency)) result.add(member);
  return result;
}

export function edgeKey(source: string, target: string): string {
  return source < target ? `${source}|${target}` : `${target}|${source}`;
}

/**
 * Match the reference application: find an unweighted shortest path, then use
 * the sum of node degrees to choose among equal-length alternatives.
 */
export function highestDegreeShortestPath(
  start: string,
  end: string,
  adjacency: Map<string, Set<string>>,
  degrees: Map<string, number>,
): string[] | null {
  if (!start || !end || start === end) return null;
  const distance = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const neighbour of adjacency.get(current) ?? []) {
      if (distance.has(neighbour)) continue;
      distance.set(neighbour, (distance.get(current) ?? 0) + 1);
      queue.push(neighbour);
    }
  }
  if (!distance.has(end)) return null;

  const score = new Map<string, number>([[start, degrees.get(start) ?? adjacency.get(start)?.size ?? 0]]);
  const previous = new Map<string, string | null>([[start, null]]);
  for (const current of queue) {
    if (current === start) continue;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestPrevious: string | null = null;
    for (const candidate of adjacency.get(current) ?? []) {
      if (distance.get(candidate) !== (distance.get(current) ?? 0) - 1 || !score.has(candidate)) continue;
      const candidateScore = (score.get(candidate) ?? 0) + (degrees.get(current) ?? adjacency.get(current)?.size ?? 0);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        bestPrevious = candidate;
      }
    }
    score.set(current, bestScore);
    previous.set(current, bestPrevious);
  }

  const path: string[] = [];
  for (let current: string | null = end; current !== null; current = previous.get(current) ?? null) path.push(current);
  return path.reverse();
}

export function separatedCommunityNodes(nodes: KeywordNode[], level: CommunityLevel): KeywordNode[] {
  const groups = new Map<string, KeywordNode[]>();
  for (const node of nodes) {
    const id = communityId(node, level);
    const group = groups.get(id);
    if (group) group.push(node); else groups.set(id, [node]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const radius = level === 'top' ? 720 : 1120;
  const centres = new Map<string, { x: number; y: number }>();
  ordered.forEach(([id], index) => {
    const angle = (index / ordered.length) * Math.PI * 2 - Math.PI / 2;
    centres.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });

  return ordered.flatMap(([id, group]) => {
    const centre = centres.get(id) ?? { x: 0, y: 0 };
    const meanX = group.reduce((sum, node) => sum + node.x, 0) / group.length;
    const meanY = group.reduce((sum, node) => sum + node.y, 0) / group.length;
    const localScale = level === 'top' ? 0.56 : 0.42;
    return group.map((node) => ({
      ...node,
      x: centre.x + (node.x - meanX) * localScale,
      y: centre.y + (node.y - meanY) * localScale,
    }));
  });
}
