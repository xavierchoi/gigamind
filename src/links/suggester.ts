/**
 * GigaMind Link Suggestion - Main Suggester
 *
 * 노트에서 자동 링크 제안을 생성하는 메인 함수
 * eval-spec.md Section 10 참조
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
  LinkSuggestion,
  SuggestLinksOptions,
  NoteInfo,
  AnchorCandidate,
} from "./types.js";
import { extractAnchors, getExistingWikilinks } from "./anchorExtractor.js";
import { TargetMatcher, createTargetMatcher } from "./targetMatcher.js";
import { RAGService } from "../rag/service.js";
import { normalizeNoteTitle } from "../utils/graph/wikilinks.js";

// ============================================================================
// Note Loading Utilities
// ============================================================================

// Cache note metadata to avoid rescanning the vault on repeated calls.
let cachedNotesDir: string | null = null;
let cachedNoteInfos: NoteInfo[] | null = null;

export function clearNoteInfoCache(): void {
  cachedNotesDir = null;
  cachedNoteInfos = null;
}

/**
 * 노트 디렉토리에서 노트 정보 로드
 */
export async function loadNoteInfos(notesDir: string): Promise<NoteInfo[]> {
  const notes: NoteInfo[] = [];
  const absoluteNotesDir = path.resolve(notesDir);

  if (cachedNoteInfos && cachedNotesDir === absoluteNotesDir) {
    return cachedNoteInfos;
  }

  async function scanDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // 숨김 폴더 및 특수 폴더 스킵
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const relativePath = path.relative(absoluteNotesDir, fullPath);
        const content = await fs.readFile(fullPath, "utf-8");
        const noteInfo = parseNoteInfo(relativePath, content);
        notes.push(noteInfo);
      }
    }
  }

  await scanDir(absoluteNotesDir);
  cachedNotesDir = absoluteNotesDir;
  cachedNoteInfos = notes;
  return notes;
}

/**
 * 노트 내용에서 정보 추출
 */
