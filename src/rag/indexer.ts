/**
 * RAG Indexer for note indexing and embedding generation.
 * Handles full reindexing, incremental updates, and progress tracking.
 *
 * Integrates with:
 * - EmbeddingService: Local embedding model (via Ollama/llama.cpp)
 * - DocumentChunker: Korean/English sentence-aware chunking
 * - Graph Analyzer: Connection count for centrality scoring
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { expandPath } from "../utils/config.js";
import { parseNote } from "../utils/frontmatter.js";
import { analyzeNoteGraph } from "../utils/graph/analyzer.js";
import type { VectorDocument, IVectorStore } from "./types.js";
import { InMemoryVectorStore } from "./vectorStore.js";
import { EmbeddingService as ActualEmbeddingService } from "./embeddings/index.js";
import { DocumentChunker as ActualDocumentChunker, type Chunk } from "./chunker.js";

const MAX_TITLE_CONTEXT_LENGTH = 80;
const MAX_HEADER_CONTEXT_LENGTH = 80;
const MAX_HEADER_CONTEXT_LEVEL = 3;
const MAX_HEADER_CONTEXT_CHUNKS = 2;

const HEADER_STOPLIST = new Set([
  "overview",
  "summary",
  "notes",
  "note",
  "todo",
  "todos",
  "appendix",
  "references",
  "reference",
  "intro",
  "introduction",
  "background",
  "conclusion",
  "misc",
  "miscellaneous",
  "개요",
  "서론",
  "소개",
  "배경",
  "요약",
  "정리",
  "결론",
  "참고",
  "참고문헌",
  "부록",
  "메모",
  "노트",
  "목차",
  "할 일",
  "할일",
  "概要",
  "はじめに",
  "まとめ",
  "結論",
  "参考",
  "参考文献",
  "付録",
  "メモ",
  "概述",
  "简介",
  "引言",
  "背景",
  "总结",
  "结论",
  "参考文献",
  "附录",
  "备注",
  "笔记",
  "待办",
]);

function normalizeContextText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function truncateContextText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function shouldPrependHeaderContext(chunk: Chunk, title: string): boolean {
  const headerText = chunk.metadata.headerText?.trim();
  if (!headerText) {
    return false;
  }
  if (headerText.length < 2) {
    return false;
  }
  if (chunk.content.trim().startsWith("#")) {
    return false;
  }

  const sectionChunkIndex = chunk.metadata.sectionChunkIndex;
  if (sectionChunkIndex !== undefined && sectionChunkIndex >= MAX_HEADER_CONTEXT_CHUNKS) {
    return false;
  }

  const normalizedHeader = normalizeContextText(headerText);
  if (!normalizedHeader) {
    return false;
  }
  if (HEADER_STOPLIST.has(normalizedHeader)) {
    return false;
  }

  const normalizedTitle = normalizeContextText(title);
  if (normalizedHeader === normalizedTitle) {
    return false;
  }

  return true;
}

/**
 * Progress information for indexing operations
 */
export interface IndexingProgress {
  total: number;
  processed: number;
  currentFile: string;
  status: "indexing" | "embedding" | "storing" | "complete" | "error";
}

/**
 * Result of a full index operation
 */
export interface IndexAllResult {
  indexed: number;
  errors: string[];
}

/**
 * Result of an incremental index operation
 */
export interface IndexIncrementalResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * Result of index validation
 */
export interface ValidationResult {
  /** Whether the index is valid (no errors found) */
  valid: boolean;
  /** Total number of documents (chunks) in the index */
  totalDocuments: number;
  /** Total number of note metadata entries */
  totalMetadata: number;
  /** Chunk IDs that have no corresponding metadata */
  orphanedChunks: string[];
  /** Note paths whose metadata indicates chunks but none exist */
  missingChunks: string[];
  /** Number of embeddings with incorrect dimensions */
  dimensionMismatches: number;
  /** List of error messages describing validation issues */
  errors: string[];
}

/**
 * Metadata stored for each indexed note (for change detection)
 * Keyed by notePath (absolute path) to avoid noteId collisions
 */
interface IndexedNoteMetadata {
  noteId: string;
  notePath: string;
  contentHash: string;
  modifiedTime: number;
  chunkCount: number;
}

/**
 * Interface for embedding service
 * Compatible with both ActualEmbeddingService and custom implementations
 */
export interface EmbeddingServiceInterface {
  embedBatch(texts: string[]): Promise<Array<{ vector: number[] }>>;
}

