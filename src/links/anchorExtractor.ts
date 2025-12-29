/**
 * GigaMind Link Suggestion - Anchor Extractor
 *
 * 노트 본문에서 링크 후보가 될 수 있는 앵커 텍스트를 추출
 * - 명사구, 고유명사, 기술 용어 추출
 * - 기존 [[wikilink]] 위치는 제외
 * - 2~10 단어 길이의 의미있는 구문 선택
 */

import type { AnchorCandidate, ExistingWikilink, NoteInfo } from "./types.js";
import { parseWikilinks } from "../utils/graph/wikilinks.js";

// ============================================================================
// Configuration
// ============================================================================

/** 앵커 추출 설정 */
export interface AnchorExtractorConfig {
  /** 최소 앵커 길이 (문자 수, 기본: 2) */
  minLength?: number;
  /** 최대 앵커 길이 (문자 수, 기본: 100) */
  maxLength?: number;
  /** 최소 단어 수 (기본: 1) */
  minWords?: number;
  /** 최대 단어 수 (기본: 10) */
  maxWords?: number;
  /** 노트 정보 목록 (제목/헤더 매칭용) */
  notes?: NoteInfo[];
}

const DEFAULT_CONFIG: Required<Omit<AnchorExtractorConfig, "notes">> = {
  minLength: 2,
  maxLength: 100,
  minWords: 1,
  maxWords: 10,
};

// ============================================================================
// Stopwords (common words to exclude from standalone anchors)
// ============================================================================

const STOPWORDS_EN = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "this", "that", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
  "who", "when", "where", "why", "how", "all", "each", "every", "both",
  "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just", "also",
]);

const STOPWORDS_KO = new Set([
  "이", "그", "저", "것", "수", "등", "및", "또는", "그리고", "하지만",
  "때문에", "위해", "통해", "대해", "에서", "으로", "에게", "부터",
]);

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * 노트 본문에서 앵커 후보를 추출
 *
 * @param content - 노트 본문 내용
 * @param config - 추출 설정
 * @returns 앵커 후보 배열
 */
export function extractAnchors(
  content: string,
  config: AnchorExtractorConfig = {}
): AnchorCandidate[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const candidates: AnchorCandidate[] = [];

  // 1. 기존 위키링크 위치 수집 (제외용)
  const existingLinks = getExistingWikilinks(content);
  const excludedRanges = existingLinks.map((l) => l.range);

  // 2. 노트 제목/헤더 매칭 (가장 높은 우선순위)
  if (cfg.notes && cfg.notes.length > 0) {
    const titleMatches = extractTitleMatches(content, cfg.notes, excludedRanges);
    candidates.push(...titleMatches);
  }

  // 3. 기술 용어 추출 (패턴 기반)
  const technicalTerms = extractTechnicalTerms(content, cfg, excludedRanges);
  candidates.push(...technicalTerms);

  // 4. 대문자로 시작하는 구문 (고유명사 후보)
  const properNouns = extractProperNouns(content, cfg, excludedRanges);
  candidates.push(...properNouns);

  // 5. CJK 명사구 추출 (한국어, 중국어, 일본어)
  const cjkPhrases = extractCJKPhrases(content, cfg, excludedRanges);
  candidates.push(...cjkPhrases);

  // 6. 중복 제거 및 정렬
  return deduplicateCandidates(candidates);
}

// ============================================================================
// Existing Wikilink Detection
// ============================================================================

/**
 * 기존 위키링크 위치 추출
 */
export function getExistingWikilinks(content: string): ExistingWikilink[] {
  const parsed = parseWikilinks(content);

  return parsed.map((link) => ({
    raw: link.raw,
    target: link.target,
    alias: link.alias,
    range: {
      start: link.position.start,
      end: link.position.end,
    },
  }));
}

// ============================================================================
// Title/Header Matching
// ============================================================================

/**
 * 노트 제목과 일치하는 텍스트 찾기
 */