function parseNoteInfo(relativePath: string, content: string): NoteInfo {
  const basename = path.basename(relativePath, ".md");
  let title = basename;
  const aliases: string[] = [];
  const headers: string[] = [];

  // Frontmatter에서 title과 aliases 추출
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];

    // title 추출
    const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // aliases 추출
    const aliasesMatch = frontmatter.match(/^aliases:\s*\[(.*)\]/m);
    if (aliasesMatch) {
      const aliasStr = aliasesMatch[1];
      const parsedAliases = aliasStr
        .split(",")
        .map((a) => a.trim().replace(/^["']|["']$/g, ""))
        .filter((a) => a.length > 0);
      aliases.push(...parsedAliases);
    }
  }

  // 본문에서 헤더 추출 (H1-H3)
  const headerPattern = /^#{1,3}\s+(.+)$/gm;
  let match;
  while ((match = headerPattern.exec(content)) !== null) {
    const headerText = match[1].trim();
    if (headerText.length >= 2 && !headers.includes(headerText)) {
      headers.push(headerText);
    }
  }

  return {
    path: relativePath,
    title,
    aliases: aliases.length > 0 ? aliases : undefined,
    headers: headers.length > 0 ? headers : undefined,
  };
}

// ============================================================================
// Main Suggest Links Function
// ============================================================================

/**
 * 노트에서 링크 제안 생성
 *
 * @param notePath - 분석할 노트 경로 (절대 경로 또는 상대 경로)
 * @param notesDir - 노트 디렉토리 경로
 * @param options - 제안 옵션
 * @returns 링크 제안 배열
 */
export async function suggestLinks(
  notePath: string,
  notesDir: string,
  options: SuggestLinksOptions = {}
): Promise<LinkSuggestion[]> {
  const opts: Required<SuggestLinksOptions> = {
    maxSuggestions: options.maxSuggestions ?? 10,
    minConfidence: options.minConfidence ?? 0.3,
    excludeExisting: options.excludeExisting ?? true,
    contextChars: options.contextChars ?? 200,
  };

  // 1. 노트 내용 로드
  const absoluteNotesDir = path.resolve(notesDir);
  const absoluteNotePath = path.isAbsolute(notePath)
    ? notePath
    : path.join(absoluteNotesDir, notePath);
  const relativeNotePath = path.relative(absoluteNotesDir, absoluteNotePath);

  let content: string;
  try {
    content = await fs.readFile(absoluteNotePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read note: ${notePath}`);
  }

  // 2. 노트 정보 로드
  const notes = await loadNoteInfos(notesDir);

  // 3. RAG 서비스 초기화 확인
  const ragService = RAGService.getInstance();
  const useRAG = ragService.isInitialized();

  // 4. 앵커 후보 추출
  const anchors = extractAnchors(content, { notes });

  // 5. 기존 링크 수집 (제외용)
  const existingLinks = opts.excludeExisting ? getExistingWikilinks(content) : [];
  const normalizeExistingTarget = (target: string): string =>
    normalizeNoteTitle(path.basename(target, ".md"));
  const existingTargets = new Set(
    existingLinks.map((l) => normalizeExistingTarget(l.target))
  );

  // 6. 타겟 매처 생성
  const matcher = createTargetMatcher({
    notes,
    notesDir,
    topK: 3,
    minScore: opts.minConfidence,
    useRAG,
  });

  // 7. 각 앵커에 대해 타겟 찾기
  const suggestions: LinkSuggestion[] = [];

  for (const anchor of anchors) {
    // 이미 충분한 제안이 있으면 중단
    if (suggestions.length >= opts.maxSuggestions) {
      break;
    }

    const targets = await matcher.findTargets(anchor, relativeNotePath);

    for (const target of targets) {
      // 이미 존재하는 링크 타겟은 스킵
      const targetTitleKey = normalizeNoteTitle(target.noteTitle);
      const targetPathKey = normalizeNoteTitle(
        path.basename(target.notePath, ".md")
      );
      if (existingTargets.has(targetTitleKey) || existingTargets.has(targetPathKey)) {
        continue;
      }

      // 중복 제안 스킵 (같은 타겟에 대한 이전 제안)
      if (suggestions.some((s) => s.suggestedTarget === target.notePath)) {
        continue;
      }

      // 신뢰도 계산
      const confidence = calculateConfidence(anchor, target);

      if (confidence >= opts.minConfidence) {
        suggestions.push({
          anchor: anchor.text,
          anchorRange: anchor.range,
          suggestedTarget: target.notePath,
          confidence,
          reason: getReasonText(target.matchType, target.noteTitle),
        });

        // 각 앵커당 하나의 제안만 추가
        break;
      }
    }
  }

  // 신뢰도 내림차순 정렬
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions.slice(0, opts.maxSuggestions);
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * 링크 제안 신뢰도 계산
 */
function calculateConfidence(
  anchor: AnchorCandidate,
  target: { score: number; matchType: string }
): number {
  // 기본 점수
  let confidence = target.score;

  // 앵커 타입에 따른 보정
  switch (anchor.type) {
    case "title_match":
      confidence *= 1.2;
      break;
    case "header_match":
      confidence *= 1.1;
      break;
    case "technical_term":
      confidence *= 1.0;
      break;
    case "proper_noun":
      confidence *= 0.95;
      break;
    case "noun_phrase":
      confidence *= 0.9;
      break;
  }

  // 0~1 범위로 클램프
  return Math.min(1.0, Math.max(0.0, confidence));
}

/**
 * 제안 이유 텍스트 생성
 */
function getReasonText(matchType: string, noteTitle: string): string {
  switch (matchType) {
    case "exact_title":
      return `Exact match with note title "${noteTitle}"`;
    case "alias_match":
      return `Matches alias of "${noteTitle}"`;
    case "partial_title":
      return `Partial match with "${noteTitle}"`;
    case "header_match":
      return `Matches header in "${noteTitle}"`;
    case "semantic":
      return `Semantically related to "${noteTitle}"`;
    default:
      return `Related to "${noteTitle}"`;
  }
}

// Note: loadNoteInfos and parseNoteInfo are already exported inline with their definitions
