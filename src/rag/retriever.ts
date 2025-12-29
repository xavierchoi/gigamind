/**
 * RAG Retriever for Semantic Search
 * Combines vector search, keyword search, and graph-based re-ranking
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { expandPath } from "../utils/config.js";
import { analyzeNoteGraph, normalizeNoteTitle } from "../utils/graph/index.js";
import type { NoteGraphStats } from "../utils/graph/types.js";
import type {
  VectorDocument,
  SearchResult,
  RetrievalResult,
} from "./types.js";

/**
 * Interface for embedding service adapter
 * Compatible with the EmbeddingService class from ./embeddings.ts
 */
export interface IEmbeddingService {
  /** Generate embedding for a query - returns just the vector */
  embedQuery(query: string): Promise<number[]>;
}

/**
 * Configuration for retrieval operations
 */
export interface RetrievalConfig {
  /** Number of top results to return. Default: 10 */
  topK: number;
  /** Minimum relevance score threshold. Default: 0.5 */
  minScore: number;
  /** Whether to apply graph-based re-ranking. Default: true */
  useGraphReranking: boolean;
  /** Boost factor for graph centrality in re-ranking. Default: 0.2 */
  graphBoostFactor: number;
  /** Whether to expand results with surrounding context. Default: true */
  expandContext: boolean;
  /** Whether to combine vector and keyword search. Default: true */
  hybridSearch: boolean;
  /** Weight for keyword search in hybrid mode. Default: 0.3 */
  keywordWeight: number;
}

/**
 * Default retrieval configuration
 */
const DEFAULT_CONFIG: RetrievalConfig = {
  topK: 10,
  minScore: 0.5,
  useGraphReranking: true,
  graphBoostFactor: 0.2,
  expandContext: true,
  hybridSearch: true,
  keywordWeight: 0.3,
};

/**
 * Internal structure for aggregating search results by note
 */
interface NoteResultAggregate {
  noteId: string;
  notePath: string;
  noteTitle: string;
  chunks: Array<{ content: string; score: number; chunkIndex: number }>;
  vectorScore: number;
  keywordScore: number;
  graphCentrality: number;
}

/**
 * RAG Retriever class for semantic search operations
 */
export class RAGRetriever {
  private embeddingService: IEmbeddingService;
  private notesDir: string;
  private vectorIndex: VectorDocument[] = [];
  private graphStats: NoteGraphStats | null = null;
  private centralityCache: Map<string, number> = new Map();

  constructor(config: { embeddingService: IEmbeddingService; notesDir: string }) {
    this.embeddingService = config.embeddingService;
    this.notesDir = expandPath(config.notesDir);
  }

  /**
   * Load vector index from storage
   * This should be called before performing searches
   */
  async loadIndex(documents: VectorDocument[]): Promise<void> {
    this.vectorIndex = documents;
    await this.refreshGraphStats();
    this.computeCentralityScores();
  }

  /**
   * Refresh graph statistics for re-ranking
   */
  private async refreshGraphStats(): Promise<void> {
    try {
      this.graphStats = await analyzeNoteGraph(this.notesDir, { useCache: true });
    } catch (error) {
      console.warn("[RAGRetriever] Failed to load graph stats:", error);
      this.graphStats = null;
    }
  }

  /**
   * Compute centrality scores for all notes based on graph structure
   * Uses a simple degree centrality (in-degree + out-degree)
   */
  private computeCentralityScores(): void {
    this.centralityCache.clear();

    if (!this.graphStats) {
      return;
    }

    const { backlinks, forwardLinks, noteCount } = this.graphStats;

    // Count incoming links (backlinks)
    const inDegree = new Map<string, number>();
    for (const [noteTitle, entries] of backlinks) {
      inDegree.set(normalizeNoteTitle(noteTitle), entries.length);
    }

    // Count outgoing links (forward links)
    const outDegree = new Map<string, number>();
    for (const [notePath, targets] of forwardLinks) {
      const basename = path.basename(notePath, ".md");
      outDegree.set(normalizeNoteTitle(basename), targets.length);
    }

    // Compute normalized centrality for each note in the index
    const maxDegree = Math.max(
      1,
      Math.max(...Array.from(inDegree.values())),
      Math.max(...Array.from(outDegree.values()))
    );

    for (const doc of this.vectorIndex) {
      const normalizedTitle = normalizeNoteTitle(doc.metadata.title);
      const inLinks = inDegree.get(normalizedTitle) || 0;
      const outLinks = outDegree.get(normalizedTitle) || 0;
      const centrality = (inLinks + outLinks) / (2 * maxDegree);
      this.centralityCache.set(doc.noteId, centrality);
    }
  }

