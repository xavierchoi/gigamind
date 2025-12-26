/**
 * Concept Extraction Utility
 * Extracts potential wikilink candidates from text
 *
 * Used by note-agent to identify concepts that should become [[wikilinks]]
 */

export interface ExtractedConcepts {
  /** Proper nouns: names, companies, products, places */
  properNouns: string[];
  /** Technical terms: AI, ML, RAG, API, etc. */
  technicalTerms: string[];
  /** Keywords appearing 2+ times */
  repeatedKeywords: string[];
}

// Common words to exclude (Korean)
const EXCLUDED_WORDS_KO = new Set([
  '것', '수', '등', '때', '곳', '중', '위', '후', '전', '내', '외',
  '좋은', '많은', '큰', '작은', '새로운', '다른', '같은', '모든',
  '그', '이', '저', '그것', '이것', '저것', '여기', '거기', '저기',
  '나', '너', '우리', '그들', '그녀', '그가',
  '하다', '되다', '있다', '없다', '가다', '오다', '보다', '알다',
  '때문', '위해', '통해', '대해', '따라', '관해',
]);

// Common words to exclude (English)
const EXCLUDED_WORDS_EN = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
]);

// Proper noun patterns
const PROPER_NOUN_PATTERNS = [
  // English proper nouns (capitalized words, possibly multi-word)
  /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b/g,
  // Korean names (2-4 syllables, common surname patterns)
  /(?:김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|전|홍|고|문|양|손|배|백|허|유|남|심|노|하|곽|성|차|주|우|구|민|진|지|채|원|천|방|공|현|함|변|염|석|선|설|길|연|위|추|엄|나|표|명|기|반|왕|금|옥|육|인|맹|탁|국|여|어|경|편|제)[가-힣]{1,3}/g,
];

// Technical term patterns
const TECH_TERM_PATTERNS = [
  // Common acronyms
  /\b(?:AI|ML|DL|NLP|LLM|GPT|RAG|API|SDK|CLI|GUI|UI|UX|DB|SQL|NoSQL|CSS|HTML|JS|TS|HTTP|HTTPS|REST|GraphQL|JSON|XML|YAML|AWS|GCP|Azure|K8s|Docker|Git|CI|CD|TDD|BDD|OOP|FP|SOLID|DRY|KISS|YAGNI|MVP|MVC|MVVM|SaaS|PaaS|IaaS|B2B|B2C|ROI|KPI|OKR|CEO|CTO|CFO|COO|VP|PM|PO|QA|DevOps|MLOps|DataOps|ETL|ELT)\b/gi,
  // Technology names (camelCase or PascalCase)
  /\b(?:React|Vue|Angular|Next|Nuxt|Svelte|Node|Deno|Bun|Python|JavaScript|TypeScript|Rust|Go|Java|Kotlin|Swift|Ruby|PHP|Scala|Elixir|Haskell|Clojure)\b/g,
  // Korean tech terms
  /(?:머신러닝|딥러닝|인공지능|자연어처리|컴퓨터비전|강화학습|신경망|트랜스포머|임베딩|벡터|토큰|프롬프트|파인튜닝|챗봇|에이전트)/g,
];

/**
 * Check if a word should be excluded
 */
function isExcluded(word: string): boolean {
  const lower = word.toLowerCase();
  return EXCLUDED_WORDS_EN.has(lower) || EXCLUDED_WORDS_KO.has(word);
}

/**
 * Extract proper nouns from text
 */
function extractProperNouns(text: string): string[] {
  const results = new Set<string>();

  for (const pattern of PROPER_NOUN_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const trimmed = match.trim();
      // Filter out single common words and excluded words
      if (trimmed.length >= 2 && !isExcluded(trimmed)) {
        results.add(trimmed);
      }
    }
  }

  return Array.from(results);
}

/**
 * Extract technical terms from text
 */
function extractTechnicalTerms(text: string): string[] {
  const results = new Set<string>();

  for (const pattern of TECH_TERM_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      results.add(match.trim());
    }
  }

  return Array.from(results);
}

