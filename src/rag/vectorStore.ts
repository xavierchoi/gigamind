/**
 * LanceDB-based Vector Store for persistent embedding storage
 *
 * Note: This implementation uses the @lancedb/lancedb package.
 * If package.json has "lancedb": "^0.0.1", update it to "@lancedb/lancedb": "^0.23.0"
 *
 * ## LanceDB JS SDK Index Support (조사 결과 2025-01)
 *
 * LanceDB JS SDK (@lancedb/lancedb ^0.23.0)는 다음 인덱스 타입을 지원:
 *
 * ### 벡터 인덱스
 * - **IVF_PQ** (Index.ivfPq): 파티션 기반 + 제품 양자화
 *   - numPartitions: 파티션 수 (기본값: sqrt(rowCount))
 *   - numSubVectors: 서브벡터 수 (기본값: dimension/16)
 *   - numBits: 양자화 비트 (4 또는 8)
 *   - distanceType: 'l2' | 'cosine' | 'dot'
 *
 * - **IVF_FLAT** (Index.ivfFlat): 파티션 기반, 양자화 없음
 *
 * - **HNSW_SQ** (Index.hnswSq): 그래프 기반 + 스칼라 양자화
 *   - efConstruction: 빌드 품질 (기본값: 300, 권장: 150-300)
 *   - m: 이웃 수 (기본값: 20)
 *   - numPartitions: 파티션 수 (HNSW는 1 권장)
 *
 * - **HNSW_PQ** (Index.hnswPq): 그래프 기반 + 제품 양자화
 *
 * - **IVF_RQ** (Index.ivfRq): RabitQ 양자화
 *
 * ### 스칼라 인덱스
 * - **B-tree** (Index.btree): 정렬된 스칼라 데이터용
 * - **Bitmap** (Index.bitmap): 저카디널리티 컬럼용
 * - **FTS** (Index.fts): 전문 검색용
 * - **LabelList** (Index.labelList): 배열 contains 쿼리용
 *
 * ### 인덱스 생성 예시
 * ```typescript
 * await table.createIndex("vector", {
 *   config: lancedb.Index.ivfPq({
 *     numPartitions: 128,
 *     numSubVectors: 16,
 *   }),
 * });
 * ```
 *
 * ### 벡터 정규화
 * 이 구현에서는 모든 벡터를 L2 정규화하여 저장합니다.
 * 정규화된 벡터에서는 dot product = cosine similarity이므로,
 * LanceDB의 기본 L2 distance 검색에서도 cosine similarity와
 * 동일한 순위 결과를 얻을 수 있습니다.
 */

import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table, Data } from "@lancedb/lancedb";
import path from "node:path";
import fs from "node:fs/promises";
import type { VectorDocument, IVectorStore, VectorStoreSearchResult } from "./types.js";

/**
 * LanceDB 테이블 스키마
 */
interface LanceDBRecord {
  id: string;
  noteId: string;
  notePath: string;
  chunkIndex: number;
  content: string;
  vector: number[];
  title: string;
  type: string;
  tags: string;  // JSON string
  created: string;
  modified: string;
  connectionCount: number;
  tokens: string;  // JSON string - BM25 precomputed tokens
}

/**
 * LanceDB 검색 결과 행 타입
 */
interface LanceDBSearchRow extends LanceDBRecord {
  _distance: number;
}

