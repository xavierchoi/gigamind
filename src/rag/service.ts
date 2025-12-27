/**
 * RAG Service - 통합 검색 서비스
 * 싱글톤 패턴으로 앱 전체에서 하나의 인스턴스만 사용
 */

import path from "node:path";
import { RAGIndexer } from "./indexer.js";
import { RAGRetriever } from "./retriever.js";
import { EmbeddingService } from "./embeddings.js";
import type { RetrievalResult, VectorDocument, IVectorStore } from "./types.js";
import { LanceDBVectorStore, InMemoryVectorStore } from "./vectorStore.js";
import { expandPath } from "../utils/config.js";

/**
 * RAG 검색 옵션
 */
export interface RAGSearchOptions {
  /** 검색 모드 */
  mode?: "semantic" | "hybrid" | "keyword";
  /** 반환할 최대 결과 수 */
  topK?: number;
  /** 최소 관련도 점수 (0-1) */
  minScore?: number;
  /** 그래프 기반 리랭킹 사용 */
  useGraphReranking?: boolean;
}

/**
 * RAG 검색 결과
 */
export interface RAGSearchResult {
  /** 노트 파일 경로 */
  notePath: string;
  /** 노트 제목 */
  title: string;
  /** 관련 내용 발췌 */
  content: string;
  /** 관련도 점수 (0-1) */
  score: number;
  /** 하이라이트된 텍스트 (optional) */
  highlights?: string[];
}

/**
 * RAGService 설정
 */
export interface RAGServiceConfig {
  /** 노트 디렉토리 경로 */
  notesDir: string;
  /** OpenAI API 키 (optional, 환경변수 사용 가능) */
  apiKey?: string;
  /** 영구 저장소 사용 여부 (기본: true, LanceDB 사용) */
  usePersistentStorage?: boolean;
}

/**
 * RAGService 싱글톤 클래스
 */
export class RAGService {
  private static instance: RAGService | null = null;

  private indexer: RAGIndexer | null = null;
  private retriever: RAGRetriever | null = null;
  private embeddingService: EmbeddingService | null = null;
  private documents: VectorDocument[] = [];
  private vectorStore: IVectorStore | null = null;

  private notesDir: string = "";
  private initialized: boolean = false;
  private initializing: boolean = false;

