/**
 * Types for LLM-based Smart Linking
 * Phase 5.1: Contextual wikilink generation
 */

/**
 * A candidate link detected by text matching
 */
export interface LinkCandidate {
  /** The matched text in the content (e.g., "Claude") */
  matchedText: string;
  /** Target note title */
  targetNoteTitle: string;
  /** Target note ID (filename without .md) */
  targetNoteId: string;
  /** Surrounding context (50 chars before and after) */
  context: string;
  /** Position in the original content */
  position: number;
}

/**
 * Result of LLM evaluation for a link candidate
 */
export interface LinkEvaluation {
  /** The original candidate */
  candidate: LinkCandidate;
  /** Whether the link should be created */
  shouldLink: boolean;
  /** Reason for the decision */
  reason: string;
  /** If a more specific note is suggested */
  suggestedTarget?: string;
}

/**
 * Configuration options for SmartLinker
 */
export interface SmartLinkerOptions {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use (default: claude-haiku-4-5-20251001) */
  model?: string;
  /** Number of candidates to evaluate in a single API call (default: 20) */
  batchSize?: number;
  /** Maximum number of concurrent batch evaluations (default: 3) */
  concurrency?: number;
}

/**
 * Statistics for smart linking operations
 */
export interface SmartLinkingStats {
  /** Total number of candidates evaluated */
  totalCandidates: number;
  /** Number of links approved */
  approved: number;
  /** Number of links rejected */
  rejected: number;
  /** Number of links redirected to a different target */
  redirected: number;
}
