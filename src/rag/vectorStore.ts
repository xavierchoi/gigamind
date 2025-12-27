/**
 * LanceDB-based Vector Store for persistent embedding storage
 *
 * Note: This implementation uses the @lancedb/lancedb package.
 * If package.json has "lancedb": "^0.0.1", update it to "@lancedb/lancedb": "^0.23.0"
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
      vector: doc.embedding,
      title: doc.metadata.title,
      type: doc.metadata.type,
      tags: JSON.stringify(doc.metadata.tags),
      created: doc.metadata.created,
      modified: doc.metadata.modified,
      connectionCount: doc.metadata.connectionCount,
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

    const results = await this.table
      .search(queryVector)
      .limit(topK)
      .toArray() as LanceDBSearchRow[];

    return results.map((row: LanceDBSearchRow) => ({
      id: row.id,
      score: 1 - row._distance, // distance를 similarity로 변환
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
      embedding: row.vector,
      metadata: {
        title: row.title,
        type: row.type,
        tags: JSON.parse(row.tags) as string[],
        created: row.created,
        modified: row.modified,
        connectionCount: row.connectionCount,
      },
    }));
  }
}

/**
 * 인메모리 VectorStore (테스트 및 폴백용)
 */
export class InMemoryVectorStore implements IVectorStore {
  private documents: Map<string, VectorDocument> = new Map();

  async initialize(): Promise<void> {
    // 인메모리는 초기화 불필요
  }

  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  async search(queryVector: number[], topK: number): Promise<VectorStoreSearchResult[]> {
    const results: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      const score = this.cosineSimilarity(queryVector, doc.embedding);
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

  async clear(): Promise<void> {
    this.documents.clear();
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  async getAllDocuments(): Promise<VectorDocument[]> {
    return Array.from(this.documents.values());
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const mag = Math.sqrt(normA) * Math.sqrt(normB);
    return mag === 0 ? 0 : dot / mag;
  }
}
