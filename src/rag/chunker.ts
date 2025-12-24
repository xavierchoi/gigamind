/**
 * Document Chunker for RAG Pipeline
 * 문서를 검색 가능한 청크로 분할하는 모듈
 *
 * Features:
 * - Korean sentence boundary detection (다., 요., 죠., etc.)
 * - Header preservation (## sections stay with content)
 * - Overlap between chunks for context continuity
 * - Frontmatter extraction (YAML)
 */

import matter from "gray-matter";

/**
 * 청크 설정 옵션
 */
export interface ChunkConfig {
  /** 최대 청크 크기 (문자 수). Default: 1000 */
  maxChunkSize: number;
  /** 청크 간 오버랩 크기 (문자 수). Default: 200 */
  overlapSize: number;
  /** 문장 경계 보존 여부. Default: true */
  preserveSentences: boolean;
  /** 헤더와 내용을 함께 유지할지 여부. Default: true */
  preserveHeaders: boolean;
}

/**
 * 청크 메타데이터
 */
export interface ChunkMetadata {
  /** 청크가 헤더를 포함하는지 여부 */
  hasHeader: boolean;
  /** 헤더 레벨 (1-6) */
  headerLevel?: number;
  /** 헤더 텍스트 */
  headerText?: string;
}

/**
 * 문서 청크
 */
export interface Chunk {
  /** 청크 내용 */
  content: string;
  /** 원본 문서에서의 시작 오프셋 */
  startOffset: number;
  /** 원본 문서에서의 끝 오프셋 */
  endOffset: number;
  /** 청크 인덱스 (0-based) */
  index: number;
  /** 청크 메타데이터 */
  metadata: ChunkMetadata;
}

/**
 * 프론트매터 파싱 결과
 */
export interface FrontmatterResult {
  /** 프론트매터 데이터 */
  data: Record<string, unknown>;
  /** 프론트매터를 제외한 본문 */
  content: string;
  /** 프론트매터 종료 위치 (원본 문서 기준) */
  contentStartOffset: number;
}

/**
 * 헤더 정보
 */
interface HeaderInfo {
  /** 헤더 레벨 (1-6) */
  level: number;
  /** 헤더 텍스트 */
  text: string;
  /** 헤더 시작 위치 */
  startOffset: number;
}

/**
 * 섹션 정보 (헤더 + 내용)
 */
interface Section {
  /** 헤더 정보 (섹션에 헤더가 있는 경우) */
  header?: HeaderInfo;
  /** 섹션 내용 */
  content: string;
  /** 섹션 시작 위치 */
  startOffset: number;
  /** 섹션 끝 위치 */
  endOffset: number;
}

/** 기본 청크 설정 */
const DEFAULT_CONFIG: ChunkConfig = {
  maxChunkSize: 1000,
  overlapSize: 200,
  preserveSentences: true,
  preserveHeaders: true,
};

/**
 * 한국어 문장 종결 패턴
 * 다양한 한국어 종결 어미를 포함
 */
const KOREAN_SENTENCE_ENDINGS = [
  // 평서형 종결
  "다.",
  "요.",
  "죠.",
  "네.",
  "군요.",
  "습니다.",
  "니다.",
  "입니다.",
  "ㅂ니다.",
  // 의문형 종결
  "까?",
  "요?",
  "니?",
  "죠?",
  "가요?",
  "나요?",
  // 청유형/명령형
  "자.",
  "세요.",
  "시오.",
  "라.",
  // 감탄형
  "구나.",
  "군.",
  "네!",
  "요!",
];

/**
 * 문장 분리를 위한 정규식 패턴
 * 한국어 및 영어 문장 종결 패턴을 모두 지원
 */
const SENTENCE_SPLIT_REGEX = new RegExp(
  // 한국어 종결 어미 패턴
  `(${KOREAN_SENTENCE_ENDINGS.map((e) => e.replace(/[.?!]/g, "\\$&")).join("|")})` +
    // 영어 문장 종결 패턴 (. ! ?)
    "|([.!?])(?=\\s|$)" +
    // 줄바꿈도 문장 경계로 처리
    "|(\n)",
  "g"
);

/**
 * Document Chunker 클래스
 * 문서를 RAG 파이프라인용 청크로 분할
 */
export class DocumentChunker {
  private config: ChunkConfig;

