/**
 * GigaMind Eval - Dataset Loader
 *
 * JSONL 파일을 스트림으로 로드하고 Zod 스키마로 검증
 * AsyncGenerator 패턴으로 메모리 효율적인 대용량 데이터셋 처리
 */

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import type { ZodType } from "zod";
import {
  SearchQuerySchema,
  type SearchQuery,
  type ValidationError,
  type DatasetLoadResult,
  type ZodIssueCompat,
} from "./searchSchema.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 로더 옵션
 */
export interface LoaderOptions<T> {
  /** strict 모드: 에러 발생 시 즉시 실패 (기본: false) */
  strict?: boolean;
  /** 빈 라인 스킵 여부 (기본: true) */
  skipEmptyLines?: boolean;
  /** 주석 라인 스킵 여부 - # 으로 시작하는 라인 (기본: true) */
  skipComments?: boolean;
  /** 검증 실패 시 콜백 */
  onValidationError?: (error: ValidationError) => void;
  /** 성공적으로 파싱된 레코드 콜백 */
  onRecord?: (record: T, lineNumber: number) => void;
}

/**
 * 스트림 로더 결과 (개별 레코드)
 */
export interface LoadedRecord<T> {
  /** 레코드 데이터 */
  data: T;
  /** 라인 번호 (1-based) */
  lineNumber: number;
}

// ============================================================================
// Stream Loader (AsyncGenerator)
// ============================================================================

/**
 * JSONL 파일을 스트림으로 로드하는 AsyncGenerator
 *
 * @param filePath - JSONL 파일 경로
 * @param options - 로더 옵션
 * @yields 검증된 SearchQuery 레코드
 * @throws Error if strict mode and validation fails
 *
 * @example
 * ```typescript
 * for await (const { data, lineNumber } of loadDatasetStream("queries.jsonl", SearchQuerySchema)) {
 *   console.log(`Line ${lineNumber}: ${data.query}`);
 * }
 * ```
 */