  /**
   * Main retrieval method - orchestrates search and ranking
   */
  async retrieve(
    query: string,
    options?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const config = { ...DEFAULT_CONFIG, ...options };

    let results: RetrievalResult[];
    const fetchLimit = config.topK * 3;

    if (config.hybridSearch) {
      results = await this.hybridSearch(query, config);
    } else if (config.keywordWeight >= 1) {
      const keywordResults = await this.keywordSearch(query, fetchLimit);
      results = this.aggregateResults([], keywordResults, config);
    } else {
      const queryVector = await this.embeddingService.embedQuery(query);
      const vectorResults = await this.vectorSearch(queryVector, fetchLimit);
      results = this.aggregateResults(vectorResults, [], config);
    }

    // Apply graph-based re-ranking
    if (config.useGraphReranking && this.graphStats) {
      results = await this.reRankWithGraph(results, config.graphBoostFactor);
    }

    // Expand context if requested
    if (config.expandContext) {
      results = await Promise.all(
        results.map((result) => this.expandContext(result))
      );
    }

    // Filter by minimum score and limit to topK
    results = results
      .filter((r) => r.baseScore >= config.minScore)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, config.topK);

    return results;
  }

  /**
   * Vector-based semantic search using cosine similarity
   */
  async vectorSearch(queryVector: number[], limit: number): Promise<SearchResult[]> {
    if (this.vectorIndex.length === 0) {
      return [];
    }

    // Calculate cosine similarity for all documents
    const scores: Array<{ document: VectorDocument; score: number; distance: number }> = [];

    for (const doc of this.vectorIndex) {
      const score = this.cosineSimilarity(queryVector, doc.embedding);
      const distance = 1 - score;
      scores.push({ document: doc, score, distance });
    }

    // Sort by score descending and take top results
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  /**
   * Keyword-based search using BM25-like scoring
   */
  async keywordSearch(query: string, limit: number): Promise<RetrievalResult[]> {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0 || this.vectorIndex.length === 0) {
      return [];
    }

    // Document frequency for IDF calculation
    const documentFrequency = new Map<string, number>();
    const totalDocs = new Set(this.vectorIndex.map((d) => d.noteId)).size;

    // Count document frequency for each term
    const noteTermCounts = new Map<string, Set<string>>();
    for (const doc of this.vectorIndex) {
      const docTerms = new Set(this.tokenize(doc.content));
      if (!noteTermCounts.has(doc.noteId)) {
        noteTermCounts.set(doc.noteId, new Set());
      }
      for (const term of docTerms) {
        noteTermCounts.get(doc.noteId)!.add(term);
      }
    }

    for (const terms of noteTermCounts.values()) {
      for (const term of terms) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }

    // Calculate BM25-like scores for each document
    const k1 = 1.2;
    const b = 0.75;
    const avgDocLength = this.vectorIndex.reduce((sum, d) => sum + d.content.length, 0) / this.vectorIndex.length;

    const noteScores = new Map<string, NoteResultAggregate>();

    for (const doc of this.vectorIndex) {
      const docTerms = this.tokenize(doc.content);
      const termFrequency = new Map<string, number>();
      for (const term of docTerms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
      }

      let score = 0;
      for (const queryTerm of queryTerms) {
        const tf = termFrequency.get(queryTerm) || 0;
        const df = documentFrequency.get(queryTerm) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
          const docLength = doc.content.length;
          const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
          score += idf * tfNorm;
        }
      }

      if (score > 0) {
        const existing = noteScores.get(doc.noteId);
        if (existing) {
          existing.chunks.push({
            content: doc.content,
            score,
            chunkIndex: doc.chunkIndex,
          });
          existing.keywordScore = Math.max(existing.keywordScore, score);
        } else {
          noteScores.set(doc.noteId, {
            noteId: doc.noteId,
            notePath: doc.notePath,
            noteTitle: doc.metadata.title,
            chunks: [{ content: doc.content, score, chunkIndex: doc.chunkIndex }],
            vectorScore: 0,
            keywordScore: score,
            graphCentrality: this.centralityCache.get(doc.noteId) || 0,
          });
        }
      }
    }

    // Convert to RetrievalResult and sort
    const results: RetrievalResult[] = Array.from(noteScores.values()).map((agg) => ({
      noteId: agg.noteId,
      notePath: agg.notePath,
      noteTitle: agg.noteTitle,
      chunks: agg.chunks.sort((a, b) => b.score - a.score),
      baseScore: agg.keywordScore,    // 키워드 검색 시 baseScore = keywordScore
      finalScore: agg.keywordScore,   // 초기값은 동일
      confidence: this.calculateConfidence(0, agg.keywordScore, agg.graphCentrality),
      graphCentrality: agg.graphCentrality,
    }));

    return results.sort((a, b) => b.finalScore - a.finalScore).slice(0, limit);
  }

  /**
   * Hybrid search combining vector and keyword search
   */
  async hybridSearch(
    query: string,
    options?: Partial<RetrievalConfig>
  ): Promise<RetrievalResult[]> {
    const config = { ...DEFAULT_CONFIG, ...options };
    const fetchLimit = config.topK * 3;

    // Perform both searches in parallel
    const [queryVector, keywordResults] = await Promise.all([
      this.embeddingService.embedQuery(query),
      this.keywordSearch(query, fetchLimit),
    ]);

    const vectorResults = await this.vectorSearch(queryVector, fetchLimit);

    // Aggregate and combine results
    return this.aggregateResults(vectorResults, keywordResults, config);
  }

  /**
   * Aggregate vector and keyword search results
   */
  private aggregateResults(
    vectorResults: SearchResult[],
    keywordResults: RetrievalResult[],
    config: RetrievalConfig
  ): RetrievalResult[] {
    const noteAggregates = new Map<string, NoteResultAggregate>();

    // Process vector results
    for (const result of vectorResults) {
      const normalizedScore = Math.min(1, Math.max(0, result.score));
      const existing = noteAggregates.get(result.document.noteId);

      if (existing) {
        existing.chunks.push({
          content: result.document.content,
          score: normalizedScore,
          chunkIndex: result.document.chunkIndex,
        });
        existing.vectorScore = Math.max(existing.vectorScore, normalizedScore);
      } else {
        noteAggregates.set(result.document.noteId, {
          noteId: result.document.noteId,
          notePath: result.document.notePath,
          noteTitle: result.document.metadata.title,
          chunks: [
            {
              content: result.document.content,
              score: normalizedScore,
              chunkIndex: result.document.chunkIndex,
            },
          ],
          vectorScore: normalizedScore,
          keywordScore: 0,
          graphCentrality: this.centralityCache.get(result.document.noteId) || 0,
        });
      }
    }

    // Normalize keyword scores to 0-1 range
    const maxKeywordScore =
      keywordResults.length > 0
        ? Math.max(...keywordResults.map((r) => r.finalScore))
        : 0;
    const normalizeKeywordScore = (score: number): number =>
      maxKeywordScore > 0 ? score / maxKeywordScore : 0;

    // Process keyword results
    for (const result of keywordResults) {
      const normalizedScore = normalizeKeywordScore(result.finalScore);
      const existing = noteAggregates.get(result.noteId);

      if (existing) {
        existing.keywordScore = Math.max(existing.keywordScore, normalizedScore);
        // Merge chunks that are not already present
        for (const chunk of result.chunks) {
          const chunkExists = existing.chunks.some(
            (c) => c.chunkIndex === chunk.chunkIndex
          );
          if (!chunkExists) {
            existing.chunks.push({
              content: chunk.content,
              score: normalizeKeywordScore(chunk.score),
              chunkIndex: chunk.chunkIndex,
            });
          }
        }
      } else {
        noteAggregates.set(result.noteId, {
          noteId: result.noteId,
          notePath: result.notePath,
          noteTitle: result.noteTitle,
          chunks: result.chunks.map((c) => ({
            ...c,
            score: normalizeKeywordScore(c.score),
          })),
          vectorScore: 0,
          keywordScore: normalizedScore,
          graphCentrality: result.graphCentrality,
        });
      }
    }

    // Calculate final scores using weighted combination
    const vectorWeight = 1 - config.keywordWeight;
    const results: RetrievalResult[] = [];

    for (const agg of noteAggregates.values()) {
      const baseScore =
        vectorWeight * agg.vectorScore + config.keywordWeight * agg.keywordScore;

      results.push({
        noteId: agg.noteId,
        notePath: agg.notePath,
        noteTitle: agg.noteTitle,
        chunks: agg.chunks.sort((a, b) => b.score - a.score),
        baseScore,              // 리랭킹 전 점수
        finalScore: baseScore,  // 초기값은 baseScore와 동일
        confidence: this.calculateConfidence(
          agg.vectorScore,
          agg.keywordScore,
          agg.graphCentrality
        ),
        graphCentrality: agg.graphCentrality,
      });
    }

    return results.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Re-rank results using graph structure (centrality boost)
   * baseScore는 유지하고 finalScore만 업데이트
   */
  private async reRankWithGraph(
    results: RetrievalResult[],
    boostFactor: number = 0.2
  ): Promise<RetrievalResult[]> {
    if (!this.graphStats) {
      return results;
    }

    return results.map((result) => {
      const centralityBoost = result.graphCentrality * boostFactor;
      const boostedScore = result.baseScore * (1 + centralityBoost);

      return {
        ...result,
        // baseScore는 유지 (spread 연산자로 이미 복사됨)
        finalScore: boostedScore,  // finalScore만 업데이트
        confidence: this.calculateConfidence(
          result.baseScore,
          0,
          result.graphCentrality
        ),
      };
    });
  }

  /**
   * Expand result with surrounding context from the note
   */
  private async expandContext(result: RetrievalResult): Promise<RetrievalResult> {
    try {
      const content = await fs.readFile(result.notePath, "utf-8");
      const { content: bodyContent } = matter(content);
      const lines = bodyContent.split("\n");

      // Find the best chunk and get surrounding context
      if (result.chunks.length > 0) {
        const bestChunk = result.chunks[0];
        const chunkPosition = bodyContent.indexOf(bestChunk.content);

        if (chunkPosition !== -1) {
          // Get 2 lines before and after for context
          const linesBefore = bodyContent.slice(0, chunkPosition).split("\n");
          const startLine = Math.max(0, linesBefore.length - 3);
          const linesAfter = bodyContent.slice(chunkPosition + bestChunk.content.length).split("\n");
          const endLine = Math.min(lines.length, linesBefore.length + linesAfter.slice(0, 3).length);

          const expandedContent = lines.slice(startLine, endLine + 1).join("\n").trim();

          if (expandedContent.length > bestChunk.content.length) {
            result.chunks[0] = {
              ...bestChunk,
              content: expandedContent,
            };
          }
        }
      }
    } catch (error) {
      // If we can't read the file, just return the original result
      console.debug(`[RAGRetriever] Failed to expand context for ${result.notePath}:`, error);
    }

    return result;
  }

  /**
   * Calculate confidence score based on multiple signals
   */
  private calculateConfidence(
    vectorScore: number,
    keywordScore: number,
    centrality: number
  ): number {
    // Weighted combination of different signals
    // Vector similarity is the primary signal
    // Keyword match provides additional confirmation
    // Graph centrality indicates note importance
    const vectorWeight = 0.5;
    const keywordWeight = 0.3;
    const centralityWeight = 0.2;

    const normalizedVector = Math.min(1, Math.max(0, vectorScore));
    const normalizedKeyword = Math.min(1, Math.max(0, keywordScore));
    const normalizedCentrality = Math.min(1, Math.max(0, centrality));

    const confidence =
      vectorWeight * normalizedVector +
      keywordWeight * normalizedKeyword +
      centralityWeight * normalizedCentrality;

    // Apply sigmoid-like transformation for smoother distribution
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vector dimensions must match");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) {
      return 0;
    }

    return Math.max(0, dotProduct / magnitude);
  }

  /**
   * Tokenize text for keyword search
   * Simple whitespace + lowercasing tokenizer
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2);
  }
}