/**
 * Interface for document chunker
 * Compatible with both ActualDocumentChunker and custom implementations
 */
export interface DocumentChunkerInterface {
  chunk(content: string): Chunk[];
}

/**
 * Adapter to wrap ActualEmbeddingService for the interface
 */
class EmbeddingServiceAdapter implements EmbeddingServiceInterface {
  private service: ActualEmbeddingService;
  private initialized = false;

  constructor() {
    this.service = new ActualEmbeddingService();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.service.initialize();
      this.initialized = true;
    }
  }

  async embedBatch(texts: string[]): Promise<Array<{ vector: number[] }>> {
    await this.ensureInitialized();
    return this.service.embedBatch(texts);
  }
}

/**
 * Persisted index metadata schema (stored in index-meta.json)
 * Notes are keyed by notePath (absolute path) to avoid noteId collisions
 */
interface IndexMetaFile {
  version: number;
  lastIndexedAt: string;
  /** Map of notePath -> metadata (changed from noteId in v2) */
  notes: Record<string, IndexedNoteMetadata>;
}

/** Version 2: Changed key from noteId to notePath for collision safety */
const INDEX_META_VERSION = 2;

/**
 * Result of loading metadata
 */
export interface MetadataLoadResult {
  /** Whether metadata was loaded successfully */
  loaded: boolean;
  /** Number of notes in metadata */
  noteCount: number;
  /** Reason if not loaded */
  reason?: "file_not_found" | "version_mismatch" | "parse_error";
}

/**
 * Configuration for RAGIndexer
 */
export interface RAGIndexerConfig {
  /** Directory containing notes to index */
  notesDir: string;
  /** Path to store the vector database (optional, used when vectorStore not provided) */
  dbPath?: string;
  /** Path to store index metadata (optional, defaults to .gigamind/index-meta.json) */
  metaPath?: string;
  /** Custom embedding service (optional, uses local model by default) */
  embeddingService?: EmbeddingServiceInterface;
  /** Custom document chunker (optional, uses default Korean/English chunker) */
  chunker?: DocumentChunkerInterface;
  /** Custom vector store (optional, uses InMemoryVectorStore by default) */
  vectorStore?: IVectorStore;
}

/**
 * RAG Indexer class for indexing notes
 *
 * Features:
 * - Full reindex capability with progress tracking
 * - Incremental indexing (only changed files based on content hash)
 * - Single note indexing for real-time updates
 * - Graph centrality integration from existing analyzer
 *
 * @example
 * ```typescript
 * const indexer = new RAGIndexer({
 *   notesDir: '~/notes',
 *   dbPath: '~/.gigamind/vectors.db'
 * });
 *
 * // Full reindex with progress
 * await indexer.indexAll((progress) => {
 *   console.log(`${progress.processed}/${progress.total}: ${progress.currentFile}`);
 * });
 *
 * // Incremental update
 * const result = await indexer.indexIncremental();
 * console.log(`Added: ${result.added}, Updated: ${result.updated}, Removed: ${result.removed}`);
 * ```
 */
export class RAGIndexer {
  private embeddingService: EmbeddingServiceInterface;
  private chunker: DocumentChunkerInterface;
  private notesDir: string;
  private dbPath: string;
  private metaPath: string;
  private vectorStore: IVectorStore;
  private noteMetadata: Map<string, IndexedNoteMetadata> = new Map();
  private metadataLoaded: boolean = false;

  constructor(config: RAGIndexerConfig) {
    this.notesDir = expandPath(config.notesDir);
    this.dbPath = config.dbPath || "";
    this.metaPath = config.metaPath || path.join(this.notesDir, ".gigamind", "index-meta.json");
    this.embeddingService = config.embeddingService || new EmbeddingServiceAdapter();
    this.chunker = config.chunker || new ActualDocumentChunker();
    this.vectorStore = config.vectorStore || new InMemoryVectorStore();
  }