  private constructor() {}

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService();
    }
    return RAGService.instance;
  }

  /**
   * 테스트용 인스턴스 리셋
   */
  static resetInstance(): void {
    RAGService.instance = null;
  }

  /**
   * 서비스 초기화
   */
  async initialize(config: RAGServiceConfig): Promise<void> {
    // 중복 초기화 방지
    if (this.initialized && this.notesDir === expandPath(config.notesDir)) {
      return;
    }

    // 동시 초기화 방지
    if (this.initializing) {
      // 초기화 완료 대기
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.initializing = true;

    try {
      this.notesDir = expandPath(config.notesDir);

      // API 키 설정
      if (config.apiKey) {
        process.env.OPENAI_API_KEY = config.apiKey;
      }

      // VectorStore 초기화
      const usePersistent = config.usePersistentStorage !== false;
      const dbPath = path.join(this.notesDir, ".gigamind", "vectors");

      if (usePersistent) {
        this.vectorStore = new LanceDBVectorStore(dbPath);
      } else {
        this.vectorStore = new InMemoryVectorStore();
      }
      await this.vectorStore.initialize();

      // EmbeddingService 초기화
      this.embeddingService = new EmbeddingService();

      // RAGIndexer 초기화 - vectorStore 주입
      this.indexer = new RAGIndexer({
        notesDir: this.notesDir,
        dbPath: path.join(this.notesDir, ".gigamind", "vectors"),
        vectorStore: this.vectorStore,
      });

      // RAGRetriever 초기화
      this.retriever = new RAGRetriever({
        embeddingService: this.embeddingService,
        notesDir: this.notesDir,
      });

      // 기존 인덱스 로드 또는 새로 인덱싱
      const existingDocs = await this.vectorStore.getAllDocuments();
      if (existingDocs.length === 0) {
        console.log("[RAGService] 인덱스가 비어있음, 전체 인덱싱 시작...");
        await this.reindex();
      } else {
        console.log(
          `[RAGService] 기존 인덱스 로드: ${existingDocs.length}개 문서`
        );
        this.documents = existingDocs;
        await this.retriever.loadIndex(existingDocs);
      }

      this.initialized = true;
      console.log("[RAGService] 초기화 완료");
    } finally {
      this.initializing = false;
    }
  }

  /**
   * 시맨틱 검색 수행
   */
  async search(
    query: string,
    options?: RAGSearchOptions
  ): Promise<RAGSearchResult[]> {
    if (!this.initialized) {
      throw new Error(
        "RAGService가 초기화되지 않았습니다. initialize()를 먼저 호출하세요."
      );
    }

    const opts = {
      mode: options?.mode || "hybrid",
      topK: options?.topK || 10,
      minScore: options?.minScore || 0.3,
      useGraphReranking: options?.useGraphReranking !== false,
    };

    // Retriever 설정에 맞게 변환
    const retrievalConfig = {
      topK: opts.topK,
      minScore: opts.minScore,
      useGraphReranking: opts.useGraphReranking,
      hybridSearch: opts.mode === "hybrid",
      keywordWeight: opts.mode === "keyword" ? 1.0 : 0.3,
    };

    const results = await this.retriever!.retrieve(query, retrievalConfig);

    // RAGSearchResult 형식으로 변환
    return results.map((result) => this.toSearchResult(result));
  }

  /**
   * 전체 재인덱싱
   */
  async reindex(
    onProgress?: (p: { processed: number; total: number }) => void
  ): Promise<void> {
    if (!this.indexer || !this.retriever) {
      throw new Error("RAGService가 초기화되지 않았습니다.");
    }

    // 인덱서로 전체 인덱싱
    const result = await this.indexer.indexAll((progress) => {
      onProgress?.({
        processed: progress.processed,
        total: progress.total,
      });
    });

    // 인덱싱된 문서 가져오기
    this.documents = await this.indexer.getAllDocuments();

    // Retriever에 인덱스 로드
    await this.retriever.loadIndex(this.documents);

    console.log(
      `[RAGService] 재인덱싱 완료: ${result.indexed}개 노트, ${this.documents.length}개 청크`
    );

    if (result.errors.length > 0) {
      console.warn(`[RAGService] 인덱싱 오류: ${result.errors.length}개`);
    }
  }

  /**
   * 단일 노트 인덱싱 (실시간 업데이트용)
   */
  async indexNote(notePath: string): Promise<void> {
    if (!this.indexer || !this.retriever) {
      throw new Error("RAGService가 초기화되지 않았습니다.");
    }

    // 새로 인덱싱
    await this.indexer.indexNote(notePath);

    // 문서 갱신
    this.documents = await this.indexer.getAllDocuments();

    // Retriever 인덱스 갱신
    await this.retriever.loadIndex(this.documents);
  }

  /**
   * 초기화 상태 확인
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 인덱스 통계 반환
   */
  async getStats(): Promise<{ documentCount: number; noteCount: number }> {
    const noteIds = new Set(this.documents.map((d) => d.noteId));

    return {
      documentCount: this.documents.length,
      noteCount: noteIds.size,
    };
  }

  /**
   * RetrievalResult를 RAGSearchResult로 변환
   */
  private toSearchResult(result: RetrievalResult): RAGSearchResult {
    const bestChunk = result.chunks[0];

    return {
      notePath: result.notePath,
      title: result.noteTitle,
      content: bestChunk?.content || "",
      score: result.finalScore,
      highlights: result.chunks.slice(0, 3).map((c) => c.content.slice(0, 200)),
    };
  }
}

/**
 * RAGService 팩토리 함수
 */
export function getRAGService(): RAGService {
  return RAGService.getInstance();
}
