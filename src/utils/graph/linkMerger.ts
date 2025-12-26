/**
 * 유사 위키링크 병합 유틸리티
 * 여러 표기법으로 작성된 링크를 표준 표기로 일괄 병합
 */

import fs from "node:fs/promises";
import { expandPath } from "../config.js";
import { collectMarkdownFiles } from "./analyzer.js";
import { invalidateCache } from "./cache.js";
import type { MergeLinkRequest, MergeLinkResult } from "./types.js";

/**
 * 정규식 특수문자 이스케이프
 *
 * @param str 이스케이프할 문자열
 * @returns 이스케이프된 문자열
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 여러 타겟을 매칭하는 위키링크 정규식 생성
 *
 * 위키링크 형식을 고려:
 * - [[target]] - 기본 형식
 * - [[target|alias]] - 별칭 포함
 * - [[target#section]] - 섹션 포함
 * - [[target#section|alias]] - 섹션과 별칭 모두 포함
 *
 * @param targets 매칭할 타겟 문자열 배열
 * @returns 컴파일된 정규식
 */
export function buildReplacementRegex(targets: string[]): RegExp {
  if (targets.length === 0) {
    throw new Error("At least one target is required");
  }

  // 각 타겟을 정규식으로 이스케이프
  const escapedTargets = targets.map(escapeRegExp);

  // OR로 연결된 타겟 패턴
  const targetPattern = escapedTargets.join("|");

  // 위키링크 전체 패턴:
  // \[\[          - 시작 대괄호
  // (target1|target2|...)  - 타겟 캡처 그룹
  // (?:#([^\]|]+))?        - 선택적 섹션 캡처 그룹
  // (?:\|([^\]]+))?        - 선택적 별칭 캡처 그룹
  // \]\]          - 종료 대괄호
  const pattern = `\\[\\[(${targetPattern})(?:#([^\\]|]+))?(?:\\|([^\\]]+))?\\]\\]`;

  return new RegExp(pattern, "g");
}

/**
 * 단일 파일 내 위키링크 치환
 *
 * @param filePath 수정할 파일 경로
 * @param oldTargets 치환 대상 타겟들
 * @param newTarget 새로운 표준 표기
 * @param preserveAsAlias 원래 텍스트를 alias로 보존할지 여부
 * @returns 수정 여부와 치환된 링크 수
 */
export async function replaceLinksInFile(
  filePath: string,
  oldTargets: string[],
  newTarget: string,
  preserveAsAlias: boolean
): Promise<{ updated: boolean; count: number }> {
  // 파일 읽기
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read file: ${(err as Error).message}`);
  }

  // 정규식 생성
  const regex = buildReplacementRegex(oldTargets);

  let count = 0;
  const newContent = content.replace(
    regex,
    (
      match: string,
      originalTarget: string,
      section?: string,
      existingAlias?: string
    ) => {
      count++;

      // 섹션 부분 구성
      const sectionPart = section ? `#${section}` : "";

      // 별칭 결정 로직:
      // 1. 기존 alias가 있으면 그대로 유지
      // 2. 기존 alias가 없고 preserveAsAlias가 true면 원래 target을 alias로
      // 3. 그 외에는 alias 없이
      let aliasPart = "";
      if (existingAlias) {
        // 기존 alias 유지
        aliasPart = `|${existingAlias}`;
      } else if (preserveAsAlias && originalTarget !== newTarget) {
        // 원래 타겟을 alias로 보존 (타겟이 다른 경우에만)
        aliasPart = `|${originalTarget}`;
      }

      return `[[${newTarget}${sectionPart}${aliasPart}]]`;
    }
  );

  // 변경사항이 없으면 업데이트하지 않음
  if (count === 0) {
    return { updated: false, count: 0 };
  }

  // 파일 쓰기
  try {
    await fs.writeFile(filePath, newContent, "utf-8");
  } catch (err) {
    throw new Error(`Failed to write file: ${(err as Error).message}`);
  }

  return { updated: true, count };
}