export class LanceDBVectorStore implements IVectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;
  private dbPath: string;
  private tableName = "embeddings";

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * L2 정규화 (단위 벡터로 변환)
   * 정규화된 벡터에서 dot product = cosine similarity
   * 이를 통해 L2 distance 기반 검색에서도 cosine similarity와 동일한 결과를 얻을 수 있음
   */
  private normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
  }

  async initialize(): Promise<void> {
    // 디렉토리 생성
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

    // LanceDB 연결
    this.db = await lancedb.connect(this.dbPath);

    // 기존 테이블 확인
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  async add(documents: VectorDocument[]): Promise<void> {
    if (!this.db) throw new Error("VectorStore not initialized");
    if (documents.length === 0) return;

    const records: LanceDBRecord[] = documents.map(doc => ({
      id: doc.id,
      noteId: doc.noteId,
      notePath: doc.notePath,
      chunkIndex: doc.chunkIndex,
      content: doc.content,
      vector: this.normalizeVector(doc.embedding), // L2 정규화 적용
      title: doc.metadata.title,
      type: doc.metadata.type,
      tags: JSON.stringify(doc.metadata.tags),
      created: doc.metadata.created,
      modified: doc.metadata.modified,
      connectionCount: doc.metadata.connectionCount,
      tokens: JSON.stringify(doc.metadata.tokens || []),
    }));

    if (!this.table) {
      // 테이블 생성
      this.table = await this.db.createTable(this.tableName, records as unknown as Data);
    } else {
      // 기존 테이블에 추가
      await this.table.add(records as unknown as Data);
    }
  }

  async search(queryVector: number[], topK: number): Promise<VectorStoreSearchResult[]> {
    if (!this.table) return [];

    // 쿼리 벡터도 정규화하여 저장된 벡터와 일관성 유지
    const normalizedQuery = this.normalizeVector(queryVector);

    const results = await this.table
      .search(normalizedQuery)
      .limit(topK)
      .toArray() as LanceDBSearchRow[];

    return results.map((row: LanceDBSearchRow) => ({
      id: row.id,
      score: Math.max(0, 1 - row._distance), // distance를 similarity로 변환
      metadata: {
        noteId: row.noteId,
        notePath: row.notePath,
        chunkIndex: row.chunkIndex,
        content: row.content,
        title: row.title,
        type: row.type,
        tags: JSON.parse(row.tags) as string[],
        created: row.created,
        modified: row.modified,
        connectionCount: row.connectionCount,
        tokens: row.tokens ? JSON.parse(row.tokens) as string[] : undefined,
      },
    }));
  }

  async delete(ids: string[]): Promise<void> {
    if (!this.table || ids.length === 0) return;
    const idList = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(", ");
    await this.table.delete(`id IN (${idList})`);
  }

  async deleteByNotePath(notePath: string): Promise<void> {
    if (!this.table) return;
    const sanitizedPath = notePath.replace(/'/g, "''");
    await this.table.delete(`notePath = '${sanitizedPath}'`);
  }

  async deleteByNoteId(noteId: string): Promise<void> {
    if (!this.table) return;
    const sanitizedId = noteId.replace(/'/g, "''");
    await this.table.delete(`noteId = '${sanitizedId}'`);
  }

  async clear(): Promise<void> {
    if (!this.db) return;

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      await this.db.dropTable(this.tableName);
      this.table = null;
    }
  }

  async count(): Promise<number> {
    if (!this.table) return 0;
    return await this.table.countRows();
  }

  async getAllDocuments(): Promise<VectorDocument[]> {
    if (!this.table) return [];

    const rows = await this.table.query().toArray() as LanceDBRecord[];
    return rows.map((row: LanceDBRecord) => ({
      id: row.id,
      noteId: row.noteId,
      notePath: row.notePath,
      chunkIndex: row.chunkIndex,
      content: row.content,
      // LanceDB returns Vector objects that don't support direct indexing [i]
      // Convert to regular array for compatibility with cosine similarity
      embedding: Array.from(row.vector as unknown as Iterable<number>),
      metadata: {
        title: row.title,
        type: row.type,
        tags: JSON.parse(row.tags) as string[],
        created: row.created,
        modified: row.modified,
        connectionCount: row.connectionCount,
        tokens: row.tokens ? JSON.parse(row.tokens) as string[] : undefined,
      },
    }));
  }

  /**
   * 벡터 인덱스 생성 (IVF_PQ 또는 HNSW_SQ)
   *
   * LanceDB JS SDK 지원 인덱스 타입:
   * - IVF_PQ: 파티션 기반 + 제품 양자화 (대규모 데이터셋에 적합)
   * - IVF_FLAT: 파티션 기반 (중간 규모)
   * - HNSW_SQ: 그래프 기반 + 스칼라 양자화 (빠른 검색)
   * - HNSW_PQ: 그래프 기반 + 제품 양자화
   *
   * 참고: 정규화된 벡터를 사용하므로 L2 distance로 검색해도
   * cosine similarity와 동일한 순위가 나옴
   *
   * @param indexType - 인덱스 타입 (기본값: 'ivf_pq')
   * @param options - 인덱스 생성 옵션
   */
  async createIndex(
    indexType: 'ivf_pq' | 'hnsw_sq' = 'ivf_pq',
    options?: {
      numPartitions?: number;
      numSubVectors?: number;
      // HNSW specific
      efConstruction?: number;
      m?: number;
    }
  ): Promise<void> {
    if (!this.table) {
      throw new Error("Table not initialized. Add documents first.");
    }

    const rowCount = await this.table.countRows();
    if (rowCount < 256) {
      // 데이터가 적으면 인덱스가 오히려 성능 저하를 일으킬 수 있음
      console.log(`Skipping index creation: only ${rowCount} rows (need at least 256)`);
      return;
    }

    if (indexType === 'ivf_pq') {
      // IVF_PQ: 대규모 데이터셋에 적합
      // numPartitions 기본값: sqrt(rowCount)
      // numSubVectors 기본값: dimension / 16
      await this.table.createIndex("vector", {
        config: lancedb.Index.ivfPq({
          numPartitions: options?.numPartitions ?? Math.max(1, Math.floor(Math.sqrt(rowCount))),
          numSubVectors: options?.numSubVectors ?? 16,
        }),
      });
    } else {
      // HNSW_SQ: 빠른 검색, 메모리 효율적
      await this.table.createIndex("vector", {
        config: lancedb.Index.hnswSq({
          numPartitions: 1, // HNSW에서는 보통 1개 파티션 권장
          efConstruction: options?.efConstruction ?? 150,
          m: options?.m ?? 20,
        }),
      });
    }
  }

  /**
   * 인덱스 목록 조회
   */
  async listIndices(): Promise<Array<{ name: string; columns: string[] }>> {
    if (!this.table) return [];
    const indices = await this.table.listIndices();
    return indices.map(idx => ({
      name: idx.name,
      columns: idx.columns,
    }));
  }
}

/**
 * 인메모리 VectorStore (테스트 및 폴백용)
 * LanceDBVectorStore와 동일한 정규화 로직을 사용하여 일관성 유지
 */
export class InMemoryVectorStore implements IVectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  /**
   * L2 정규화 (단위 벡터로 변환)
   * LanceDBVectorStore와 동일한 정규화 로직
   */
  private normalizeVector(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
  }

  async initialize(): Promise<void> {
    // 인메모리는 초기화 불필요
  }

  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      // 저장 시 벡터 정규화
      const normalizedDoc: VectorDocument = {
        ...doc,
        embedding: this.normalizeVector(doc.embedding),
      };
      this.documents.set(doc.id, normalizedDoc);
    }
  }

  async search(queryVector: number[], topK: number): Promise<VectorStoreSearchResult[]> {
    // 쿼리 벡터도 정규화
    const normalizedQuery = this.normalizeVector(queryVector);
    const results: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      // 정규화된 벡터들의 dot product = cosine similarity
      const score = this.dotProduct(normalizedQuery, doc.embedding);
      results.push({ doc, score });
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK).map(r => ({
      id: r.doc.id,
      score: r.score,
      metadata: {
        noteId: r.doc.noteId,
        notePath: r.doc.notePath,
        chunkIndex: r.doc.chunkIndex,
        content: r.doc.content,
        ...r.doc.metadata,
      },
    }));
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.documents.delete(id);
    }
  }

  async deleteByNotePath(notePath: string): Promise<void> {
    for (const [id, doc] of this.documents) {
      if (doc.notePath === notePath) {
        this.documents.delete(id);
      }
    }
  }

  async deleteByNoteId(noteId: string): Promise<void> {
    for (const [id, doc] of this.documents) {
      if (doc.noteId === noteId) {
        this.documents.delete(id);
      }
    }
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  async getAllDocuments(): Promise<VectorDocument[]> {
    return Array.from(this.documents.values());
  }

  /**
   * 정규화된 벡터 간의 dot product (= cosine similarity)
   */
  private dotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return Math.max(0, dot);
  }
}