  /**
   * Load persisted metadata from disk
   * Called automatically on first operation if not already loaded
   *
   * @returns Result indicating whether metadata was loaded successfully
   */
  async loadMetadata(): Promise<MetadataLoadResult> {
    if (this.metadataLoaded) {
      return { loaded: this.noteMetadata.size > 0, noteCount: this.noteMetadata.size };
    }

    try {
      const content = await fs.readFile(this.metaPath, "utf-8");
      const data: IndexMetaFile = JSON.parse(content);

      // Version check
      if (data.version !== INDEX_META_VERSION) {
        console.log(`[RAGIndexer] 메타데이터 버전 불일치 (${data.version} → ${INDEX_META_VERSION}), 재인덱싱 필요`);
        this.noteMetadata.clear();
        this.metadataLoaded = true;
        return { loaded: false, noteCount: 0, reason: "version_mismatch" };
      }

      // Load notes metadata (keyed by notePath)
      this.noteMetadata.clear();
      for (const [notePath, meta] of Object.entries(data.notes)) {
        this.noteMetadata.set(notePath, meta);
      }

      console.log(`[RAGIndexer] 메타데이터 로드 완료: ${this.noteMetadata.size}개 노트`);
      this.metadataLoaded = true;
      return { loaded: true, noteCount: this.noteMetadata.size };
    } catch (err) {
      // File doesn't exist or is invalid - start fresh
      const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
      if (!isNotFound) {
        console.debug("[RAGIndexer] 메타데이터 파일 읽기 실패:", err);
      }
      this.noteMetadata.clear();
      this.metadataLoaded = true;
      return {
        loaded: false,
        noteCount: 0,
        reason: isNotFound ? "file_not_found" : "parse_error",
      };
    }
  }

