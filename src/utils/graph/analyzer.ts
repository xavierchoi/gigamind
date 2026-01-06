/**
 * 그래프 분석 엔진
 * 노트 간 연결 관계를 분석하고 통계를 생성
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { expandPath } from "../config.js";
import {
  extractWikilinks,
  parseWikilinks,
  extractContext,
  normalizeNoteTitle,
  isSameNote,
} from "./wikilinks.js";
import { getCache, setCache, invalidateCache } from "./cache.js";
import type {
  NoteGraphStats,
  BacklinkEntry,
  DanglingLink,
  NoteMetadata,
  AnalyzeOptions,
  QuickNoteStats,
} from "./types.js";

/**
 * Parallel map with concurrency limit
 * Executes async operations on items with a maximum number of concurrent operations
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 10
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

/**
 * Get IO concurrency from environment variable
 */
function getIOConcurrency(): number {
  return parseInt(process.env.GIGAMIND_IO_CONCURRENCY || "10", 10);
}

/**
 * 디렉토리에서 모든 마크다운 파일 수집 (재귀)
 *
 * @param dir 검색할 디렉토리 경로
 * @returns 마크다운 파일 경로 배열
 */
export async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  // Check if the root directory exists first
  try {
    await fs.access(dir);
  } catch {
    // Directory doesn't exist - return empty array gracefully
    return files;
  }

  async function walk(currentDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // 숨김 폴더 제외
          if (!entry.name.startsWith(".")) {
            await walk(fullPath);
          }
        } else if (entry.name.endsWith(".md")) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // 접근할 수 없는 디렉토리는 무시 (subdirectories only)
      // This handles permission errors or directories deleted during walk
    }
  }

  await walk(dir);
  return files;
}

/**
 * 마크다운 파일에서 노트 메타데이터 추출
 */
async function extractNoteMetadata(filePath: string): Promise<NoteMetadata> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const { data } = matter(content);

    const basename = path.basename(filePath, ".md");
    const id = (data.id as string) || basename;
    const title = (data.title as string) || basename;

    return {
      id,
      title,
      path: filePath,
      basename,
    };
  } catch (err) {
    // 파일을 읽을 수 없으면 파일명으로 대체
    const basename = path.basename(filePath, ".md");
    return {
      id: basename,
      title: basename,
      path: filePath,
      basename,
    };
  }
}

/**
 * 노트 그래프 전체 분석
 *
 * @param notesDir 노트 디렉토리 경로
 * @param options 분석 옵션
 * @returns 그래프 통계
 */
