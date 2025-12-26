/**
 * 문자열 유사도 계산 알고리즘
 * 유사 위키링크 탐지를 위한 복합 유사도 계산
 */

/**
 * 유사도 점수 결과
 */
export interface SimilarityScore {
  /** 최종 복합 유사도 (0-1) */
  score: number;
  /** Jaro-Winkler 유사도 */
  jaroWinkler: number;
  /** N-gram 유사도 */
  ngram: number;
  /** 토큰 오버랩 유사도 */
  tokenOverlap: number;
}

/**
 * Jaro 유사도 계산
 * 두 문자열 간의 기본 Jaro 거리를 계산
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @returns 0-1 사이의 유사도 점수
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // 매칭 문자 찾기
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // 전치 계산
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Jaro-Winkler 유사도 계산
 * Jaro 유사도에 공통 접두사 보너스를 추가
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @param prefixScale 접두사 스케일 (기본: 0.1)
 * @returns 0-1 사이의 유사도 점수
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  prefixScale: number = 0.1
): number {
  const jaro = jaroSimilarity(s1, s2);

  // 공통 접두사 길이 (최대 4자)
  let prefixLength = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));

  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaro + prefixLength * prefixScale * (1 - jaro);
}

/**
 * N-gram 생성
 *
 * @param str 입력 문자열
 * @param n gram 크기 (기본: 2, bigram)
 * @returns N-gram Set
 */
function generateNgrams(str: string, n: number = 2): Set<string> {
  const ngrams = new Set<string>();
  const normalized = str.toLowerCase().trim();

  if (normalized.length === 0) {
    return ngrams;
  }
  if (normalized.length < n) {
    ngrams.add(normalized);
    return ngrams;
  }

  for (let i = 0; i <= normalized.length - n; i++) {
    ngrams.add(normalized.slice(i, i + n));
  }

  return ngrams;
}

/**
 * N-gram 유사도 계산 (Dice coefficient)
 * 두 문자열의 bigram 집합 간 유사도
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @param n gram 크기 (기본: 2)
 * @returns 0-1 사이의 유사도 점수
 */
export function ngramSimilarity(
  s1: string,
  s2: string,
  n: number = 2
): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const ngrams1 = generateNgrams(s1, n);
  const ngrams2 = generateNgrams(s2, n);

  // 교집합 크기
  let intersection = 0;
  for (const gram of ngrams1) {
    if (ngrams2.has(gram)) {
      intersection++;
    }
  }

  // Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
  return (2 * intersection) / (ngrams1.size + ngrams2.size);
}

/**
 * 문자열을 토큰으로 분리
 * 공백, 특수문자 기준으로 분리하고 한글 조사 제거
 *
 * @param str 입력 문자열
 * @returns 토큰 배열
 */
function tokenize(str: string): string[] {
  // 공백 및 특수문자로 분리
  const tokens = str
    .toLowerCase()
    .split(/[\s\-_.,;:!?'"()[\]{}]+/)
    .filter((t) => t.length > 0);

  // 복합 조사 먼저, 단일 조사 나중에
  const compoundParticles = /(으로|에서|에게|까지|부터|처럼|만큼|보다)$/;
  const singleParticles = /[은는이가을를의에와과로]$/;

  return tokens.map((token) => {
    // 한글로 끝나고 길이가 2보다 크면 복합 조사 제거 시도
    if (/[\uAC00-\uD7A3]$/.test(token) && token.length > 2) {
      const withoutCompound = token.replace(compoundParticles, "");
      if (withoutCompound !== token) return withoutCompound;
    }
    // 한글로 끝나면 단일 조사 제거 시도
    if (/[\uAC00-\uD7A3]$/.test(token) && token.length > 1) {
      return token.replace(singleParticles, "");
    }
    return token;
  });
}

/**
 * 토큰 오버랩 유사도 (Jaccard 유사도)
 * 두 문자열의 토큰 집합 간 유사도
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @returns 0-1 사이의 유사도 점수
 */
export function tokenOverlapSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const tokens1 = new Set(tokenize(s1));
  const tokens2 = new Set(tokenize(s2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // 교집합 크기
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  // 합집합 크기
  const union = new Set([...tokens1, ...tokens2]).size;

  // Jaccard: |A ∩ B| / |A ∪ B|
  return intersection / union;
}

/**
 * 포함 관계 유사도
 * 한 문자열이 다른 문자열에 포함되는지 확인
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @returns 0-1 사이의 유사도 점수
 */
export function containmentSimilarity(s1: string, s2: string): number {
  const n1 = s1.toLowerCase().trim();
  const n2 = s2.toLowerCase().trim();

  if (n1 === n2) return 1;

  // 한쪽이 다른 쪽에 완전히 포함되면 높은 점수
  if (n1.includes(n2)) {
    return n2.length / n1.length;
  }
  if (n2.includes(n1)) {
    return n1.length / n2.length;
  }

  return 0;
}

/**
 * 복합 유사도 계산
 * 여러 알고리즘의 가중 평균으로 최종 유사도 산출
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @returns 유사도 점수 객체
 */
export function calculateSimilarity(s1: string, s2: string): SimilarityScore {
  const jw = jaroWinklerSimilarity(s1, s2);
  const ng = ngramSimilarity(s1, s2);
  const to = tokenOverlapSimilarity(s1, s2);
  const ct = containmentSimilarity(s1, s2);

  // 포함 관계가 강하면 가중치 조정
  let score: number;
  if (ct > 0.5) {
    // 한 문자열이 다른 문자열에 50% 이상 포함되면
    // 포함 관계에 더 높은 가중치
    score = 0.3 * jw + 0.2 * ng + 0.2 * to + 0.3 * ct;
  } else {
    // 기본 가중치: JW 40%, ngram 30%, token 30%
    score = 0.4 * jw + 0.3 * ng + 0.3 * to;
  }

  return {
    score,
    jaroWinkler: jw,
    ngram: ng,
    tokenOverlap: to,
  };
}

/**
 * 두 문자열이 유사한지 판단
 *
 * @param s1 첫 번째 문자열
 * @param s2 두 번째 문자열
 * @param threshold 유사도 임계값 (기본: 0.7)
 * @returns 유사 여부
 */
export function isSimilar(
  s1: string,
  s2: string,
  threshold: number = 0.7
): boolean {
  return calculateSimilarity(s1, s2).score >= threshold;
}

/**
 * 문자열 배열에서 유사한 쌍 찾기
 *
 * @param strings 문자열 배열
 * @param threshold 유사도 임계값 (기본: 0.7)
 * @returns 유사한 쌍 배열 [index1, index2, similarity]
 */
export function findSimilarPairs(
  strings: string[],
  threshold: number = 0.7
): Array<[number, number, SimilarityScore]> {
  const pairs: Array<[number, number, SimilarityScore]> = [];

  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      const similarity = calculateSimilarity(strings[i], strings[j]);
      if (similarity.score >= threshold) {
        pairs.push([i, j, similarity]);
      }
    }
  }

  // 유사도 내림차순 정렬
  return pairs.sort((a, b) => b[2].score - a[2].score);
}