  /**
   * Save metadata to disk
   *
   * NOTE: 현재 구현은 단일 프로세스 접근을 가정합니다.
   * 여러 프로세스가 동시에 인덱싱하면 메타데이터 손상 가능.
   * 필요시 파일 락킹 구현 권장.
   */
  private async saveMetadata(): Promise<void> {
    const data: IndexMetaFile = {
      version: INDEX_META_VERSION,
      lastIndexedAt: new Date().toISOString(),
      notes: Object.fromEntries(this.noteMetadata),
    };

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.metaPath), { recursive: true });

    // Atomic save: write to temp file then rename
    const tempPath = `${this.metaPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tempPath, this.metaPath);
  }

  /**
   * Perform a full reindex of all notes
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Result containing count of indexed notes and any errors
   */
  async indexAll(
    onProgress?: (p: IndexingProgress) => void
  ): Promise<IndexAllResult> {
    const errors: string[] = [];
    let indexed = 0;

    try {
      // Clear existing index
      await this.vectorStore.clear();
      this.noteMetadata.clear();

      // Collect all markdown files
      const files = await this.collectMarkdownFiles(this.notesDir);
      const total = files.length;

      // Get graph data for connection counts
      const graphStats = await analyzeNoteGraph(this.notesDir, { useCache: false });

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const relativePath = path.relative(this.notesDir, filePath);

        onProgress?.({
          total,
          processed: i,
          currentFile: relativePath,
          status: "indexing",
        });

        try {
          const documents = await this.processNote(filePath, graphStats);

          if (documents.length > 0) {
            onProgress?.({
              total,
              processed: i,
              currentFile: relativePath,
              status: "embedding",
            });

            // Generate embeddings in batch
            const texts = documents.map((d) => d.content);
            const embeddings = await this.embeddingService.embedBatch(texts);

            // Attach embeddings to documents
            for (let j = 0; j < documents.length; j++) {
              documents[j].embedding = embeddings[j].vector;
            }

            onProgress?.({
              total,
              processed: i,
              currentFile: relativePath,
              status: "storing",
            });

            // Store documents
            await this.vectorStore.add(documents);

            // Store note metadata for incremental indexing (keyed by notePath)
            const content = await fs.readFile(filePath, "utf-8");
            const stat = await fs.stat(filePath);
            this.noteMetadata.set(filePath, {
              noteId: documents[0].noteId,
              notePath: filePath,
              contentHash: this.hashContent(content),
              modifiedTime: stat.mtimeMs,
              chunkCount: documents.length,
            });

            indexed++;
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${relativePath}: ${errorMsg}`);
        }
      }

      // Save metadata to disk for incremental indexing
      await this.saveMetadata();

      onProgress?.({
        total,
        processed: total,
        currentFile: "",
        status: "complete",
      });

      return { indexed, errors };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Fatal error: ${errorMsg}`);

      onProgress?.({
        total: 0,
        processed: 0,
        currentFile: "",
        status: "error",
      });

      return { indexed, errors };
    }
  }

  /**
   * Perform incremental indexing (only changed files)
   *
   * Uses content hash to detect changes, avoiding unnecessary re-embedding.
   *
   * @param onProgress - Optional callback for progress updates
   * @returns Result containing counts of added, updated, and removed notes
   */
  async indexIncremental(
    onProgress?: (p: IndexingProgress) => void
  ): Promise<IndexIncrementalResult> {
    // Load persisted metadata first
    await this.loadMetadata();

    let added = 0;
    let updated = 0;
    let removed = 0;

    try {
      // Get current files
      const currentFiles = await this.collectMarkdownFiles(this.notesDir);
      const currentFilesSet = new Set(currentFiles);

      // Get indexed notes (use internal noteMetadata)
      const indexedNotes = this.noteMetadata;

      // Detect changes to determine if graph cache can be used
      // First pass: count removed files
      let removedCount = 0;
      for (const notePath of indexedNotes.keys()) {
        if (!currentFilesSet.has(notePath)) {
          removedCount++;
        }
      }

      // Second pass: count added files
      let addedCount = 0;
      for (const filePath of currentFiles) {
        if (!indexedNotes.has(filePath)) {
          addedCount++;
        }
      }

      // Get graph data for connection counts
      // Use cache only when no files were added or removed (only content changes)
      const graphStats = await analyzeNoteGraph(this.notesDir, {
        useCache: addedCount === 0 && removedCount === 0,
      });

      const total = currentFiles.length + indexedNotes.size;
      let processed = 0;

      // Check for removed files (metadata is now keyed by notePath)
      for (const [notePath, metadata] of indexedNotes) {
        if (!currentFilesSet.has(notePath)) {
          onProgress?.({
            total,
            processed,
            currentFile: path.relative(this.notesDir, notePath),
            status: "indexing",
          });

          await this.vectorStore.deleteByNotePath(notePath);
          this.noteMetadata.delete(notePath);
          removed++;
          processed++;
        }
      }

      // Check for new or modified files
      for (const filePath of currentFiles) {
        const relativePath = path.relative(this.notesDir, filePath);

        onProgress?.({
          total,
          processed,
          currentFile: relativePath,
          status: "indexing",
        });

        try {
          const content = await fs.readFile(filePath, "utf-8");
          const stat = await fs.stat(filePath);
          const currentHash = this.hashContent(content);

          // Look up existing metadata directly by filePath (no iteration needed)
          const existingMetadata = indexedNotes.get(filePath);

          const needsReindex =
            !existingMetadata ||
            existingMetadata.contentHash !== currentHash ||
            existingMetadata.modifiedTime < stat.mtimeMs;

          if (needsReindex) {
            // Remove old documents if they exist
            if (existingMetadata) {
              await this.vectorStore.deleteByNotePath(filePath);
              this.noteMetadata.delete(filePath);
            }

            onProgress?.({
              total,
              processed,
              currentFile: relativePath,
              status: "embedding",
            });

            const documents = await this.processNote(filePath, graphStats);

            if (documents.length > 0) {
              // Generate embeddings
              const texts = documents.map((d) => d.content);
              const embeddings = await this.embeddingService.embedBatch(texts);

              for (let j = 0; j < documents.length; j++) {
                documents[j].embedding = embeddings[j].vector;
              }

              onProgress?.({
                total,
                processed,
                currentFile: relativePath,
                status: "storing",
              });

              await this.vectorStore.add(documents);
              this.noteMetadata.set(filePath, {
                noteId: documents[0].noteId,
                notePath: filePath,
                contentHash: currentHash,
                modifiedTime: stat.mtimeMs,
                chunkCount: documents.length,
              });

              if (existingMetadata) {
                updated++;
              } else {
                added++;
              }
            }
          }
        } catch (err) {
          // Log error but continue with other files
          console.debug(`[RAGIndexer] Failed to process ${relativePath}:`, err);
        }

        processed++;
      }

      // Save metadata to disk
      if (added > 0 || updated > 0 || removed > 0) {
        await this.saveMetadata();
      }

      onProgress?.({
        total,
        processed: total,
        currentFile: "",
        status: "complete",
      });

      return { added, updated, removed };
    } catch (err) {
      onProgress?.({
        total: 0,
        processed: 0,
        currentFile: "",
        status: "error",
      });

      throw err;
    }
  }

  /**
   * Index a single note
   *
   * Useful for real-time indexing when a note is saved.
   *
   * @param notePath - Path to the note (absolute or relative to notesDir)
   */
  async indexNote(notePath: string): Promise<void> {
    // Load persisted metadata first
    await this.loadMetadata();

    const expandedPath = path.isAbsolute(notePath)
      ? notePath
      : path.join(this.notesDir, notePath);

    // Get graph data for connection counts
    const graphStats = await analyzeNoteGraph(this.notesDir, { useCache: false });

    // Remove existing documents for this note and update metadata (keyed by notePath)
    await this.vectorStore.deleteByNotePath(expandedPath);
    this.noteMetadata.delete(expandedPath);

    // Process the note
    const documents = await this.processNote(expandedPath, graphStats);

    if (documents.length > 0) {
      // Generate embeddings
      const texts = documents.map((d) => d.content);
      const embeddings = await this.embeddingService.embedBatch(texts);

      for (let j = 0; j < documents.length; j++) {
        documents[j].embedding = embeddings[j].vector;
      }

      // Store documents
      await this.vectorStore.add(documents);

      // Update metadata (keyed by notePath)
      const content = await fs.readFile(expandedPath, "utf-8");
      const stat = await fs.stat(expandedPath);
      this.noteMetadata.set(expandedPath, {
        noteId: documents[0].noteId,
        notePath: expandedPath,
        contentHash: this.hashContent(content),
        modifiedTime: stat.mtimeMs,
        chunkCount: documents.length,
      });

      // Save metadata to disk
      await this.saveMetadata();
    }
  }

  /**
   * Remove a note from the index
   *
   * @param noteId - ID of the note to remove
   */
  async removeNote(noteId: string): Promise<void> {
    // Load persisted metadata first
    await this.loadMetadata();

    // Find the notePath from metadata (now keyed by notePath, search by noteId)
    let foundPath: string | undefined;
    for (const [notePath, meta] of this.noteMetadata) {
      if (meta.noteId === noteId) {
        foundPath = notePath;
        break;
      }
    }

    if (foundPath) {
      await this.vectorStore.deleteByNotePath(foundPath);
      this.noteMetadata.delete(foundPath);

      // Save metadata to disk
      await this.saveMetadata();
    }
  }

  /**
   * Get the current index size (number of chunks)
   */
  async getIndexSize(): Promise<number> {
    return await this.vectorStore.count();
  }

  /**
   * Get all indexed documents
   *
   * Useful for passing to RAGRetriever or for debugging.
   */
  async getAllDocuments(): Promise<VectorDocument[]> {
    return this.vectorStore.getAllDocuments();
  }

  /**
   * Validate index integrity
   *
   * Checks for:
   * - Metadata count vs document count consistency
   * - Orphaned chunks (documents without corresponding metadata)
   * - Missing chunks (metadata entries without corresponding documents)
   * - Embedding dimension consistency (all embeddings should have the same dimension)
   *
   * @returns Validation result object with details about any issues found
   */
  async validateIndex(): Promise<ValidationResult> {
    // Load persisted metadata first
    await this.loadMetadata();

    const errors: string[] = [];
    const orphanedChunks: string[] = [];
    const missingChunks: string[] = [];
    let dimensionMismatches = 0;

    const documents = await this.vectorStore.getAllDocuments();
    const metadata = this.noteMetadata;

    const totalDocuments = documents.length;
    const totalMetadata = metadata.size;

    // Build a map of notePath -> documents for efficient lookup
    const documentsByPath = new Map<string, VectorDocument[]>();
    for (const doc of documents) {
      const existing = documentsByPath.get(doc.notePath) || [];
      existing.push(doc);
      documentsByPath.set(doc.notePath, existing);
    }

    // Metadata is now keyed by notePath
    const notePathsWithMetadata = new Set<string>(metadata.keys());

    // Check for orphaned chunks (documents without metadata)
    for (const [notePath, docs] of documentsByPath) {
      if (!notePathsWithMetadata.has(notePath)) {
        for (const doc of docs) {
          orphanedChunks.push(doc.id);
        }
        errors.push(`Orphaned chunks found for note "${notePath}": no metadata exists`);
      }
    }

    // Check for missing chunks and chunk count mismatches
    for (const [notePath, meta] of metadata) {
      const docs = documentsByPath.get(notePath);

      if (!docs || docs.length === 0) {
        missingChunks.push(notePath);
        errors.push(`Missing chunks for note "${notePath}": metadata indicates ${meta.chunkCount} chunks but none found`);
      } else if (docs.length !== meta.chunkCount) {
        errors.push(`Chunk count mismatch for note "${notePath}": metadata indicates ${meta.chunkCount} chunks but found ${docs.length}`);
      }
    }

    // Check embedding dimension consistency dynamically
    // The expected dimension is determined from the first valid embedding
    let expectedDimension: number | null = null;
    for (const doc of documents) {
      if (doc.embedding && doc.embedding.length > 0) {
        if (expectedDimension === null) {
          // Set expected dimension from first valid embedding
          expectedDimension = doc.embedding.length;
        } else if (doc.embedding.length !== expectedDimension) {
          dimensionMismatches++;
          if (dimensionMismatches <= 5) {
            // Only log first 5 mismatches to avoid spam
            errors.push(`Dimension mismatch for chunk "${doc.id}": expected ${expectedDimension}, got ${doc.embedding.length}`);
          }
        }
      }
    }

    if (dimensionMismatches > 5) {
      errors.push(`... and ${dimensionMismatches - 5} more dimension mismatches`);
    }

    const valid = errors.length === 0;

    return {
      valid,
      totalDocuments,
      totalMetadata,
      orphanedChunks,
      missingChunks,
      dimensionMismatches,
      errors,
    };
  }

  /**
   * Process a single note file and return vector documents
   */
  private async processNote(
    notePath: string,
    graphStats?: Awaited<ReturnType<typeof analyzeNoteGraph>>
  ): Promise<VectorDocument[]> {
    const content = await fs.readFile(notePath, "utf-8");
    const parsed = parseNote(content);
    const stat = await fs.stat(notePath);

    const noteId = parsed.id || path.basename(notePath, ".md");
    const title = parsed.title || path.basename(notePath, ".md");
    const type = parsed.type || "note";
    const tags = parsed.tags || [];

    // Calculate connection count from graph stats (for centrality scoring)
    let connectionCount = 0;
    if (graphStats) {
      // Count incoming connections (backlinks)
      const backlinks = graphStats.backlinks.get(title);
      if (backlinks) {
        connectionCount += backlinks.length;
      }

      // Count outgoing connections (forward links)
      const forwardLinks = graphStats.forwardLinks.get(notePath);
      if (forwardLinks) {
        connectionCount += forwardLinks.length;
      }
    }

    // Chunk the content using the document chunker
    const chunks = this.chunker.chunk(parsed.content);

    // Handle empty content case
    if (chunks.length === 0) {
      return [];
    }

    // Create vector documents
    // Prepend note title and section headers for improved retrieval context
    const documents: VectorDocument[] = chunks.map((chunk) => {
      // Build content with hierarchical header context
      let contentWithContext = chunk.content;

      // Prepend section header context for early chunks in a section
      if (shouldPrependHeaderContext(chunk, title)) {
        const rawHeaderLevel = chunk.metadata.headerLevel ?? 2;
        const headerLevel = Math.min(Math.max(rawHeaderLevel, 2), MAX_HEADER_CONTEXT_LEVEL);
        const headerPrefix = "#".repeat(headerLevel);
        const headerLine = truncateContextText(
          chunk.metadata.headerText ?? "",
          MAX_HEADER_CONTEXT_LENGTH
        );
        contentWithContext = `${headerPrefix} ${headerLine}\n\n${contentWithContext}`;
      }

      // Always prepend note title as top-level context
      const titleLine = truncateContextText(title, MAX_TITLE_CONTEXT_LENGTH);
      contentWithContext = `# ${titleLine}\n\n${contentWithContext}`;

      // Precompute BM25 tokens for faster search
      const tokens = this.tokenize(contentWithContext);

      return {
        id: `${noteId}_chunk_${chunk.index}`,
        noteId,
        notePath,
        chunkIndex: chunk.index,
        content: contentWithContext,
        embedding: [], // Will be filled by embedding service
        metadata: {
          title,
          type,
          tags,
          created: parsed.created || stat.birthtime.toISOString(),
          modified: parsed.modified || stat.mtime.toISOString(),
          connectionCount,
          tokens, // Precomputed BM25 tokens
        },
      };
    });

    return documents;
  }

  /**
   * Recursively collect all markdown files from a directory
   */
  private async collectMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      await fs.access(dir);
    } catch {
      return files;
    }

    const walk = async (currentDir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            // Skip hidden directories
            if (!entry.name.startsWith(".")) {
              await walk(fullPath);
            }
          } else if (entry.name.endsWith(".md")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };

    await walk(dir);
    return files;
  }

  /**
   * Generate a SHA-256 hash of content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Tokenize text for BM25
   * Unicode-aware tokenizer that preserves Korean/CJK characters
   * Must match the tokenizer in retriever.ts for consistency
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }
}