export async function* loadDatasetStream<T>(
  filePath: string,
  schema: ZodType<T>,
  options: LoaderOptions<T> = {}
): AsyncGenerator<LoadedRecord<T>, void, undefined> {
  const {
    strict = false,
    skipEmptyLines = true,
    skipComments = true,
    onValidationError,
    onRecord,
  } = options;

  const absolutePath = path.resolve(filePath);

  // 파일 존재 확인
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Dataset file not found: ${absolutePath}`);
  }

  const fileStream = fs.createReadStream(absolutePath, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity, // Windows CRLF 지원
  });

  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber++;

    // 빈 라인 스킵
    if (skipEmptyLines && line.trim() === "") {
      continue;
    }

    // 주석 라인 스킵
    if (skipComments && line.trim().startsWith("#")) {
      continue;
    }

    // JSON 파싱 시도
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (parseError) {
      const error: ValidationError = {
        line: lineNumber,
        message: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };

      if (strict) {
        fileStream.destroy();
        throw new Error(`[Line ${lineNumber}] ${error.message}`);
      }

      onValidationError?.(error);
      continue;
    }

    // Zod 스키마 검증
    const result = schema.safeParse(parsed);

    if (!result.success) {
      const zodIssues = result.error.issues;
      const error: ValidationError = {
        line: lineNumber,
        message: `Validation error: ${zodIssues.map((e) => `${String(e.path.join("."))}: ${e.message}`).join(", ")}`,
        rawData: parsed,
        zodErrors: zodIssues as ZodIssueCompat[],
      };

      if (strict) {
        fileStream.destroy();
        throw new Error(`[Line ${lineNumber}] ${error.message}`);
      }

      onValidationError?.(error);
      continue;
    }

    const record: LoadedRecord<T> = {
      data: result.data,
      lineNumber,
    };

    onRecord?.(result.data, lineNumber);
    yield record;
  }
}

// ============================================================================
// Batch Loader
// ============================================================================

/**
 * JSONL 파일을 전체 로드하여 배열로 반환
 *
 * @param filePath - JSONL 파일 경로
 * @param options - 로더 옵션
 * @returns 데이터셋 로딩 결과
 *
 * @example
 * ```typescript
 * const result = await loadDataset("queries.jsonl");
 * console.log(`Loaded ${result.queries.length} queries (${result.successRate * 100}% success)`);
 * if (result.errors.length > 0) {
 *   console.warn("Errors:", result.errors);
 * }
 * ```
 */
export async function loadDataset(
  filePath: string,
  options: LoaderOptions<SearchQuery> = {}
): Promise<DatasetLoadResult> {
  const queries: SearchQuery[] = [];
  const errors: ValidationError[] = [];

  const loaderOptions: LoaderOptions<SearchQuery> = {
    ...options,
    onValidationError: (error) => {
      errors.push(error);
      options.onValidationError?.(error);
    },
    onRecord: (record, lineNumber) => {
      options.onRecord?.(record, lineNumber);
    },
  };

  try {
    for await (const { data } of loadDatasetStream(
      filePath,
      SearchQuerySchema,
      loaderOptions
    )) {
      queries.push(data);
    }
  } catch (error) {
    // strict 모드에서 에러 발생 시 그대로 throw
    if (options.strict) {
      throw error;
    }
    // non-strict 모드에서는 에러를 기록하고 계속
    errors.push({
      line: queries.length + errors.length + 1,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // 전체 라인 수 계산 (성공 + 실패)
  const totalLines = queries.length + errors.length;

  return {
    queries,
    errors,
    totalLines,
    successRate: totalLines > 0 ? queries.length / totalLines : 0,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 데이터셋 파일 유효성 빠른 검사
 * 첫 N개 라인만 검증하여 파일 형식 확인
 *
 * @param filePath - JSONL 파일 경로
 * @param sampleSize - 검사할 라인 수 (기본: 10)
 * @returns 유효성 검사 결과
 */
export async function validateDatasetFile(
  filePath: string,
  sampleSize: number = 10
): Promise<{
  valid: boolean;
  checkedLines: number;
  errors: ValidationError[];
}> {
  const errors: ValidationError[] = [];
  let checkedLines = 0;

  try {
    for await (const { lineNumber } of loadDatasetStream(
      filePath,
      SearchQuerySchema,
      {
        strict: false,
        onValidationError: (error) => errors.push(error),
      }
    )) {
      checkedLines++;
      if (checkedLines >= sampleSize) {
        break;
      }
    }
  } catch (error) {
    errors.push({
      line: checkedLines + 1,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    valid: errors.length === 0,
    checkedLines,
    errors,
  };
}

/**
 * 데이터셋 통계 수집
 *
 * @param filePath - JSONL 파일 경로
 * @returns 데이터셋 통계
 */
export async function getDatasetStats(filePath: string): Promise<{
  totalQueries: number;
  answerableCount: number;
  unanswerableCount: number;
  byLanguage: Record<string, number>;
  byDifficulty: Record<string, number>;
  byTags: Record<string, number>;
  avgExpectedNotes: number;
  avgExpectedSpans: number;
}> {
  const stats = {
    totalQueries: 0,
    answerableCount: 0,
    unanswerableCount: 0,
    byLanguage: {} as Record<string, number>,
    byDifficulty: {} as Record<string, number>,
    byTags: {} as Record<string, number>,
    totalExpectedNotes: 0,
    totalExpectedSpans: 0,
  };

  for await (const { data } of loadDatasetStream(
    filePath,
    SearchQuerySchema
  )) {
    stats.totalQueries++;

    if (data.answerable) {
      stats.answerableCount++;
    } else {
      stats.unanswerableCount++;
    }

    // 언어별 집계
    const lang = data.language ?? "unknown";
    stats.byLanguage[lang] = (stats.byLanguage[lang] ?? 0) + 1;

    // 난이도별 집계
    const diff = data.difficulty ?? "unknown";
    stats.byDifficulty[diff] = (stats.byDifficulty[diff] ?? 0) + 1;

    // 태그별 집계
    for (const tag of data.tags ?? []) {
      stats.byTags[tag] = (stats.byTags[tag] ?? 0) + 1;
    }

    // 평균 계산용
    stats.totalExpectedNotes += data.expected_notes.length;
    stats.totalExpectedSpans += data.expected_spans?.length ?? 0;
  }

  return {
    totalQueries: stats.totalQueries,
    answerableCount: stats.answerableCount,
    unanswerableCount: stats.unanswerableCount,
    byLanguage: stats.byLanguage,
    byDifficulty: stats.byDifficulty,
    byTags: stats.byTags,
    avgExpectedNotes: stats.totalQueries > 0
      ? stats.totalExpectedNotes / stats.totalQueries
      : 0,
    avgExpectedSpans: stats.totalQueries > 0
      ? stats.totalExpectedSpans / stats.totalQueries
      : 0,
  };
}

/**
 * 데이터셋을 언어별로 필터링하여 로드
 *
 * @param filePath - JSONL 파일 경로
 * @param language - 필터링할 언어 코드
 * @returns 필터링된 쿼리 배열
 */
export async function loadDatasetByLanguage(
  filePath: string,
  language: string
): Promise<SearchQuery[]> {
  const queries: SearchQuery[] = [];

  for await (const { data } of loadDatasetStream(
    filePath,
    SearchQuerySchema
  )) {
    if (data.language === language) {
      queries.push(data);
    }
  }

  return queries;
}

/**
 * 데이터셋을 난이도별로 필터링하여 로드
 *
 * @param filePath - JSONL 파일 경로
 * @param difficulty - 필터링할 난이도
 * @returns 필터링된 쿼리 배열
 */
export async function loadDatasetByDifficulty(
  filePath: string,
  difficulty: "easy" | "mid" | "hard"
): Promise<SearchQuery[]> {
  const queries: SearchQuery[] = [];

  for await (const { data } of loadDatasetStream(
    filePath,
    SearchQuerySchema
  )) {
    if (data.difficulty === difficulty) {
      queries.push(data);
    }
  }

  return queries;
}
