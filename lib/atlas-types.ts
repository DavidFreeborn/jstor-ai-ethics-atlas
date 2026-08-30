export type AssignmentProvenance = 'core' | 'reassigned' | 'outlier';

export type TopicSummary = {
  id: number;
  label: string;
  terms?: string[];
  count: number;
  colour: string;
  mean_dominance?: number;
  stability?: { coherence: number; recurrence: number } | null;
};

export type LdaMembership = { topic: number; value: number };

export type PaperPoint = {
  i: number;
  id: string;
  x: number;
  y: number;
  title: string;
  journal: string;
  preview: string;
  words: number;
  bertopic: number;
  bertopic_probability_pre_reduction: number;
  provenance: AssignmentProvenance;
  bertopic_reduced: number;
  alignment: number | null;
  lda?: {
    topic: number;
    dominance: number;
    memberships: LdaMembership[];
    topics_above_010: number;
  };
};

export type MapData = {
  release: string;
  cohort: { label: string; n: number; catalogue_n: number };
  geometry: {
    embedding: string;
    projection: string;
    parameters: Record<string, string | number>;
    quality: Record<string, unknown>;
    bounds: { x: [number, number]; y: [number, number] };
    interpretation: string;
  };
  topics: {
    bertopic: TopicSummary[];
    bertopic_reduced: TopicSummary[];
    lda: TopicSummary[];
  };
  topic_centres: Record<string, { x: number; y: number }>;
  points: PaperPoint[];
};

export type PaperLens =
  | 'bertopic'
  | 'bertopic_reduced'
  | 'provenance'
  | 'lda'
  | 'lda_dominance'
  | 'alignment';

export type ContingencyCell = {
  bertopic?: number;
  lda?: number;
  abstract?: number;
  fulltext?: number;
  count: number;
};

export type ModelTopic = {
  id: number;
  label: string;
  terms: string[];
};

export type MethodsData = {
  cross_method: {
    n: number;
    ari: number;
    ami: number;
    cells: ContingencyCell[];
    alignment_definition: string;
  };
  paired: {
    eligible_n: number;
    both_non_outlier_n: number;
    fulltext_assigned_n: number;
    ari_non_outliers: number;
    ami_non_outliers: number;
    cells: ContingencyCell[];
    papers: Array<{
      id: string;
      title: string;
      abstract_topic: number;
      fulltext_topic: number;
      abstract_provenance: AssignmentProvenance;
      fulltext_provenance: AssignmentProvenance;
    }>;
    abstract_topics: ModelTopic[];
    fulltext_topics: ModelTopic[];
  };
  topics: {
    abstract: ModelTopic[];
    lda: TopicSummary[];
  };
  selected_models: Array<Record<string, string | number>>;
  cautions: string[];
};

export type KeywordNode = {
  id: string;
  label: string;
  frequency: number;
  degree: number;
  topCommunity: number;
  topCommunityName: string;
  splitCommunity: string;
  splitCommunityName: string;
  topColour: string;
  splitColour: string;
  x: number;
  y: number;
};

export type NetworkEdge = { source: string; target: string; weight: number };

export type BipartiteNode = {
  id: string;
  label: string;
  kind: 'keyword' | 'journal';
  degree: number;
  topColour?: string;
  splitColour?: string;
};

export type CommunitySummary = { id: number | string; name: string; colour: string; size: number };

export type NetworkData = {
  release: string;
  full: { nodes: KeywordNode[]; edges: NetworkEdge[] };
  bipartite: { nodes: BipartiteNode[]; edges: NetworkEdge[] };
  meta: {
    topCommunities: CommunitySummary[];
    splitCommunities: CommunitySummary[];
    counts: { keywords: number; keywordEdges: number; journals: number; bipartiteEdges: number };
  };
  method: { edge_definition: string; weight_definition: string; threshold: string };
};

export type PublishingData = {
  publisher_profiles: Array<{
    community: number;
    name: string;
    papers: number;
    colour: string;
    publishers: Array<{ name: string; share: number }>;
  }>;
  publisher_scope: string;
  journal_scope: string;
};

export type Workspace = 'papers' | 'methods' | 'concepts' | 'publishing';