export async function analyzeNoteGraph(
  notesDir: string,
  options: AnalyzeOptions = {}
): Promise<NoteGraphStats> {
  const {
    includeContext = false,
    contextLength = 100,
    useCache = true,
  } = options;

  const expandedDir = expandPath(notesDir);

  // 캐시 확인
  if (useCache) {
    const cached = getCache<NoteGraphStats>("graph-stats", expandedDir);
    if (cached) {
      return cached;
    }
  }

  // 1. 모든 마크다운 파일 수집
  const files = await collectMarkdownFiles(expandedDir);

  // 2. 존재하는 노트 목록 구축 (정규화된 제목 -> 메타데이터)
  const existingNotes = new Map<string, NoteMetadata>();

  // Parallel metadata extraction
  const noteMetadataList = await parallelMap(
    files,
    (file) => extractNoteMetadata(file),
    getIOConcurrency()
  );

  // Build lookup maps from extracted metadata
  for (const metadata of noteMetadataList) {
    // 여러 키로 매핑 (제목, 파일명, ID)
    existingNotes.set(normalizeNoteTitle(metadata.title), metadata);
    existingNotes.set(normalizeNoteTitle(metadata.basename), metadata);
    if (metadata.id !== metadata.basename) {
      existingNotes.set(normalizeNoteTitle(metadata.id), metadata);
    }
  }

  // 3. Forward links 맵 구축 및 통계 수집
  const forwardLinks = new Map<string, string[]>();
  const backlinks = new Map<string, BacklinkEntry[]>();
  let totalMentions = 0;

  // 고유 연결 쌍 추적 (source-target)
  const uniqueConnectionPairs = new Set<string>();

  // Dangling links 추적
  const danglingLinksMap = new Map<
    string,
    Map<string, { noteId: string; notePath: string; noteTitle: string; count: number }>
  >();

  // Parallel file content reading
  const fileContents = await parallelMap(
    noteMetadataList,
    async (metadata) => {
      try {
        const content = await fs.readFile(metadata.path, "utf-8");
        return { metadata, content, error: null };
      } catch (err) {
        return { metadata, content: null, error: err };
      }
    },
    getIOConcurrency()
  );

  // Process file contents (synchronous processing after parallel I/O)
  for (const { metadata, content, error } of fileContents) {
    if (error || content === null) {
      console.debug(`[analyzer] Cannot process file: ${metadata.path}`, error);
      continue;
    }

    const parsedLinks = parseWikilinks(content);
    const uniqueTargets = extractWikilinks(content);

    totalMentions += parsedLinks.length;
    forwardLinks.set(metadata.path, uniqueTargets);

    // 각 링크 처리
    for (const link of parsedLinks) {
      const normalizedTarget = normalizeNoteTitle(link.target);
      const targetNote = existingNotes.get(normalizedTarget);

      if (targetNote) {
        // 존재하는 노트 -> Backlink 등록
        const targetKey = targetNote.title;
        if (!backlinks.has(targetKey)) {
          backlinks.set(targetKey, []);
        }

        // 중복 backlink 방지
        const existingBacklinks = backlinks.get(targetKey)!;
        const alreadyExists = existingBacklinks.some(
          (bl) => bl.notePath === metadata.path
        );

        if (!alreadyExists) {
          const entry: BacklinkEntry = {
            noteId: metadata.id,
            notePath: metadata.path,
            noteTitle: metadata.title,
            alias: link.alias,
          };

          if (includeContext) {
            entry.context = extractContext(content, link, contextLength);
          }

          existingBacklinks.push(entry);
        }

        // 고유 연결 쌍 등록
        const pairKey = `${metadata.path}::${targetNote.path}`;
        uniqueConnectionPairs.add(pairKey);
      } else {
        // 존재하지 않는 노트 -> Dangling link 등록
        if (!danglingLinksMap.has(link.target)) {
          danglingLinksMap.set(link.target, new Map());
        }

        const sources = danglingLinksMap.get(link.target)!;
        const existing = sources.get(metadata.path);

        if (existing) {
          existing.count++;
        } else {
          sources.set(metadata.path, {
            noteId: metadata.id,
            notePath: metadata.path,
            noteTitle: metadata.title,
            count: 1,
          });
        }
      }
    }
  }

  // 4. Dangling links 배열 생성
  const danglingLinks: DanglingLink[] = [];
  for (const [target, sourcesMap] of danglingLinksMap) {
    danglingLinks.push({
      target,
      sources: Array.from(sourcesMap.values()),
    });
  }

  // 5. Orphan notes 식별 (연결이 전혀 없는 노트)
  const orphanNotes: string[] = [];
  for (const metadata of noteMetadataList) {
    const hasOutgoingLinks = (forwardLinks.get(metadata.path)?.length || 0) > 0;
    const hasIncomingLinks = backlinks.has(metadata.title);

    if (!hasOutgoingLinks && !hasIncomingLinks) {
      orphanNotes.push(metadata.path);
    }
  }

  const stats: NoteGraphStats = {
    noteCount: files.length,
    uniqueConnections: uniqueConnectionPairs.size,
    totalMentions,
    danglingLinks,
    orphanNotes,
    backlinks,
    forwardLinks,
    noteMetadata: noteMetadataList,
  };

  // 캐시 저장
  if (useCache) {
    setCache("graph-stats", expandedDir, stats);
  }

  return stats;
}

/**
 * 특정 노트의 Backlinks 조회
 *
 * @param notesDir 노트 디렉토리 경로
 * @param noteTitle 조회할 노트 제목
 * @returns Backlink 항목 배열
 */
export async function getBacklinksForNote(
  notesDir: string,
  noteTitle: string
): Promise<BacklinkEntry[]> {
  const stats = await analyzeNoteGraph(notesDir, { includeContext: true });

  // 정확한 제목으로 먼저 찾기
  const directMatch = stats.backlinks.get(noteTitle);
  if (directMatch) {
    return directMatch;
  }

  // 정규화된 제목으로 찾기
  const normalizedTarget = normalizeNoteTitle(noteTitle);
  for (const [key, entries] of stats.backlinks) {
    if (normalizeNoteTitle(key) === normalizedTarget) {
      return entries;
    }
  }

  return [];
}

/**
 * Dangling Links (미생성 링크) 조회
 *
 * @param notesDir 노트 디렉토리 경로
 * @returns Dangling link 배열
 */
export async function findDanglingLinks(
  notesDir: string
): Promise<DanglingLink[]> {
  const stats = await analyzeNoteGraph(notesDir);
  return stats.danglingLinks;
}

/**
 * Orphan Notes (고립 노트) 조회
 *
 * @param notesDir 노트 디렉토리 경로
 * @returns 고립 노트 경로 배열
 */
export async function findOrphanNotes(notesDir: string): Promise<string[]> {
  const stats = await analyzeNoteGraph(notesDir);
  return stats.orphanNotes;
}

/**
 * 빠른 통계 조회 (StatusBar용)
 *
 * @param notesDir 노트 디렉토리 경로
 * @returns 간단한 통계
 */
export async function getQuickStats(notesDir: string): Promise<QuickNoteStats> {
  const stats = await analyzeNoteGraph(notesDir);

  return {
    noteCount: stats.noteCount,
    connectionCount: stats.uniqueConnections,
    danglingCount: stats.danglingLinks.length,
    orphanCount: stats.orphanNotes.length,
  };
}

/**
 * 캐시 무효화
 * 노트가 수정되었을 때 호출
 *
 * @param notesDir 노트 디렉토리 경로
 */
export function invalidateGraphCache(notesDir: string): void {
  const expandedDir = expandPath(notesDir);
  invalidateCache("graph-stats", expandedDir);
}
