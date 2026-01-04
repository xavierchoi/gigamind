/**
 * RAG Service - 통합 검색 서비스
 * 싱글톤 패턴으로 앱 전체에서 하나의 인스턴스만 사용
 */

import path from "node:path";
import { RAGIndexer } from "./indexer.js";
import { RAGRetriever } from "./retriever.js";
import { EmbeddingService, type ProviderOptions } from "./embeddings/index.js";
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
  /** 리랭킹 전 점수 (0-1, unanswerable 판정용) */
  baseScore: number;
  /** 리랭킹 후 점수 (순위 결정용, 1.0 초과 가능) */
  finalScore: number;
  /** Deprecated alias of finalScore (backward compatibility) */
  score?: number;
  /** 하이라이트된 텍스트 (optional) */
  highlights?: string[];
}

/**
 * RAGService 설정
 */
export interface RAGServiceConfig {
  /** 노트 디렉토리 경로 */
  notesDir: string;
  /** 임베딩 프로바이더 옵션 (기본값: 로컬 BGE-M3 모델) */
  embeddingOptions?: ProviderOptions;
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

      // VectorStore 초기화
      const usePersistent = config.usePersistentStorage !== false;
      const dbPath = path.join(this.notesDir, ".gigamind", "vectors");

      if (usePersistent) {
        this.vectorStore = new LanceDBVectorStore(dbPath);
      } else {
        this.vectorStore = new InMemoryVectorStore();
      }
      await this.vectorStore.initialize();

      // EmbeddingService 초기화 (로컬 모델 로드)
      this.embeddingService = new EmbeddingService(config.embeddingOptions);
      await this.embeddingService.initialize();
      console.log(`[RAGService] 임베딩 서비스 초기화 완료 (모델: ${this.embeddingService.modelId})`);

      // RAGIndexer 초기화 - vectorStore와 embeddingService 주입
      this.indexer = new RAGIndexer({
        notesDir: this.notesDir,
        dbPath: path.join(this.notesDir, ".gigamind", "vectors"),
        vectorStore: this.vectorStore,
        embeddingService: this.embeddingService,
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
        // 차원 변경 감지: 기존 인덱스의 차원과 새 임베딩 서비스의 차원 비교
        const existingDimension = existingDocs[0].embedding?.length || 0;
        const newDimension = this.embeddingService.dimensions;

        if (existingDimension > 0 && existingDimension !== newDimension) {
          console.log(
            `[RAGService] 임베딩 차원 변경 감지: ${existingDimension} → ${newDimension}`
          );
          console.log(
            `[RAGService] 임베딩 모델 변경으로 인한 자동 재인덱싱 시작...`
          );
          // 기존 인덱스 삭제 후 재인덱싱
          await this.vectorStore.clear();
          await this.reindex();
        } else {
          // 증분 인덱싱: 변경된 노트만 업데이트
          console.log(
            `[RAGService] 기존 인덱스 로드: ${existingDocs.length}개 문서 (차원: ${existingDimension})`
          );

          // 메타데이터 로드 시도
          const metaResult = await this.indexer.loadMetadata();

          if (!metaResult.loaded) {
            // 메타데이터 없음/손상 + 벡터 존재 = 전체 재인덱싱 필요
            console.log(
              `[RAGService] 메타데이터 ${metaResult.reason === "file_not_found" ? "없음" : "손상"}, 전체 재인덱싱 시작...`
            );
            await this.vectorStore.clear();
            await this.reindex();
          } else {
            console.log("[RAGService] 증분 인덱싱 시작...");
            const incrementalResult = await this.indexer.indexIncremental();

            if (incrementalResult.added > 0 || incrementalResult.updated > 0 || incrementalResult.removed > 0) {
              console.log(
                `[RAGService] 증분 인덱싱 완료: 추가 ${incrementalResult.added}, 수정 ${incrementalResult.updated}, 삭제 ${incrementalResult.removed}`
              );
              // 변경이 있으면 문서 다시 로드
              this.documents = await this.indexer.getAllDocuments();
            } else {
              console.log("[RAGService] 변경된 노트 없음");
              this.documents = existingDocs;
            }

            await this.retriever.loadIndex(this.documents);
          }
        }
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
      mode: options?.mode ?? "hybrid",
      topK: options?.topK ?? 10,
      minScore: options?.minScore ?? 0.3,
      useGraphReranking: options?.useGraphReranking !== false,
    };

    const keywordWeight =
      opts.mode === "keyword" ? 1.0 : opts.mode === "semantic" ? 0 : 0.1;

    // Retriever 설정에 맞게 변환
    const retrievalConfig = {
      topK: opts.topK,
      minScore: opts.minScore,
      useGraphReranking: opts.useGraphReranking,
      hybridSearch: opts.mode === "hybrid",
      keywordWeight,
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
   * 현재 임베딩 모델 ID 반환
   */
  getEmbeddingModelId(): string {
    return this.embeddingService?.modelId ?? "unknown";
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
      baseScore: result.baseScore,    // 리랭킹 전 점수
      finalScore: result.finalScore,  // 리랭킹 후 점수
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
