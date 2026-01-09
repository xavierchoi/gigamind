/**
 * RAG Retriever for Semantic Search
 * Combines vector search, keyword search, graph-based re-ranking, and query expansion
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { expandPath } from "../utils/config.js";
import { analyzeNoteGraph, normalizeNoteTitle, calculatePageRank } from "../utils/graph/index.js";
import type { NoteGraphStats, BacklinkEntry, NoteMetadata } from "../utils/graph/types.js";
import type {
  VectorDocument,
  SearchResult,
  RetrievalResult,
} from "./types.js";
import { LLMReranker, type LLMRerankerOptions } from "./llmReranker.js";
import {
  QueryExpander,
  type QueryExpansionConfig,
  type ExpandedQuery,
  DEFAULT_EXPANSION_CONFIG,
} from "./queryExpander.js";

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
  /** Minimum relevance score threshold. Default: 0.3 */
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
  /** Query expansion configuration */
  queryExpansion?: Partial<QueryExpansionConfig>;
  /** Whether to use fast path for high-confidence results. Default: true */
  useFastPath?: boolean;
  /** Minimum score threshold for fast path (skips keyword boosting and graph reranking). Default: 0.85 */
  fastPathThreshold?: number;
  /** Graph boost component weights (must sum to 1.0) */
  graphBoostWeights?: {
    /** Weight for degree centrality boost. Default: 0.4 */
    centrality?: number;
    /** Weight for PageRank boost. Default: 0.4 */
    pageRank?: number;
    /** Weight for query-context link boost. Default: 0.2 */
    contextLink?: number;
  };
  /** Whether to use LLM-based reranking. Default: false */
  useLLMReranking?: boolean;
  /** LLM reranker options */
  llmRerankerOptions?: LLMRerankerOptions;
}

/**
 * Default retrieval configuration
 */
