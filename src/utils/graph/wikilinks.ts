/**
 * 통합 위키링크 파서
 * 마크다운 콘텐츠에서 위키링크를 추출하고 분석
 */

import type { ParsedWikilink } from "./types.js";

/**
 * 위키링크 정규식
 * 형식: [[target#section|alias]]
 * - target: 필수, 링크 대상 노트 이름
 * - #section: 선택, 섹션 링크
 * - |alias: 선택, 표시될 별칭
 */
const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/**
 * 위키링크 상세 파싱
 * 콘텐츠에서 모든 위키링크를 추출하고 상세 정보를 반환
 *
 * @param content 마크다운 콘텐츠
 * @returns 파싱된 위키링크 배열 (위치 정보 포함)
 */
export function parseWikilinks(content: string): ParsedWikilink[] {
  const results: ParsedWikilink[] = [];
  const lines = content.split("\n");

  let currentIndex = 0;
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // 이 줄에서 위키링크 찾기
    let match;
    const lineRegex = new RegExp(WIKILINK_REGEX.source, "g");

    while ((match = lineRegex.exec(line)) !== null) {
      const [raw, target, section, alias] = match;
      const absoluteStart = currentIndex + match.index;

      results.push({
        raw,
        target: target.trim(),
        section: section?.trim(),
        alias: alias?.trim(),
        position: {
          start: absoluteStart,
          end: absoluteStart + raw.length,
          line: lineNum,
        },
      });
    }

    // 다음 줄 시작 인덱스 (줄바꿈 문자 포함)
    currentIndex += line.length + 1;
  }

  return results;
}

/**
 * 고유 위키링크 타겟 추출
 * 기존 extractWikilinks() 함수와 호환되는 간단한 버전
 *
 * @param content 마크다운 콘텐츠
 * @returns 고유 링크 타겟 배열 (중복 제거됨)
 */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  let match;
  const regex = new RegExp(WIKILINK_REGEX.source, "g");

  while ((match = regex.exec(content)) !== null) {
    const target = match[1].trim();
    // 중복 제거
    if (!links.includes(target)) {
      links.push(target);
    }
  }

  return links;
}

/**
 * 위키링크 언급 횟수 계산
 * 중복을 포함한 총 위키링크 수를 반환
 *
 * @param content 마크다운 콘텐츠
 * @returns 총 위키링크 수 (중복 포함)
 */
export function countWikilinkMentions(content: string): number {
  const matches = content.match(new RegExp(WIKILINK_REGEX.source, "g"));
  return matches ? matches.length : 0;
}

/**
 * 특정 타겟에 대한 위키링크 찾기
 *
 * @param content 마크다운 콘텐츠
 * @param targetNote 찾을 노트 이름
 * @returns 해당 노트를 가리키는 위키링크 배열
 */
export function findLinksToNote(
  content: string,
  targetNote: string
): ParsedWikilink[] {
  const allLinks = parseWikilinks(content);
  const normalizedTarget = targetNote.toLowerCase().trim();

  return allLinks.filter(
    (link) => link.target.toLowerCase().trim() === normalizedTarget
  );
}

/**
 * 위키링크 주변 컨텍스트 추출
 *
 * @param content 마크다운 콘텐츠
 * @param link 위키링크 정보
 * @param contextLength 컨텍스트 길이 (앞뒤 각각)
 * @returns 컨텍스트 문자열
 */
export function extractContext(
  content: string,
  link: ParsedWikilink,
  contextLength: number = 50
): string {
  const start = Math.max(0, link.position.start - contextLength);
  const end = Math.min(content.length, link.position.end + contextLength);

  let context = content.slice(start, end);

  // 시작이 잘린 경우 ... 추가
  if (start > 0) {
    context = "..." + context.trimStart();
  }

  // 끝이 잘린 경우 ... 추가
  if (end < content.length) {
    context = context.trimEnd() + "...";
  }

  // 줄바꿈을 공백으로 변환
  return context.replace(/\n+/g, " ").trim();
}

/**
 * 노트 제목 정규화
 * 파일명과 링크 타겟 비교를 위해 정규화
 *
 * @param title 노트 제목 또는 파일명
 * @returns 정규화된 문자열
 */
export function normalizeNoteTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * 두 노트 제목이 같은지 비교
 *
 * @param title1 첫 번째 제목
 * @param title2 두 번째 제목
 * @returns 같으면 true
 */
export function isSameNote(title1: string, title2: string): boolean {
  return normalizeNoteTitle(title1) === normalizeNoteTitle(title2);
}