  /**
   * DocumentChunker 생성자
   * @param config 청크 설정 (부분 옵션 가능)
   */
  constructor(config: Partial<ChunkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 문서를 청크로 분할
   * @param content 문서 내용
   * @returns 청크 배열
   */
  chunk(content: string): Chunk[] {
    // 프론트매터 추출
    const { content: bodyContent, contentStartOffset } =
      this.extractFrontmatter(content);

    if (!bodyContent.trim()) {
      return [];
    }

    // 헤더 보존 모드인 경우 섹션별로 분할
    if (this.config.preserveHeaders) {
      return this.chunkWithHeaders(bodyContent, contentStartOffset);
    }

    // 일반 청킹
    return this.chunkPlainText(bodyContent, contentStartOffset);
  }

  /**
   * 프론트매터 추출
   * @param content 원본 문서 내용
   * @returns 프론트매터 파싱 결과
   */
  extractFrontmatter(content: string): FrontmatterResult {
    try {
      const { data, content: bodyContent } = matter(content);

      // 프론트매터 종료 위치 계산
      let contentStartOffset = 0;
      if (content.trimStart().startsWith("---")) {
        // 프론트매터 끝 위치 찾기 (두 번째 ---)
        const trimmedStart = content.length - content.trimStart().length;
        const firstDelimiter = content.indexOf("---", trimmedStart);
        const secondDelimiter = content.indexOf("---", firstDelimiter + 3);
        if (secondDelimiter !== -1) {
          contentStartOffset = secondDelimiter + 3;
          // 프론트매터 이후 줄바꿈 건너뛰기
          while (
            contentStartOffset < content.length &&
            (content[contentStartOffset] === "\n" ||
              content[contentStartOffset] === "\r")
          ) {
            contentStartOffset++;
          }
        }
      }

      return {
        data,
        content: bodyContent.trim(),
        contentStartOffset,
      };
    } catch {
      // 프론트매터 파싱 실패 시 전체 내용 반환
      return {
        data: {},
        content: content.trim(),
        contentStartOffset: 0,
      };
    }
  }

  /**
   * 헤더를 보존하면서 청킹
   * @param content 본문 내용
   * @param baseOffset 기본 오프셋 (프론트매터 이후 시작 위치)
   * @returns 청크 배열
   */
  private chunkWithHeaders(content: string, baseOffset: number): Chunk[] {
    const sections = this.splitByHeaders(content);
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    for (const section of sections) {
      const sectionChunks = this.chunkSection(
        section,
        baseOffset,
        chunkIndex
      );
      chunks.push(...sectionChunks);
      chunkIndex += sectionChunks.length;
    }

    return chunks;
  }

  /**
   * 헤더 기준으로 섹션 분할
   * @param content 본문 내용
   * @returns 섹션 배열
   */
  private splitByHeaders(content: string): Section[] {
    const sections: Section[] = [];
    const headerMatches: Array<{
      match: RegExpExecArray;
      level: number;
      text: string;
    }> = [];

    // 모든 헤더 찾기
    let match;
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    while ((match = headerRegex.exec(content)) !== null) {
      headerMatches.push({
        match,
        level: match[1].length,
        text: match[2].trim(),
      });
    }

    if (headerMatches.length === 0) {
      // 헤더가 없는 경우 전체를 하나의 섹션으로
      return [
        {
          content,
          startOffset: 0,
          endOffset: content.length,
        },
      ];
    }

    // 첫 헤더 이전 내용이 있는 경우
    if (headerMatches[0].match.index > 0) {
      const preContent = content.slice(0, headerMatches[0].match.index).trim();
      if (preContent) {
        sections.push({
          content: preContent,
          startOffset: 0,
          endOffset: headerMatches[0].match.index,
        });
      }
    }

    // 각 헤더와 그 이후 내용을 섹션으로 분할
    for (let i = 0; i < headerMatches.length; i++) {
      const current = headerMatches[i];
      const next = headerMatches[i + 1];

      const sectionStart = current.match.index;
      const sectionEnd = next ? next.match.index : content.length;
      const sectionContent = content.slice(sectionStart, sectionEnd).trim();

      sections.push({
        header: {
          level: current.level,
          text: current.text,
          startOffset: sectionStart,
        },
        content: sectionContent,
        startOffset: sectionStart,
        endOffset: sectionEnd,
      });
    }

    return sections;
  }

  /**
   * 단일 섹션을 청크로 분할
   * @param section 섹션 정보
   * @param baseOffset 기본 오프셋
   * @param startIndex 시작 청크 인덱스
   * @returns 청크 배열
   */
  private chunkSection(
    section: Section,
    baseOffset: number,
    startIndex: number
  ): Chunk[] {
    const { maxChunkSize, overlapSize } = this.config;

    // 섹션이 maxChunkSize 이하면 그대로 반환
    if (section.content.length <= maxChunkSize) {
      return [
        {
          content: section.content,
          startOffset: baseOffset + section.startOffset,
          endOffset: baseOffset + section.endOffset,
          index: startIndex,
          metadata: {
            hasHeader: !!section.header,
            headerLevel: section.header?.level,
            headerText: section.header?.text,
          },
        },
      ];
    }

    // 큰 섹션은 문장 단위로 분할
    const chunks: Chunk[] = [];
    const sentences = this.splitSentences(section.content);

    let currentChunk = "";
    let currentStart = section.startOffset;
    let chunkIndex = startIndex;

    // 헤더가 있으면 첫 청크에 포함
    const headerPrefix = section.header
      ? section.content.slice(
          0,
          section.content.indexOf("\n") + 1 ||
            section.content.length
        )
      : "";

    for (const sentence of sentences) {
      const potentialChunk = currentChunk + sentence;

      if (potentialChunk.length > maxChunkSize && currentChunk) {
        // 현재 청크 저장
        const chunkContent =
          chunkIndex === startIndex && headerPrefix
            ? currentChunk
            : currentChunk;
        const chunkEnd =
          currentStart + chunkContent.length;

        chunks.push({
          content: chunkContent.trim(),
          startOffset: baseOffset + currentStart,
          endOffset: baseOffset + chunkEnd,
          index: chunkIndex,
          metadata: {
            hasHeader: chunkIndex === startIndex && !!section.header,
            headerLevel:
              chunkIndex === startIndex ? section.header?.level : undefined,
            headerText:
              chunkIndex === startIndex ? section.header?.text : undefined,
          },
        });

        chunkIndex++;

        // 오버랩 적용: 이전 청크의 마지막 부분을 다음 청크 시작에 포함
        const overlapText = this.getOverlapText(currentChunk, overlapSize);
        currentChunk = overlapText + sentence;
        currentStart = chunkEnd - overlapText.length;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // 마지막 청크 저장
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startOffset: baseOffset + currentStart,
        endOffset: baseOffset + section.endOffset,
        index: chunkIndex,
        metadata: {
          hasHeader: chunkIndex === startIndex && !!section.header,
          headerLevel:
            chunkIndex === startIndex ? section.header?.level : undefined,
          headerText:
            chunkIndex === startIndex ? section.header?.text : undefined,
        },
      });
    }

    return chunks;
  }