/**
 * Find keywords that appear 2+ times
 */
function findRepeatedKeywords(text: string, minOccurrences = 2): string[] {
  // Split into words, handling both Korean and English
  const words = text.split(/[\s,.;:!?()[\]{}'"<>\/\\]+/);
  const wordCount = new Map<string, number>();

  for (const word of words) {
    // Clean the word
    const clean = word.replace(/[^\w가-힣-]/g, '').trim();

    // Skip short words and excluded words
    if (clean.length < 2 || isExcluded(clean)) {
      continue;
    }

    // Use lowercase for English, original for Korean
    const key = /[가-힣]/.test(clean) ? clean : clean.toLowerCase();
    wordCount.set(key, (wordCount.get(key) || 0) + 1);
  }

  // Return words appearing minOccurrences+ times, sorted by frequency
  return Array.from(wordCount.entries())
    .filter(([_, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/**
 * Extract all concepts from text
 */
export function extractConcepts(text: string): ExtractedConcepts {
  return {
    properNouns: extractProperNouns(text),
    technicalTerms: extractTechnicalTerms(text),
    repeatedKeywords: findRepeatedKeywords(text),
  };
}

/**
 * Suggest wikilink candidates from text
 * Returns deduplicated list of potential wikilink targets
 */
export function suggestWikilinks(text: string, maxSuggestions = 20): string[] {
  const concepts = extractConcepts(text);

  // Combine all concepts, prioritizing proper nouns and tech terms
  const allConcepts = [
    ...concepts.properNouns,
    ...concepts.technicalTerms,
    ...concepts.repeatedKeywords.slice(0, 5), // Limit repeated keywords
  ];

  // Deduplicate (case-insensitive for English)
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const concept of allConcepts) {
    const key = concept.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(concept);
    }
  }

  return unique.slice(0, maxSuggestions);
}

/**
 * Apply wikilinks to text content
 * Wraps detected concepts in [[wikilink]] syntax
 */
export function applyWikilinks(
  text: string,
  existingNotes: string[] = [],
  options: { maxLinks?: number; linkRepeats?: boolean } = {}
): string {
  const { maxLinks = 30, linkRepeats = false } = options;

  const suggestions = suggestWikilinks(text);
  const existingNotesLower = new Set(existingNotes.map(n => n.toLowerCase()));

  let result = text;
  let linkCount = 0;
  const linked = new Set<string>();

  for (const concept of suggestions) {
    if (linkCount >= maxLinks) break;

    const conceptLower = concept.toLowerCase();

    // Skip if already linked (unless linkRepeats is true)
    if (!linkRepeats && linked.has(conceptLower)) continue;

    // Create regex to find the concept (case-insensitive for English)
    const isKorean = /[가-힣]/.test(concept);
    const escapedConcept = concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `(?<!\\[\\[)\\b${escapedConcept}\\b(?!\\]\\])`,
      isKorean ? 'g' : 'gi'
    );

    // Replace first occurrence (or all if linkRepeats)
    if (linkRepeats) {
      const matches = result.match(pattern);
      if (matches && matches.length > 0) {
        result = result.replace(pattern, `[[${concept}]]`);
        linkCount += matches.length;
        linked.add(conceptLower);
      }
    } else {
      const replacement = result.replace(pattern, (match) => {
        if (linked.has(conceptLower)) return match;
        linked.add(conceptLower);
        linkCount++;
        return `[[${match}]]`;
      });
      if (replacement !== result) {
        result = replacement;
      }
    }
  }

  return result;
}

/**
 * Extract wikilinks that were added to text
 * Returns array of link targets for use in frontmatter 'related' field
 */
export function extractAddedWikilinks(text: string): string[] {
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const links = new Set<string>();

  let match;
  while ((match = pattern.exec(text)) !== null) {
    links.add(match[1].trim());
  }

  return Array.from(links);
}