/**
 * 유사 위키링크 일괄 병합
 *
 * 노트 디렉토리 내 모든 마크다운 파일을 순회하며
 * 지정된 대상 링크들을 새로운 표준 표기로 치환합니다.
 *
 * @param notesDir 노트 디렉토리 경로
 * @param request 병합 요청 정보
 * @returns 병합 결과 통계
 *
 * @example
 * ```typescript
 * const result = await mergeSimilarLinks("~/notes", {
 *   oldTargets: ["구글 웨이모", "Google Waymo", "웨이모"],
 *   newTarget: "Waymo",
 *   preserveAsAlias: true
 * });
 *
 * console.log(`Modified ${result.filesModified} files`);
 * console.log(`Replaced ${result.linksReplaced} links`);
 * ```
 */
export async function mergeSimilarLinks(
  notesDir: string,
  request: MergeLinkRequest
): Promise<MergeLinkResult> {
  const { oldTargets, newTarget, preserveAsAlias } = request;

  // 결과 초기화
  const result: MergeLinkResult = {
    filesModified: 0,
    linksReplaced: 0,
    modifiedFiles: [],
    errors: new Map<string, string>(),
  };

  // 입력 검증
  if (oldTargets.length === 0) {
    return result;
  }

  // 경로 확장
  const expandedDir = expandPath(notesDir);

  // 병합 작업 전 그래프 캐시 무효화
  invalidateCache("graph-stats", expandedDir);

  // 모든 마크다운 파일 수집
  const files = await collectMarkdownFiles(expandedDir);

  // 각 파일에 대해 링크 치환 수행
  for (const filePath of files) {
    try {
      const { updated, count } = await replaceLinksInFile(
        filePath,
        oldTargets,
        newTarget,
        preserveAsAlias
      );

      if (updated) {
        result.filesModified++;
        result.linksReplaced += count;
        result.modifiedFiles.push(filePath);
      }
    } catch (err) {
      result.errors.set(filePath, (err as Error).message);
    }
  }

  // 파일이 수정되었으면 캐시 다시 무효화 (안전을 위해)
  if (result.filesModified > 0) {
    invalidateCache("graph-stats", expandedDir);
  }

  return result;
}

/**
 * 미리보기 모드로 병합 결과 확인
 *
 * 실제로 파일을 수정하지 않고 어떤 변경이 일어날지 미리 확인합니다.
 *
 * @param notesDir 노트 디렉토리 경로
 * @param request 병합 요청 정보
 * @returns 예상 변경 목록
 */
export async function previewMerge(
  notesDir: string,
  request: MergeLinkRequest
): Promise<
  Array<{
    filePath: string;
    matches: Array<{
      original: string;
      replaced: string;
      line: number;
    }>;
  }>
> {
  const { oldTargets, newTarget, preserveAsAlias } = request;
  const results: Array<{
    filePath: string;
    matches: Array<{
      original: string;
      replaced: string;
      line: number;
    }>;
  }> = [];

  if (oldTargets.length === 0) {
    return results;
  }

  const expandedDir = expandPath(notesDir);
  const files = await collectMarkdownFiles(expandedDir);
  const regex = buildReplacementRegex(oldTargets);

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const matches: Array<{
        original: string;
        replaced: string;
        line: number;
      }> = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        const lineRegex = new RegExp(regex.source, "g");

        while ((match = lineRegex.exec(line)) !== null) {
          const [original, originalTarget, section, existingAlias] = match;

          // 치환 결과 계산
          const sectionPart = section ? `#${section}` : "";
          let aliasPart = "";
          if (existingAlias) {
            aliasPart = `|${existingAlias}`;
          } else if (preserveAsAlias && originalTarget !== newTarget) {
            aliasPart = `|${originalTarget}`;
          }

          const replaced = `[[${newTarget}${sectionPart}${aliasPart}]]`;

          matches.push({
            original,
            replaced,
            line: i + 1, // 1-indexed
          });
        }
      }

      if (matches.length > 0) {
        results.push({
          filePath,
          matches,
        });
      }
    } catch {
      // 읽기 실패한 파일은 건너뜀
      continue;
    }
  }

  return results;
}
