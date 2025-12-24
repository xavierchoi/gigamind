export interface EmbeddingConfig {
  model: "text-embedding-3-small" | "voyage-3-lite";
  dimensions: number;
  batchSize: number;
}

export interface VectorDocument {
  id: string;
  noteId: string;
  notePath: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata: {
    title: string;
    type: string;
    tags: string[];
    created: string;
    modified: string;
    connectionCount: number;
  };
}

export interface SearchResult {
  document: VectorDocument;
  score: number;
  distance: number;
}

export interface RetrievalResult {
  noteId: string;
  notePath: string;
  noteTitle: string;
  chunks: Array<{ content: string; score: number; chunkIndex: number }>;
  finalScore: number;
  confidence: number;
  graphCentrality: number;
}
