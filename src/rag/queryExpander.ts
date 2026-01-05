/**
 * Query Expander for RAG System
 *
 * Improves search recall by:
 * 1. Extracting keywords from queries
 * 2. Expanding with synonyms and related terms
 * 3. Generating query variants
 */

/**
 * Result of query expansion
 */
export interface ExpandedQuery {
  /** Original query */
  original: string;
  /** Generated query variants (including original) */
  variants: string[];
  /** Extracted and expanded keywords */
  keywords: string[];
}

/**
 * Configuration for query expansion
 */
export interface QueryExpansionConfig {
  /** Enable query expansion. Default: true */
  enabled: boolean;
  /** Maximum number of query variants to generate. Default: 3 */
  maxVariants: number;
  /** Maximum number of expansion keywords to include. Default: 8 */
  maxKeywords: number;
  /** Use LLM for expansion (not implemented yet). Default: false */
  useLLM: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_EXPANSION_CONFIG: QueryExpansionConfig = {
  enabled: true,
  maxVariants: 3,
  maxKeywords: 8,  // Allows both phrase expansions and key synonyms
  useLLM: false,
};

/**
 * Synonym and related term mappings
 * Key: term to match (lowercase)
 * Value: array of related terms to add
 */
const SYNONYM_MAP: Record<string, string[]> = {
  // Transportation / Mobility
  자율주행차: ["로보택시", "테슬라", "웨이모", "robotaxi", "self-driving", "무인차"],
  자율주행: ["로보택시", "테슬라", "웨이모", "robotaxi", "self-driving"],
  로보택시: ["자율주행", "테슬라", "웨이모", "robotaxi", "무인택시"],
  택시: ["로보택시", "우버", "리프트", "uber", "lyft"],
  무인택시: ["로보택시", "자율주행", "테슬라", "웨이모"],
  robotaxi: ["로보택시", "자율주행", "tesla", "waymo"],

  // Stores / Shopping
  마트: ["트레이더조스", "홀푸드", "grocery", "supermarket", "코스트코"],
  "미국 마트": ["트레이더조스", "홀푸드", "grocery", "Trader Joe's", "Whole Foods"],
  grocery: ["마트", "트레이더조스", "홀푸드", "supermarket"],
  트레이더조스: ["Trader Joe's", "마트", "grocery"],
  "Trader Joe's": ["트레이더조스", "마트", "grocery"],
  홀푸드: ["Whole Foods", "마트", "organic"],
  "Whole Foods": ["홀푸드", "마트", "organic"],

  // Tech companies
  테슬라: ["Tesla", "로보택시", "자율주행", "전기차"],
  Tesla: ["테슬라", "robotaxi", "self-driving", "EV"],
  웨이모: ["Waymo", "구글", "자율주행", "로보택시"],
  Waymo: ["웨이모", "Google", "self-driving", "robotaxi"],
  앤트로픽: ["Anthropic", "클로드", "AI"],
  Anthropic: ["앤트로픽", "Claude", "AI"],

  // AI / ML
  AI: ["인공지능", "머신러닝", "딥러닝", "artificial intelligence"],
  인공지능: ["AI", "머신러닝", "딥러닝", "artificial intelligence"],
  llm: ["대규모 언어 모델", "GPT", "Claude", "language model"],
  "언어 모델": ["LLM", "GPT", "Claude", "transformer"],

  // Events / Meetups
  밋업: ["meetup", "모임", "행사", "이벤트", "커뮤니티"],
  meetup: ["밋업", "모임", "행사", "event", "community"],
  행사: ["이벤트", "밋업", "모임", "event"],
  컨퍼런스: ["conference", "행사", "세미나"],

  // Development
  개발자: ["developer", "프로그래머", "엔지니어", "코더"],
  developer: ["개발자", "programmer", "engineer", "coder"],
  코딩: ["프로그래밍", "개발", "coding", "programming"],

  // Locations
  샌프란시스코: ["SF", "San Francisco", "베이 에어리어"],
  SF: ["샌프란시스코", "San Francisco", "Bay Area"],
  "San Francisco": ["샌프란시스코", "SF", "Bay Area"],
  실리콘밸리: ["Silicon Valley", "베이 에어리어", "SF"],

  // Food
  스테이크: ["steak", "소고기", "beef"],
  라면: ["ramen", "컵라면", "noodles"],
  김밥: ["kimbap", "gimbap", "korean food"],

  // Research / Academia
  논문: ["paper", "연구", "research", "학술"],
  연구: ["research", "논문", "study"],
  피드백: ["feedback", "리뷰", "review", "코멘트"],

  // Medical
  병원: ["hospital", "의료", "medical", "healthcare"],
  의료: ["medical", "병원", "healthcare", "health"],
  "X-ray": ["엑스레이", "방사선", "영상의학"],
  CT: ["씨티", "computed tomography", "영상의학"],
  MRI: ["자기공명영상", "영상의학"],
};

/**
 * Phrase patterns that should be expanded as a unit
 * These patterns match common query phrases and expand them
 */
const PHRASE_PATTERNS: Array<{ pattern: RegExp; expansions: string[] }> = [
  {
    // Match: "자율주행차 탔어", "자율주행택시 타본"
    pattern: /자율주행(차|택시)?.*(타|탔)/,
    expansions: ["로보택시 체험", "테슬라 로보택시", "웨이모"],
  },
  {
    pattern: /미국.*마트|마트.*미국/,
    expansions: ["Trader Joe's", "트레이더조스", "홀푸드"],
  },
  {
    pattern: /개발자.*밋업|밋업.*개발자|커뮤니티.*밋업/,
    expansions: ["개발자 모임", "meetup", "커뮤니티 행사"],
  },
  {
    pattern: /출장.*쇼핑|쇼핑.*출장/,
    expansions: ["마트", "grocery", "쇼핑 경험"],
  },
  {
    pattern: /AI.*에이전트|에이전트.*AI/,
    expansions: ["agent", "인공지능 에이전트", "AI agent"],
  },
  {
    pattern: /영상.*시스템|의료.*영상/,
    expansions: ["PACS", "X-ray", "CT", "MRI", "디지털 영상"],
  },
];

/**
 * Extract keywords from a query
 * Filters out stop words and short tokens
 */
function extractKeywords(query: string): string[] {
  // Korean and English stop words
  const stopWords = new Set([
    // Korean
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "로",
    "으로",
    "에서",
    "와",
    "과",
    "도",
    "은",
    "는",
    "이나",
    "거나",
    "하고",
    "에게",
    "한테",
    "께",
    "보다",
    "처럼",
    "같이",
    "만큼",
    "이랑",
    "랑",
    "하면",
    "으면",
    "면",
    "어서",
    "아서",
    "니까",
    "므로",
    "는데",
    "지만",
    "어도",
    "아도",
    "여도",
    "야",
    "이야",
    "거든",
    "더니",
    "다가",
    "그",
    "저",
    "이것",
    "저것",
    "그것",
    "누구",
    "무엇",
    "어디",
    "언제",
    "어떻게",
    "왜",
    "뭐",
    "뭘",
    "어떤",
    "있어",
    "없어",
    "했어",
    "있는",
    "없는",
    "하는",
    "된",
    "할",
    "수",
    "것",
    "거",
    "등",
    "중",
    "때",
    "년",
    "월",
    "일",
    "적",
    // English
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "must",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "because",
    "as",
    "until",
    "while",
    "of",
    "at",
    "by",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "once",
    "i",
    "me",
    "my",
    "myself",
    "we",
    "our",
    "ours",
    "ourselves",
    "you",
    "your",
    "yours",
    "yourself",
    "he",
    "him",
    "his",
    "himself",
    "she",
    "her",
    "hers",
    "herself",
    "it",
    "its",
    "itself",
    "they",
    "them",
    "their",
    "theirs",
    "themselves",
    "what",
    "which",
    "who",
    "whom",
    "this",
    "that",
    "these",
    "those",
    "am",
    "been",
  ]);

  // Tokenize: split by whitespace and punctuation
  const tokens = query
    .toLowerCase()
    .split(/[\s,.?!;:'"()[\]{}]+/)
    .filter((t) => t.length > 1);

  // Filter stop words
  return tokens.filter((t) => !stopWords.has(t));
}

/**
 * Find synonyms and related terms for a keyword
 */
function findSynonyms(keyword: string): string[] {
  const lowerKeyword = keyword.toLowerCase();
  const synonyms: string[] = [];

  // Direct lookup
  if (SYNONYM_MAP[lowerKeyword]) {
    synonyms.push(...SYNONYM_MAP[lowerKeyword]);
  }

  // Check if keyword is part of any synonym entry
  for (const [term, related] of Object.entries(SYNONYM_MAP)) {
    if (term.toLowerCase().includes(lowerKeyword) || lowerKeyword.includes(term.toLowerCase())) {
      synonyms.push(term, ...related);
    }
  }

  // Deduplicate
  return [...new Set(synonyms)].filter((s) => s.toLowerCase() !== lowerKeyword);
}

/**
 * Check for phrase patterns and get expansions
 */
function matchPhrasePatterns(query: string): string[] {
  const expansions: string[] = [];

  for (const { pattern, expansions: phraseExpansions } of PHRASE_PATTERNS) {
    if (pattern.test(query)) {
      expansions.push(...phraseExpansions);
    }
  }

  return [...new Set(expansions)];
}

/**
 * Generate query variants by incorporating expanded keywords
 */
function generateVariants(
  original: string,
  keywords: string[],
  expandedTerms: string[],
  maxVariants: number
): string[] {
  const variants: string[] = [original];

  if (expandedTerms.length === 0) {
    return variants;
  }

  // Strategy 1: Append key expansion terms to original query
  // Pick most relevant expansions (limit to avoid too many)
  const topExpansions = expandedTerms.slice(0, 3);
  if (topExpansions.length > 0) {
    variants.push(`${original} ${topExpansions.join(" ")}`);
  }

  // Strategy 2: Create focused queries with specific expansions
  for (const term of topExpansions.slice(0, maxVariants - variants.length)) {
    // Only add if significantly different
    if (!original.toLowerCase().includes(term.toLowerCase())) {
      variants.push(`${original} ${term}`);
    }
  }

  // Limit to maxVariants
  return variants.slice(0, maxVariants);
}

/**
 * Main query expansion function
 *
 * Takes a user query and returns an expanded version with:
 * - Original query
 * - Generated variants with synonyms/related terms
 * - Extracted and expanded keywords
 */
export async function expandQuery(
  query: string,
  config: Partial<QueryExpansionConfig> = {}
): Promise<ExpandedQuery> {
  const cfg = { ...DEFAULT_EXPANSION_CONFIG, ...config };

  // If disabled, return original only
  if (!cfg.enabled) {
    return {
      original: query,
      variants: [query],
      keywords: extractKeywords(query),
    };
  }

  // Extract keywords
  const keywords = extractKeywords(query);

  // Check phrase patterns first (more specific, higher priority)
  const phraseExpansions = matchPhrasePatterns(query);

  // Then find synonyms for each keyword
  const synonymExpansions: string[] = [];
  for (const keyword of keywords) {
    const synonyms = findSynonyms(keyword);
    synonymExpansions.push(...synonyms);
  }

  // Combine: phrase expansions first (prioritized), then synonyms
  const allExpansions: string[] = [...phraseExpansions, ...synonymExpansions];

  // Deduplicate expansions
  const uniqueExpansions = [...new Set(allExpansions)];

  // Limit expansion keywords to maxKeywords for performance
  // Prioritize phrase expansions (more specific) over general synonyms
  const limitedExpansions = uniqueExpansions.slice(0, cfg.maxKeywords);

  // Variants are no longer used in retrieval (keywords are used instead)
  // Just return original query to avoid unnecessary overhead
  const variants = [query];

  // Combine original keywords with limited expansions for the keyword list
  const expandedKeywords = [...new Set([...keywords, ...limitedExpansions])];

  return {
    original: query,
    variants,
    keywords: expandedKeywords,
  };
}

/**
 * Create a QueryExpander class for stateful usage
 */
export class QueryExpander {
  private config: QueryExpansionConfig;

  constructor(config: Partial<QueryExpansionConfig> = {}) {
    this.config = { ...DEFAULT_EXPANSION_CONFIG, ...config };
  }

  /**
   * Expand a query with synonyms and related terms
   * @param query - The query to expand
   * @param configOverride - Optional config to override instance config
   */
  async expand(query: string, configOverride?: Partial<QueryExpansionConfig>): Promise<ExpandedQuery> {
    const mergedConfig = configOverride
      ? { ...this.config, ...configOverride }
      : this.config;
    return expandQuery(query, mergedConfig);
  }

  /**
   * Get all unique search terms from an expanded query
   * Useful for keyword search augmentation
   */
  getSearchTerms(expanded: ExpandedQuery): string[] {
    const terms = new Set<string>();

    // Add all keywords
    for (const keyword of expanded.keywords) {
      terms.add(keyword.toLowerCase());
    }

    // Extract terms from variants
    for (const variant of expanded.variants) {
      for (const word of variant.toLowerCase().split(/\s+/)) {
        if (word.length > 2) {
          terms.add(word);
        }
      }
    }

    return Array.from(terms);
  }
}