  /**
   * 일반 텍스트 청킹 (헤더 보존 없이)
   * @param content 본문 내용
   * @param baseOffset 기본 오프셋
   * @returns 청크 배열
   */
  private chunkPlainText(content: string, baseOffset: number): Chunk[] {
    const { maxChunkSize, overlapSize, preserveSentences } = this.config;
    const chunks: Chunk[] = [];

    if (preserveSentences) {
      const sentences = this.splitSentences(content);
      let currentChunk = "";
      let currentStart = 0;
      let chunkIndex = 0;

      for (const sentence of sentences) {
        const potentialChunk = currentChunk + sentence;

        if (potentialChunk.length > maxChunkSize && currentChunk) {
          const chunkEnd = currentStart + currentChunk.length;

          chunks.push({
            content: currentChunk.trim(),
            startOffset: baseOffset + currentStart,
            endOffset: baseOffset + chunkEnd,
            index: chunkIndex,
            metadata: { hasHeader: false },
          });

          chunkIndex++;

          const overlapText = this.getOverlapText(currentChunk, overlapSize);
          currentChunk = overlapText + sentence;
          currentStart = chunkEnd - overlapText.length;
        } else {
          currentChunk = potentialChunk;
        }
      }

      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          startOffset: baseOffset + currentStart,
          endOffset: baseOffset + content.length,
          index: chunkIndex,
          metadata: { hasHeader: false },
        });
      }
    } else {
      // 문자 수 기반 분할
      let position = 0;
      let chunkIndex = 0;

      while (position < content.length) {
        const end = Math.min(position + maxChunkSize, content.length);
        const chunkContent = content.slice(position, end);

        chunks.push({
          content: chunkContent.trim(),
          startOffset: baseOffset + position,
          endOffset: baseOffset + end,
          index: chunkIndex,
          metadata: { hasHeader: false },
        });

        chunkIndex++;
        position = end - overlapSize;
        if (position < 0) position = 0;
        if (end >= content.length) break;
      }
    }

    return chunks;
  }

  /**
   * 텍스트를 문장 단위로 분할
   * 한국어 및 영어 문장 종결 패턴을 모두 지원
   * @param text 분할할 텍스트
   * @returns 문장 배열
   */
  private splitSentences(text: string): string[] {
    const sentences: string[] = [];
    let lastIndex = 0;

    // 문장 종결 패턴 매칭
    const matches = text.matchAll(SENTENCE_SPLIT_REGEX);

    for (const match of matches) {
      if (match.index !== undefined) {
        const endIndex = match.index + match[0].length;
        const sentence = text.slice(lastIndex, endIndex);

        if (sentence.trim()) {
          sentences.push(sentence);
        }

        lastIndex = endIndex;
      }
    }

    // 마지막 남은 텍스트
    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex);
      if (remaining.trim()) {
        sentences.push(remaining);
      }
    }

    // 문장이 하나도 없으면 전체 텍스트를 하나의 문장으로
    if (sentences.length === 0 && text.trim()) {
      return [text];
    }

    return sentences;
  }

  /**
   * 오버랩 텍스트 추출
   * @param text 원본 텍스트
   * @param overlapSize 오버랩 크기
   * @returns 오버랩 텍스트
   */
  private getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) {
      return text;
    }

    // 오버랩 영역에서 문장 경계 찾기
    const overlapStart = text.length - overlapSize;
    const overlapRegion = text.slice(overlapStart);

    // 문장 시작점 찾기 (. ! ? 다음 공백)
    const sentenceStartMatch = overlapRegion.match(/[.!?다요죠]\s+/);
    if (sentenceStartMatch && sentenceStartMatch.index !== undefined) {
      const adjustedStart =
        overlapStart + sentenceStartMatch.index + sentenceStartMatch[0].length;
      return text.slice(adjustedStart);
    }

    return overlapRegion;
  }
}
