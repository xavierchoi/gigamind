export type {
  EmbeddingConfig,
  VectorDocument,
  SearchResult,
  RetrievalResult,
  IVectorStore,
  VectorStoreSearchResult,
} from "./types.js";

// 새 임베딩 모듈에서 export
export {
  EmbeddingService,
  createEmbeddingService,
  createEmbeddingProvider,
  EmbeddingError,
  type EmbeddingResult,
  type IEmbeddingProvider,
  type LocalEmbeddingConfig,
  type ModelDownloadProgress,
  type ProviderOptions,
} from "./embeddings/index.js";

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
