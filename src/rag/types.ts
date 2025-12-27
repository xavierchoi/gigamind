/**
 * GigaMind RAG 시스템 타입 정의
 * 벡터 임베딩 및 검색 관련 인터페이스
 */

import { z } from "zod";

// ============================================================================
// Schema Version Management
// ============================================================================

/** 현재 RAG 스키마 버전 */
export const RAG_SCHEMA_VERSION = 1;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * 임베딩 설정 스키마
 */
export const EmbeddingConfigSchema = z.object({
  model: z.enum(["text-embedding-3-small", "voyage-3-lite"]),
  dimensions: z.number().positive(),
  batchSize: z.number().positive(),
});

/**
 * 벡터 문서 메타데이터 스키마
 */
export const VectorDocumentMetadataSchema = z.object({
  title: z.string(),
  type: z.string(),
  tags: z.array(z.string()),
  created: z.string(),
  modified: z.string(),
  connectionCount: z.number().nonnegative(),
});

/**
 * 벡터 문서 스키마
 */
export const VectorDocumentSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  notePath: z.string(),
  chunkIndex: z.number().nonnegative(),
  content: z.string(),
  embedding: z.array(z.number()),
  metadata: VectorDocumentMetadataSchema,
});

/**
 * 검색 결과 스키마
 */
export const SearchResultSchema = z.object({
  document: VectorDocumentSchema,
  score: z.number(),
  distance: z.number().nonnegative(),
});

/**
 * 청크 결과 스키마
 */
export const ChunkResultSchema = z.object({
  content: z.string(),
  score: z.number(),
  chunkIndex: z.number().nonnegative(),
});

/**
 * 검색 결과 스키마
 */
export const RetrievalResultSchema = z.object({
  noteId: z.string(),
  notePath: z.string(),
  noteTitle: z.string(),
  chunks: z.array(ChunkResultSchema),
  finalScore: z.number(),
  confidence: z.number().min(0).max(1),
  graphCentrality: z.number().nonnegative(),
});

/**
 * 버전 관리가 포함된 RAG 데이터 스키마
 */
export const VersionedRagDataSchema = z.object({
  schemaVersion: z.number(),
  documents: z.array(VectorDocumentSchema),
  createdAt: z.string(),
});

export type VersionedRagData = z.infer<typeof VersionedRagDataSchema>;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * VectorDocument 검증 함수
 * @throws ZodError if validation fails
 */
export function validateVectorDocument(data: unknown): VectorDocument {
  return VectorDocumentSchema.parse(data);
}

/**
 * 안전한 VectorDocument 검증 함수
 * @returns parsed data or null if validation fails
 */
export function safeValidateVectorDocument(
  data: unknown
): VectorDocument | null {
  const result = VectorDocumentSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * SearchResult 검증 함수
 * @throws ZodError if validation fails
 */
export function validateSearchResult(data: unknown): SearchResult {
  return SearchResultSchema.parse(data);
}

/**
 * RetrievalResult 검증 함수
 * @throws ZodError if validation fails
 */
export function validateRetrievalResult(data: unknown): RetrievalResult {
  return RetrievalResultSchema.parse(data);
}

/**
 * EmbeddingConfig 검증 함수
 * @throws ZodError if validation fails
 */
export function validateEmbeddingConfig(data: unknown): EmbeddingConfig {
  return EmbeddingConfigSchema.parse(data);
}

/**
 * 버전 호환성 검사 함수
 */
export function isRagSchemaVersionCompatible(version: number): boolean {
  return version === RAG_SCHEMA_VERSION;
}

// ============================================================================
// TypeScript Interfaces (기존 인터페이스 유지)
// ============================================================================

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