function extractTitleMatches(
  content: string,
  notes: NoteInfo[],
  excludedRanges: Array<{ start: number; end: number }>
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];
  const contentLower = content.toLowerCase();

  for (const note of notes) {
    // 제목 매칭
    const titleLower = note.title.toLowerCase();
    if (titleLower.length >= 2) {
      const matches = findAllOccurrences(contentLower, titleLower);
      for (const pos of matches) {
        const range = { start: pos, end: pos + note.title.length };
        if (!isOverlapping(range, excludedRanges)) {
          candidates.push({
            text: content.slice(range.start, range.end),
            range,
            type: "title_match",
          });
        }
      }
    }

    // 별칭 매칭
    if (note.aliases) {
      for (const alias of note.aliases) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower.length >= 2) {
          const matches = findAllOccurrences(contentLower, aliasLower);
          for (const pos of matches) {
            const range = { start: pos, end: pos + alias.length };
            if (!isOverlapping(range, excludedRanges)) {
              candidates.push({
                text: content.slice(range.start, range.end),
                range,
                type: "title_match",
              });
            }
          }
        }
      }
    }

    // 헤더 매칭
    if (note.headers) {
      for (const header of note.headers) {
        const headerLower = header.toLowerCase();
        if (headerLower.length >= 3) {
          const matches = findAllOccurrences(contentLower, headerLower);
          for (const pos of matches) {
            const range = { start: pos, end: pos + header.length };
            if (!isOverlapping(range, excludedRanges)) {
              candidates.push({
                text: content.slice(range.start, range.end),
                range,
                type: "header_match",
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}

// ============================================================================
// Technical Term Extraction
// ============================================================================

/**
 * 기술 용어 패턴 추출
 * - CamelCase, PascalCase
 * - 약어 (대문자 연속)
 * - 하이픈/언더스코어 연결 용어
 */
function extractTechnicalTerms(
  content: string,
  config: Required<Omit<AnchorExtractorConfig, "notes">>,
  excludedRanges: Array<{ start: number; end: number }>
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];

  // CamelCase/PascalCase 패턴
  const camelCasePattern = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;

  // 약어 패턴 (2-6 대문자)
  const acronymPattern = /\b[A-Z]{2,6}\b/g;

  // 하이픈 연결 용어
  const hyphenatedPattern = /\b[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g;

  const patterns = [
    { regex: camelCasePattern, type: "technical_term" as const },
    { regex: acronymPattern, type: "technical_term" as const },
    { regex: hyphenatedPattern, type: "technical_term" as const },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const text = match[0];
      if (
        text.length >= config.minLength &&
        text.length <= config.maxLength
      ) {
        const range = { start: match.index, end: match.index + text.length };
        if (!isOverlapping(range, excludedRanges)) {
          candidates.push({ text, range, type });
        }
      }
    }
  }

  return candidates;
}

// ============================================================================
// Proper Noun Extraction
// ============================================================================

/**
 * 고유명사 후보 추출 (대문자로 시작하는 단어/구)
 */
function extractProperNouns(
  content: string,
  config: Required<Omit<AnchorExtractorConfig, "notes">>,
  excludedRanges: Array<{ start: number; end: number }>
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];

  // 대문자로 시작하는 단어 연속 (1-5 단어)
  const properNounPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\b/g;

  let match;
  while ((match = properNounPattern.exec(content)) !== null) {
    const text = match[0];
    const wordCount = text.split(/\s+/).length;

    // 문장 시작 위치가 아닌지 확인 (간단한 휴리스틱)
    const prevChar = match.index > 0 ? content[match.index - 1] : "";
    const isAfterSentenceEnd = /[.!?]\s*$/.test(content.slice(0, match.index));
    const isAtStart = match.index === 0;

    // 단일 단어이고 문장 시작이면 스킵
    if (wordCount === 1 && (isAfterSentenceEnd || isAtStart)) {
      continue;
    }

    if (
      text.length >= config.minLength &&
      text.length <= config.maxLength &&
      wordCount >= config.minWords &&
      wordCount <= config.maxWords &&
      !STOPWORDS_EN.has(text.toLowerCase())
    ) {
      const range = { start: match.index, end: match.index + text.length };
      if (!isOverlapping(range, excludedRanges)) {
        candidates.push({ text, range, type: "proper_noun" });
      }
    }
  }

  return candidates;
}

// ============================================================================
// CJK Phrase Extraction
// ============================================================================

/**
 * CJK 명사구 추출 (한국어, 중국어, 일본어)
 */
function extractCJKPhrases(
  content: string,
  config: Required<Omit<AnchorExtractorConfig, "notes">>,
  excludedRanges: Array<{ start: number; end: number }>
): AnchorCandidate[] {
  const candidates: AnchorCandidate[] = [];

  // 한글 명사구 패턴 (2-10 글자의 한글 연속 + 영문자/숫자 조합)
  const koreanPattern = /[\uAC00-\uD7A3]+(?:\s*[\uAC00-\uD7A3a-zA-Z0-9]+)*/g;

  // 중국어/일본어 한자 패턴
  const cjkPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]+/g;

  let match;

  // 한글 처리
  while ((match = koreanPattern.exec(content)) !== null) {
    const text = match[0].trim();
    if (
      text.length >= config.minLength &&
      text.length <= config.maxLength &&
      !STOPWORDS_KO.has(text)
    ) {
      const range = { start: match.index, end: match.index + match[0].length };
      if (!isOverlapping(range, excludedRanges)) {
        candidates.push({ text, range, type: "noun_phrase" });
      }
    }
  }

  // 중국어/일본어 처리
  while ((match = cjkPattern.exec(content)) !== null) {
    const text = match[0];
    if (
      text.length >= config.minLength &&
      text.length <= config.maxLength
    ) {
      const range = { start: match.index, end: match.index + text.length };
      if (!isOverlapping(range, excludedRanges)) {
        candidates.push({ text, range, type: "noun_phrase" });
      }
    }
  }

  return candidates;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 문자열에서 패턴의 모든 발생 위치 찾기
 */
function findAllOccurrences(text: string, pattern: string): number[] {
  const positions: number[] = [];
  let pos = 0;

  while ((pos = text.indexOf(pattern, pos)) !== -1) {
    positions.push(pos);
    pos += 1;
  }

  return positions;
}

/**
 * 범위가 제외 목록과 겹치는지 확인
 */
function isOverlapping(
  range: { start: number; end: number },
  excludedRanges: Array<{ start: number; end: number }>
): boolean {
  for (const excluded of excludedRanges) {
    // 겹침 조건: range.start < excluded.end && range.end > excluded.start
    if (range.start < excluded.end && range.end > excluded.start) {
      return true;
    }
  }
  return false;
}

/**
 * 중복 후보 제거 및 정렬
 * - 동일 위치의 후보는 가장 긴 것 선택
 * - 위치 순으로 정렬
 */
function deduplicateCandidates(candidates: AnchorCandidate[]): AnchorCandidate[] {
  // 시작 위치로 그룹화
  const byStart = new Map<number, AnchorCandidate[]>();

  for (const candidate of candidates) {
    const existing = byStart.get(candidate.range.start) || [];
    existing.push(candidate);
    byStart.set(candidate.range.start, existing);
  }

  // 각 시작 위치에서 가장 긴/우선순위 높은 후보 선택
  const typePriority: Record<string, number> = {
    title_match: 0,
    header_match: 1,
    technical_term: 2,
    proper_noun: 3,
    noun_phrase: 4,
  };

  const result: AnchorCandidate[] = [];

  for (const group of byStart.values()) {
    // 우선순위 정렬: type priority > length (longer better)
    group.sort((a, b) => {
      const priorityDiff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return b.text.length - a.text.length;
    });

    result.push(group[0]);
  }

  // 위치 순 정렬
  result.sort((a, b) => a.range.start - b.range.start);

  // 겹치는 범위 제거 (선행 후보 우선)
  const filtered: AnchorCandidate[] = [];
  let lastEnd = -1;

  for (const candidate of result) {
    if (candidate.range.start >= lastEnd) {
      filtered.push(candidate);
      lastEnd = candidate.range.end;
    }
  }

  return filtered;
}