const DEFAULT_CONFIG: RetrievalConfig = {
  topK: 10,
  minScore: 0.3,
  useGraphReranking: true,
  graphBoostFactor: 0.2,
  expandContext: true,
  hybridSearch: true,
  keywordWeight: 0.1,
  useFastPath: true,
  fastPathThreshold: 0.85,
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
  private queryExpander: QueryExpander;
  private noteMetadataByPath: Map<string, NoteMetadata> = new Map();

  // PageRank caching
  private pageRankCache: Map<string, number> | null = null;
  private pageRankCacheTime: number = 0;
  private readonly PAGERANK_CACHE_TTL = 5 * 60 * 1000; // 5분

  // LLM Reranker (lazy initialization)
  private llmReranker: LLMReranker | null = null;
  private llmRerankerOptionsKey: string = '';

  constructor(config: { embeddingService: IEmbeddingService; notesDir: string }) {
    this.embeddingService = config.embeddingService;
    this.notesDir = expandPath(config.notesDir);
    this.queryExpander = new QueryExpander();
  }

  /**
   * Get or create LLM reranker instance (lazy initialization)
   * Recreates instance if options change
   */
  private getLLMReranker(options?: LLMRerankerOptions): LLMReranker {
    const optionsKey = JSON.stringify(options || {});
    if (!this.llmReranker || this.llmRerankerOptionsKey !== optionsKey) {
      this.llmReranker = new LLMReranker(options);
      this.llmRerankerOptionsKey = optionsKey;
    }
    return this.llmReranker;
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
      // Invalidate PageRank cache when graph stats change
      this.pageRankCache = null;
      this.noteMetadataByPath.clear();
      if (this.graphStats?.noteMetadata) {
        for (const metadata of this.graphStats.noteMetadata) {
          this.noteMetadataByPath.set(metadata.path, metadata);
        }
      }
    } catch (error) {
      console.warn("[RAGRetriever] Failed to load graph stats:", error);
      this.graphStats = null;
      this.pageRankCache = null;
      this.noteMetadataByPath.clear();
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

    // Expand query if enabled
    const expansionConfig = {
      ...DEFAULT_EXPANSION_CONFIG,
      ...config.queryExpansion,
    };

    // Fast Path configuration
    const useFastPath = config.useFastPath !== false;
    const fastPathThreshold = config.fastPathThreshold ?? 0.85;

    // Vector search first for fast path check
    const vectorFetchLimit = Math.max(config.topK * 5, 50);
    const queryVector = await this.embeddingService.embedQuery(query);
    const vectorResults = await this.vectorSearch(queryVector, vectorFetchLimit);

    // Fast Path: skip keyword boosting and graph reranking for high-confidence results
    if (useFastPath && vectorResults.length > 0 && vectorResults[0].score > fastPathThreshold) {
      console.debug(
        `[FastPath] top1 score ${vectorResults[0].score.toFixed(3)} > ${fastPathThreshold}, skipping reranking`
      );

      // Convert vector results directly to retrieval results
      let results = this.convertVectorResultsToRetrievalResults(vectorResults, config);

      // Expand context if requested (fast operation, keep it)
      if (config.expandContext) {
        results = await Promise.all(
          results.map((result) => this.expandContext(result))
        );
      }

      // Filter by minimum score and limit to topK
      return results
        .filter((r) => r.baseScore >= config.minScore)
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, config.topK);
    }

    // Normal path: full hybrid search with keyword boosting and graph reranking
    let results: RetrievalResult[];
    const fetchLimit = config.topK * 3;

    if (config.hybridSearch) {
      // Use augmented hybrid search with query expansion
      // Pass pre-computed vector results to avoid redundant embedding
      results = await this.hybridSearchWithExpansionAndVectorResults(
        query,
        vectorResults,
        config,
        expansionConfig
      );
    } else if (config.keywordWeight >= 1) {
      const keywordResults = await this.keywordSearch(query, fetchLimit);
      results = this.aggregateResults([], keywordResults, config);
    } else {
      results = this.aggregateResults(vectorResults, [], config);
    }

    // Apply graph-based re-ranking
    if (config.useGraphReranking && this.graphStats) {
      results = await this.reRankWithGraph(
        results,
        config.graphBoostFactor,
        config.graphBoostWeights
      );
    }

    // Apply LLM-based re-ranking (Phase 6)
    if (config.useLLMReranking) {
      const reranker = this.getLLMReranker(config.llmRerankerOptions);
      const reranked = await reranker.rerank(query, results);
      results = reranker.toRetrievalResults(reranked);
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
   * Convert vector search results directly to retrieval results (for fast path)
   * Skips keyword boosting for high-confidence vector matches
   */
  private convertVectorResultsToRetrievalResults(
    vectorResults: SearchResult[],
    config: RetrievalConfig
  ): RetrievalResult[] {
    const noteAggregates = new Map<string, NoteResultAggregate>();

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

    const results: RetrievalResult[] = [];
    for (const agg of noteAggregates.values()) {
      results.push({
        noteId: agg.noteId,
        notePath: agg.notePath,
        noteTitle: agg.noteTitle,
        chunks: agg.chunks.sort((a, b) => b.score - a.score),
        baseScore: agg.vectorScore,
        finalScore: agg.vectorScore,
        confidence: this.calculateConfidence(agg.vectorScore, 0, agg.graphCentrality),
        graphCentrality: agg.graphCentrality,
      });
    }

    return results.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Hybrid search with keyword augmentation from query expansion
   * OPTIMIZED: Instead of searching the full index for keywords (O(n)),
   * we fetch more vector results and apply keyword boosting only to those (O(top-K))
   * This reduces P95 latency from ~980ms to <500ms with minimal recall loss (<5%)
   */
  private async hybridSearchWithExpansion(
    query: string,
    config: RetrievalConfig,
    expansionConfig: QueryExpansionConfig
  ): Promise<RetrievalResult[]> {
    // Fetch more vector results to compensate for not doing full keyword search
    // This maintains recall by casting a wider net in semantic space
    const vectorFetchLimit = Math.max(config.topK * 5, 50);

    // Get expanded keywords if expansion is enabled
    let expandedKeywords: string[] = [];
    if (expansionConfig.enabled) {
      const expanded = await this.queryExpander.expand(query, expansionConfig);
      expandedKeywords = expanded.keywords;
    }

    // Perform vector search with original query (no expansion)
    const queryVector = await this.embeddingService.embedQuery(query);
    const vectorResults = await this.vectorSearch(queryVector, vectorFetchLimit);

    // Apply keyword boosting only to vector results (O(top-K) instead of O(n))
    // This avoids the expensive full-index keyword search while preserving keyword signal
    return this.applyKeywordBoostingToVectorResults(
      query,
      expandedKeywords,
      vectorResults,
      config
    );
  }

  /**
   * Hybrid search with pre-computed vector results
   * Used when vector search was already performed for fast path check
   */
  private async hybridSearchWithExpansionAndVectorResults(
    query: string,
    vectorResults: SearchResult[],
    config: RetrievalConfig,
    expansionConfig: QueryExpansionConfig
  ): Promise<RetrievalResult[]> {
    // Get expanded keywords if expansion is enabled
    let expandedKeywords: string[] = [];
    if (expansionConfig.enabled) {
      const expanded = await this.queryExpander.expand(query, expansionConfig);
      expandedKeywords = expanded.keywords;
    }

    // Apply keyword boosting only to vector results (O(top-K) instead of O(n))
    // This avoids the expensive full-index keyword search while preserving keyword signal
    return this.applyKeywordBoostingToVectorResults(
      query,
      expandedKeywords,
      vectorResults,
      config
    );
  }

  /**
   * Apply BM25 keyword boosting to vector search results only
   * This is O(top-K) instead of O(n) full index search
   * DF is calculated within the vector result set to avoid df > totalDocs issues
   */
  private applyKeywordBoostingToVectorResults(
    query: string,
    expandedKeywords: string[],
    vectorResults: SearchResult[],
    config: RetrievalConfig
  ): RetrievalResult[] {
    if (vectorResults.length === 0) {
      return [];
    }

    const queryTerms = this.tokenize(query);
    const expansionTerms = expandedKeywords
      .flatMap((k) => this.tokenize(k))
      .filter((t) => !queryTerms.includes(t));

    // Build note aggregates from vector results
    const noteAggregates = new Map<string, NoteResultAggregate>();

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

    // Skip keyword calculation if no query terms
    if (queryTerms.length === 0 && expansionTerms.length === 0) {
      return this.convertAggregatesToResults(noteAggregates, config);
    }

    // Calculate DF within the vector result set (per unique note)
    // This prevents df > totalDocs issues
    const documentFrequency = new Map<string, number>();
    const noteTermSets = new Map<string, Set<string>>();

    for (const result of vectorResults) {
      const noteId = result.document.noteId;
      if (!noteTermSets.has(noteId)) {
        noteTermSets.set(noteId, new Set());
      }
      const docTerms = this.getTokens(result.document);
      for (const term of docTerms) {
        noteTermSets.get(noteId)!.add(term);
      }
    }

    // Count document frequency across unique notes
    for (const terms of noteTermSets.values()) {
      for (const term of terms) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }

    const totalDocs = noteTermSets.size;

    // BM25 parameters
    const k1 = 1.2;
    const b = 0.75;
    const avgDocLength =
      vectorResults.reduce((sum, r) => sum + r.document.content.length, 0) /
      vectorResults.length;
    const expansionWeight = 0.3;

    // Calculate keyword scores for each chunk in vector results
    for (const result of vectorResults) {
      const doc = result.document;
      const docTerms = this.getTokens(doc);
      const termFrequency = new Map<string, number>();
      for (const term of docTerms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
      }

      let keywordScore = 0;

      // Score from original query terms
      for (const queryTerm of queryTerms) {
        const tf = termFrequency.get(queryTerm) || 0;
        const df = documentFrequency.get(queryTerm) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
          const docLength = doc.content.length;
          const tfNorm =
            (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
          keywordScore += idf * tfNorm;
        }
      }

      // Bonus score from expanded terms (weighted lower)
      for (const expansionTerm of expansionTerms) {
        const tf = termFrequency.get(expansionTerm) || 0;
        const df = documentFrequency.get(expansionTerm) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
          const docLength = doc.content.length;
          const tfNorm =
            (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
          keywordScore += idf * tfNorm * expansionWeight;
        }
      }

      // Update note aggregate with max keyword score
      const agg = noteAggregates.get(doc.noteId);
      if (agg && keywordScore > 0) {
        agg.keywordScore = Math.max(agg.keywordScore, keywordScore);
      }
    }

    return this.convertAggregatesToResults(noteAggregates, config);
  }

  /**
   * Convert note aggregates to retrieval results with proper scoring
   */
  private convertAggregatesToResults(
    noteAggregates: Map<string, NoteResultAggregate>,
    config: RetrievalConfig
  ): RetrievalResult[] {
    // Normalize keyword scores to 0-1 range
    const maxKeywordScore = Math.max(
      ...Array.from(noteAggregates.values()).map((a) => a.keywordScore),
      0.001 // Prevent division by zero
    );

    const vectorWeight = 1 - config.keywordWeight;
    const results: RetrievalResult[] = [];

    for (const agg of noteAggregates.values()) {
      const normalizedKeywordScore = agg.keywordScore / maxKeywordScore;
      const baseScore =
        vectorWeight * agg.vectorScore + config.keywordWeight * normalizedKeywordScore;

      results.push({
        noteId: agg.noteId,
        notePath: agg.notePath,
        noteTitle: agg.noteTitle,
        chunks: agg.chunks.sort((a, b) => b.score - a.score),
        baseScore,
        finalScore: baseScore,
        confidence: this.calculateConfidence(
          agg.vectorScore,
          normalizedKeywordScore,
          agg.graphCentrality
        ),
        graphCentrality: agg.graphCentrality,
      });
    }

    return results.sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Keyword search augmented with expanded terms
   * Boosts documents that match expanded keywords
   */
  private async keywordSearchWithExpansion(
    originalQuery: string,
    expandedKeywords: string[],
    limit: number
  ): Promise<RetrievalResult[]> {
    const queryTerms = this.tokenize(originalQuery);

    // Add expanded keywords to search terms (with lower weight)
    const expansionTerms = expandedKeywords
      .flatMap((k) => this.tokenize(k))
      .filter((t) => !queryTerms.includes(t));

    // Only return early if BOTH queryTerms and expansionTerms are empty
    if ((queryTerms.length === 0 && expansionTerms.length === 0) || this.vectorIndex.length === 0) {
      return [];
    }

    // Document frequency for IDF calculation
    const documentFrequency = new Map<string, number>();
    const totalDocs = new Set(this.vectorIndex.map((d) => d.noteId)).size;

    // Count document frequency for each term
    const noteTermCounts = new Map<string, Set<string>>();
    for (const doc of this.vectorIndex) {
      const docTerms = new Set(this.getTokens(doc));
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
    const avgDocLength =
      this.vectorIndex.reduce((sum, d) => sum + d.content.length, 0) /
      this.vectorIndex.length;

    const noteScores = new Map<string, NoteResultAggregate>();

    // Weight for expanded terms (lower than original query terms)
    const expansionWeight = 0.3;

    for (const doc of this.vectorIndex) {
      const docTerms = this.getTokens(doc);
      const termFrequency = new Map<string, number>();
      for (const term of docTerms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
      }

      let score = 0;

      // Score from original query terms
      for (const queryTerm of queryTerms) {
        const tf = termFrequency.get(queryTerm) || 0;
        const df = documentFrequency.get(queryTerm) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
          const docLength = doc.content.length;
          const tfNorm =
            (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
          score += idf * tfNorm;
        }
      }

      // Bonus score from expanded terms (weighted lower)
      for (const expansionTerm of expansionTerms) {
        const tf = termFrequency.get(expansionTerm) || 0;
        const df = documentFrequency.get(expansionTerm) || 0;
        if (tf > 0 && df > 0) {
          const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
          const docLength = doc.content.length;
          const tfNorm =
            (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
          score += idf * tfNorm * expansionWeight;
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
      baseScore: agg.keywordScore,
      finalScore: agg.keywordScore,
      confidence: this.calculateConfidence(0, agg.keywordScore, agg.graphCentrality),
      graphCentrality: agg.graphCentrality,
    }));

    return results.sort((a, b) => b.finalScore - a.finalScore).slice(0, limit);
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
      const docTerms = new Set(this.getTokens(doc));
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
      const docTerms = this.getTokens(doc);
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
   * Get cached PageRank scores or compute new ones
   */
  private getPageRankScores(): Map<string, number> {
    const now = Date.now();

    // Return cached if still valid
    if (
      this.pageRankCache &&
      now - this.pageRankCacheTime < this.PAGERANK_CACHE_TTL
    ) {
      return this.pageRankCache;
    }

    // Compute PageRank
    if (this.graphStats) {
      const result = calculatePageRank(
        this.graphStats.forwardLinks,
        this.graphStats.backlinks,
        { damping: 0.85, iterations: 20 },
        this.noteMetadataByPath.size > 0 ? this.noteMetadataByPath : undefined
      );
      this.pageRankCache = result.scores;
      this.pageRankCacheTime = now;
      return result.scores;
    }

    return new Map();
  }

  /**
   * Get backlinks for a specific note by its title
   */
  private getBacklinksFor(noteTitle: string): BacklinkEntry[] {
    if (!this.graphStats) {
      return [];
    }

    // Try exact match first
    const directMatch = this.graphStats.backlinks.get(noteTitle);
    if (directMatch) {
      return directMatch;
    }

    // Try normalized match
    const normalizedTarget = normalizeNoteTitle(noteTitle);
    for (const [key, entries] of this.graphStats.backlinks) {
      if (normalizeNoteTitle(key) === normalizedTarget) {
        return entries;
      }
    }

    return [];
  }

  /**
   * Get normalized identifiers for a note (title, basename, ID)
   */
  private getNormalizedNoteIdentifiers(notePath: string, noteTitle: string): string[] {
    const identifiers = new Set<string>();
    const metadata = this.noteMetadataByPath.get(notePath);

    if (metadata) {
      identifiers.add(normalizeNoteTitle(metadata.title));
      identifiers.add(normalizeNoteTitle(metadata.basename));
      identifiers.add(normalizeNoteTitle(metadata.id));
    }

    identifiers.add(normalizeNoteTitle(noteTitle));
    identifiers.add(normalizeNoteTitle(path.basename(notePath, ".md")));

    return Array.from(identifiers);
  }

  /**
   * Calculate query-context link score
   * Boosts results that are linked to/from top results
   *
   * The intuition: if a result is linked to the top-ranked results,
   * it's likely to be contextually relevant to the query.
   */
  private calculateQueryContextScore(
    result: RetrievalResult,
    topResults: RetrievalResult[]
  ): number {
    if (!this.graphStats) {
      return 0;
    }

    let score = 0;

    // Get this result's links
    const resultLinks = this.graphStats.forwardLinks.get(result.notePath) || [];
    const normalizedResultLinks = new Set(
      resultLinks.map((link) => normalizeNoteTitle(link))
    );
    const resultBacklinks = this.getBacklinksFor(result.noteTitle);

    // Check connections to top 3 results
    const topN = Math.min(3, topResults.length);
    for (let i = 0; i < topN; i++) {
      const topResult = topResults[i];
      if (topResult.notePath === result.notePath) {
        continue;
      }

      // Weight decreases for lower-ranked top results
      const weight = 0.1 * (3 - i); // top1: 0.3, top2: 0.2, top3: 0.1

      // Forward link: this result links to top result (normalize title/basename/ID)
      const topIdentifiers = this.getNormalizedNoteIdentifiers(
        topResult.notePath,
        topResult.noteTitle
      );
      const hasForwardLink = topIdentifiers.some((id) =>
        normalizedResultLinks.has(id)
      );
      if (hasForwardLink) {
        score += weight;
      }

      // Backward link: top result links to this result
      if (resultBacklinks.some((bl) => bl.notePath === topResult.notePath)) {
        score += weight;
      }
    }

    return score;
  }

  /**
   * Re-rank results using enhanced graph structure
   * Combines: degree centrality, PageRank, and query-context link scoring
   * baseScore는 유지하고 finalScore만 업데이트
   */
  private async reRankWithGraph(
    results: RetrievalResult[],
    boostFactor: number = 0.2,
    weights?: { centrality?: number; pageRank?: number; contextLink?: number }
  ): Promise<RetrievalResult[]> {
    if (!this.graphStats || results.length === 0) {
      return results;
    }

    // Default weights
    const centralityWeight = weights?.centrality ?? 0.4;
    const pageRankWeight = weights?.pageRank ?? 0.4;
    const contextLinkWeight = weights?.contextLink ?? 0.2;

    // Get PageRank scores (cached)
    const pageRankScores = this.getPageRankScores();

    // Get top results before reranking (for context link calculation)
    const topResults = results.slice(0, 3);

    return results.map((result) => {
      // 1. Degree centrality boost (original)
      const centralityBoost = result.graphCentrality * boostFactor * centralityWeight;

      // 2. PageRank boost
      const pageRank = pageRankScores.get(result.notePath) || 0;
      const pageRankBoost = pageRank * boostFactor * pageRankWeight;

      // 3. Query-context link boost
      const contextLinkScore = this.calculateQueryContextScore(result, topResults);
      const contextBoost = contextLinkScore * boostFactor * contextLinkWeight;

      // Total boost
      const totalBoost = centralityBoost + pageRankBoost + contextBoost;
      const boostedScore = result.baseScore * (1 + totalBoost);

      return {
        ...result,
        finalScore: boostedScore,
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
   * Unicode-aware tokenizer that preserves Korean/CJK characters
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      // Keep word characters (Unicode-aware), CJK characters, and spaces
      // Remove punctuation but preserve Korean, Japanese, Chinese characters
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1); // Allow 2-char tokens for CJK
  }

  /**
   * Get tokens for a document (use pre-computed if available)
   * Falls back to runtime tokenization for old indices without precomputed tokens
   */
  private getTokens(doc: VectorDocument): string[] {
    // Use precomputed tokens if available
    if (doc.metadata.tokens && doc.metadata.tokens.length > 0) {
      return doc.metadata.tokens;
    }
    // Fallback for old indices: compute at runtime
    return this.tokenize(doc.content);
  }
}
