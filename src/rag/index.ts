export type {
  EmbeddingConfig,
  VectorDocument,
  SearchResult,
  RetrievalResult,
  IVectorStore,
  VectorStoreSearchResult,
} from "./types.js";

export {
  EmbeddingService,
  EmbeddingError,
  createEmbeddingService,
  type EmbeddingResult,
} from "./embeddings.js";

export {
  RAGRetriever,
  type IEmbeddingService,
  type RetrievalConfig,
} from "./retriever.js";

export {
  RAGIndexer,
  type IndexingProgress,
  type IndexAllResult,
  type IndexIncrementalResult,
  type RAGIndexerConfig,
  type EmbeddingServiceInterface,
  type DocumentChunkerInterface,
} from "./indexer.js";

export {
  DocumentChunker,
  type ChunkConfig,
  type Chunk,
  type ChunkMetadata,
  type FrontmatterResult,
} from "./chunker.js";

// Service
export { RAGService, getRAGService } from "./service.js";
export type {
  RAGSearchOptions,
  RAGSearchResult,
  RAGServiceConfig,
} from "./service.js";

// VectorStore
export { LanceDBVectorStore, InMemoryVectorStore } from "./vectorStore.js";
