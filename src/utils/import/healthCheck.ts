/**
 * Import Health Check System
 * Phase 5.3: Post-import graph health analysis and anomaly detection
 */

import { analyzeNoteGraph } from "../graph/analyzer.js";
import type { NoteGraphStats, DanglingLink, NoteMetadata } from "../graph/types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Health check thresholds for anomaly detection
 */
export const HEALTH_THRESHOLDS = {
  // Hub node concentration warning thresholds
  HUB_CONCENTRATION_WARNING: 0.20,   // 20% - single note has too many backlinks
  HUB_CONCENTRATION_CRITICAL: 0.50,  // 50% - critical hub concentration

  // Isolated notes (no backlinks) thresholds
  ISOLATED_NOTES_WARNING: 0.50,      // 50% of notes have no backlinks
  ISOLATED_NOTES_CRITICAL: 0.80,     // 80% critical

  // No outlinks thresholds
  NO_OUTLINKS_WARNING: 0.30,         // 30% of notes have no outgoing links
  NO_OUTLINKS_CRITICAL: 0.60,        // 60% critical

  // Orphan notes (no in/out links at all) thresholds
  ORPHAN_NOTES_WARNING: 0.10,        // 10%
  ORPHAN_NOTES_CRITICAL: 0.30,       // 30% critical

  // Suspicious auto-link detection
  SUSPICIOUS_AUTO_LINK_COUNT: 10,    // Same title linked >10 times is suspicious

  // Health score weights
  WEIGHTS: {
    CONNECTIVITY: 30,      // Backlinks/outlinks distribution
    ORPHANS: 25,          // Orphan note penalty
    HUB_CONCENTRATION: 25, // Hub node penalty
    DANGLING_LINKS: 20,   // Unresolved links penalty
  },
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Hub node with high backlink concentration
 */
export interface HubNode {
  /** Note ID */
  noteId: string;
  /** Note title */
  title: string;
  /** File path */
  path: string;
  /** Number of backlinks pointing to this note */
  backlinkCount: number;
  /** Percentage of total backlinks (0-1) */
  percentage: number;
}

/**
 * Graph connectivity metrics
 */
export interface GraphMetrics {
  /** Average backlinks per note (target: 2-5) */
  avgBacklinksPerNote: number;
  /** Maximum backlinks on any single note */
  maxBacklinksPerNote: number;
  /** Note title with max backlinks */
  maxBacklinksNoteTitle: string;
  /** Number of notes with no backlinks */
  notesWithNoBacklinks: number;
  /** Percentage of notes with no backlinks (0-1) */
  noBacklinksPercentage: number;
  /** Number of notes with no outgoing links */
  notesWithNoOutlinks: number;
  /** Percentage of notes with no outlinks (0-1) */
  noOutlinksPercentage: number;
  /** Number of completely isolated notes (no in/out links) */
  orphanNotes: number;
  /** Percentage of orphan notes (0-1) */
  orphanPercentage: number;
  /** Graph density (links per note) */
  graphDensity: number;
}

/**
 * Detected anomalies in the graph
 */
export interface GraphAnomalies {
  /** Notes with >20% backlink concentration */
  hubNodes: HubNode[];
  /** Titles that were auto-linked >10 times (possible false positives) */
  suspiciousAutoLinks: string[];
}

/**
 * Comprehensive import health report
 */
export interface ImportHealthReport {
  // Basic statistics
  /** Total number of notes */
  totalNotes: number;
  /** Total number of wikilinks found */
  totalWikilinks: number;
  /** Number of successfully resolved links */
  resolvedLinks: number;
  /** Percentage of resolved links (0-1) */
  resolvedPercentage: number;
  /** Dangling links (unresolved) */
  danglingLinks: DanglingLink[];
  /** Number of dangling links */
  danglingCount: number;

  // Graph health metrics
  graphMetrics: GraphMetrics;

  // Anomaly detection
  anomalies: GraphAnomalies;

  // Recommendations
  recommendations: string[];

  // Overall health score (0-100)
  healthScore: number;

  // Health status
  status: "healthy" | "warning" | "critical";
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Analyze import health based on graph statistics
 * @param notesDir - Directory containing imported notes
 * @returns Comprehensive health report
 */
export async function analyzeImportHealth(
  notesDir: string
): Promise<ImportHealthReport> {
  // Get graph statistics using existing analyzer
  let graphStats: NoteGraphStats;
  try {
    graphStats = await analyzeNoteGraph(notesDir, {
      includeContext: false,
      useCache: false, // Fresh analysis after import
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to analyze note graph for health check in "${notesDir}": ${message}`);
  }

  // Calculate metrics
  const graphMetrics = calculateGraphMetrics(graphStats);
  const anomalies = detectAnomalies(graphStats);
  const recommendations = generateRecommendations(graphStats, graphMetrics, anomalies);
  const healthScore = calculateHealthScore(graphMetrics, anomalies, graphStats);

  // Determine status
  let status: ImportHealthReport["status"] = "healthy";
  if (healthScore < 50) {
    status = "critical";
  } else if (healthScore < 75) {
    status = "warning";
  }

  return {
    totalNotes: graphStats.noteCount,
    totalWikilinks: graphStats.totalMentions,
    resolvedLinks: graphStats.uniqueConnections,
    resolvedPercentage: graphStats.totalMentions > 0
      ? graphStats.uniqueConnections / graphStats.totalMentions
      : 1,
    danglingLinks: graphStats.danglingLinks,
    danglingCount: graphStats.danglingLinks.length,
    graphMetrics,
    anomalies,
    recommendations,
    healthScore,
    status,
  };
}

/**
 * Calculate graph connectivity metrics
 */
function calculateGraphMetrics(stats: NoteGraphStats): GraphMetrics {
  const { noteCount, backlinks, forwardLinks, orphanNotes } = stats;

  if (noteCount === 0) {
    return {
      avgBacklinksPerNote: 0,
      maxBacklinksPerNote: 0,
      maxBacklinksNoteTitle: "",
      notesWithNoBacklinks: 0,
      noBacklinksPercentage: 0,
      notesWithNoOutlinks: 0,
      noOutlinksPercentage: 0,
      orphanNotes: 0,
      orphanPercentage: 0,
      graphDensity: 0,
    };
  }

  // Calculate backlink statistics
  let totalBacklinks = 0;
  let maxBacklinks = 0;
  let maxBacklinksTitle = "";
  const notesWithBacklinks = new Set<string>();

  for (const [noteTitle, entries] of backlinks) {
    const count = entries.length;
    totalBacklinks += count;
    notesWithBacklinks.add(noteTitle);

    if (count > maxBacklinks) {
      maxBacklinks = count;
      maxBacklinksTitle = noteTitle;
    }
  }

  // Calculate outlink statistics
  let notesWithOutlinks = 0;
  for (const [, targets] of forwardLinks) {
    if (targets.length > 0) {
      notesWithOutlinks++;
    }
  }

  const notesWithNoBacklinks = noteCount - notesWithBacklinks.size;
  const notesWithNoOutlinks = noteCount - notesWithOutlinks;

  return {
    avgBacklinksPerNote: totalBacklinks / noteCount,
    maxBacklinksPerNote: maxBacklinks,
    maxBacklinksNoteTitle: maxBacklinksTitle,
    notesWithNoBacklinks,
    noBacklinksPercentage: notesWithNoBacklinks / noteCount,
    notesWithNoOutlinks,
    noOutlinksPercentage: notesWithNoOutlinks / noteCount,
    orphanNotes: orphanNotes.length,
    orphanPercentage: orphanNotes.length / noteCount,
    graphDensity: stats.uniqueConnections / noteCount,
  };
}

/**
 * Detect anomalies in the graph
 */
function detectAnomalies(
  stats: NoteGraphStats
): GraphAnomalies {
  const hubNodes: HubNode[] = [];
  const suspiciousAutoLinks: string[] = [];

  // Calculate total backlinks and detect hub nodes in a single pass
  let totalBacklinks = 0;
  const potentialHubs: Array<{ noteTitle: string; count: number }> = [];

  for (const [noteTitle, entries] of stats.backlinks) {
    const count = entries.length;
    totalBacklinks += count;
    potentialHubs.push({ noteTitle, count });
  }

  // Detect hub nodes (>20% concentration)
  if (totalBacklinks > 0) {
    for (const { noteTitle, count } of potentialHubs) {
      const percentage = count / totalBacklinks;

      if (percentage >= HEALTH_THRESHOLDS.HUB_CONCENTRATION_WARNING) {
        // Find metadata for this note
        const metadata = stats.noteMetadata?.find(
          (m) => m.title === noteTitle || m.basename === noteTitle
        );

        hubNodes.push({
          noteId: metadata?.id || noteTitle,
          title: noteTitle,
          path: metadata?.path || "",
          backlinkCount: count,
          percentage,
        });
      }
    }
  }

  // Sort hub nodes by percentage descending
  hubNodes.sort((a, b) => b.percentage - a.percentage);

  // Detect suspicious auto-links (same title linked many times)
  // This indicates potential false positive from auto-linking
  const linkCounts = new Map<string, number>();

  for (const [, targets] of stats.forwardLinks) {
    for (const target of targets) {
      linkCounts.set(target, (linkCounts.get(target) || 0) + 1);
    }
  }

  for (const [target, count] of linkCounts) {
    if (count >= HEALTH_THRESHOLDS.SUSPICIOUS_AUTO_LINK_COUNT) {
      suspiciousAutoLinks.push(target);
    }
  }

  // Sort by most frequent
  suspiciousAutoLinks.sort((a, b) => {
    return (linkCounts.get(b) || 0) - (linkCounts.get(a) || 0);
  });

  return {
    hubNodes,
    suspiciousAutoLinks,
  };
}

/**
 * Generate actionable recommendations based on analysis
 */
function generateRecommendations(
  stats: NoteGraphStats,
  metrics: GraphMetrics,
  anomalies: GraphAnomalies
): string[] {
  const recommendations: string[] = [];

  // Hub node recommendations
  for (const hub of anomalies.hubNodes) {
    if (hub.percentage >= HEALTH_THRESHOLDS.HUB_CONCENTRATION_CRITICAL) {
      recommendations.push(
        `Critical: "${hub.title}" has ${Math.round(hub.percentage * 100)}% of all backlinks. ` +
        `Consider splitting into more specific notes.`
      );
    } else {
      recommendations.push(
        `Review hub note "${hub.title}" (${Math.round(hub.percentage * 100)}% of backlinks) - ` +
        `consider if it should be split into subtopics.`
      );
    }
  }

  // Isolated notes recommendations
  if (metrics.noBacklinksPercentage >= HEALTH_THRESHOLDS.ISOLATED_NOTES_CRITICAL) {
    recommendations.push(
      `Critical: ${Math.round(metrics.noBacklinksPercentage * 100)}% of notes have no backlinks. ` +
      `Add more cross-references to improve discoverability.`
    );
  } else if (metrics.noBacklinksPercentage >= HEALTH_THRESHOLDS.ISOLATED_NOTES_WARNING) {
    recommendations.push(
      `${Math.round(metrics.noBacklinksPercentage * 100)}% of notes have no backlinks. ` +
      `Consider adding links to these notes from related content.`
    );
  }

  // No outlinks recommendations
  if (metrics.noOutlinksPercentage >= HEALTH_THRESHOLDS.NO_OUTLINKS_CRITICAL) {
    recommendations.push(
      `Critical: ${Math.round(metrics.noOutlinksPercentage * 100)}% of notes have no outgoing links. ` +
      `Add wikilinks to connect notes.`
    );
  } else if (metrics.noOutlinksPercentage >= HEALTH_THRESHOLDS.NO_OUTLINKS_WARNING) {
    recommendations.push(
      `${Math.round(metrics.noOutlinksPercentage * 100)}% of notes have no outgoing links. ` +
      `Consider linking to related notes.`
    );
  }

  // Orphan notes recommendations
  if (metrics.orphanPercentage >= HEALTH_THRESHOLDS.ORPHAN_NOTES_CRITICAL) {
    recommendations.push(
      `Critical: ${Math.round(metrics.orphanPercentage * 100)}% of notes are completely orphaned ` +
      `(no incoming or outgoing links). These notes are effectively invisible in the graph.`
    );
  } else if (metrics.orphanPercentage >= HEALTH_THRESHOLDS.ORPHAN_NOTES_WARNING) {
    recommendations.push(
      `${Math.round(metrics.orphanPercentage * 100)}% of notes are orphaned. ` +
      `Run "/graph" to visualize and identify isolated clusters.`
    );
  }

  // Suspicious auto-links recommendations
  if (anomalies.suspiciousAutoLinks.length > 0) {
    const topLinks = anomalies.suspiciousAutoLinks.slice(0, 3);
    recommendations.push(
      `Frequently auto-linked titles: "${topLinks.join('", "')}". ` +
      `Review these for false positive links or consider adding to exclusion list.`
    );
  }

  // Dangling links recommendations
  if (stats.danglingLinks.length > 10) {
    recommendations.push(
      `${stats.danglingLinks.length} dangling links found. ` +
      `Run "/graph dangling" to see unresolved links and create missing notes.`
    );
  } else if (stats.danglingLinks.length > 0) {
    recommendations.push(
      `${stats.danglingLinks.length} dangling link(s) found. ` +
      `Consider creating notes for: ${stats.danglingLinks.slice(0, 3).map(d => `"${d.target}"`).join(", ")}.`
    );
  }

  // Low connectivity recommendations
  if (metrics.graphDensity < 0.5 && stats.noteCount > 10) {
    recommendations.push(
      `Graph density is low (${metrics.graphDensity.toFixed(2)} links/note). ` +
      `Use "/suggest-links" to find linking opportunities.`
    );
  }

  return recommendations;
}

/**
 * Calculate overall health score (0-100)
 */
export function calculateHealthScore(
  metrics: GraphMetrics,
  anomalies: GraphAnomalies,
  stats?: NoteGraphStats
): number {
  const { WEIGHTS } = HEALTH_THRESHOLDS;
  let score = 100;

  // 1. Connectivity score (30 points)
  // Penalize high isolation rates
  const isolationPenalty = Math.min(
    metrics.noBacklinksPercentage * 40 + metrics.noOutlinksPercentage * 20,
    WEIGHTS.CONNECTIVITY
  );
  score -= isolationPenalty;

  // 2. Orphan penalty (25 points)
  const orphanPenalty = Math.min(
    metrics.orphanPercentage * 80,
    WEIGHTS.ORPHANS
  );
  score -= orphanPenalty;

  // 3. Hub concentration penalty (25 points)
  if (anomalies.hubNodes.length > 0) {
    const maxConcentration = anomalies.hubNodes[0].percentage;
    const hubPenalty = Math.min(
      maxConcentration * 50,
      WEIGHTS.HUB_CONCENTRATION
    );
    score -= hubPenalty;
  }

  // 4. Dangling links penalty (20 points)
  if (stats && stats.totalMentions > 0) {
    const danglingRatio = stats.danglingLinks.length / stats.totalMentions;
    const danglingPenalty = Math.min(
      danglingRatio * 60,
      WEIGHTS.DANGLING_LINKS
    );
    score -= danglingPenalty;
  }

  return Math.max(0, Math.round(score));
}

// ============================================================================
// Console Output
// ============================================================================

/**
 * Print formatted health report to console
 */
export function printHealthReport(report: ImportHealthReport): void {
  const {
    totalNotes,
    totalWikilinks,
    resolvedLinks,
    danglingCount,
    graphMetrics,
    anomalies,
    recommendations,
    healthScore,
    status,
  } = report;

  const statusColor = status === "healthy" ? "\x1b[32m" : status === "warning" ? "\x1b[33m" : "\x1b[31m";
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const dim = "\x1b[2m";
  const cyan = "\x1b[36m";
  const yellow = "\x1b[33m";
  const red = "\x1b[31m";

  const width = 64;
  const line = "═".repeat(width);
  const thinLine = "─".repeat(width);

  console.log("");
  console.log(`${cyan}╔${line}╗${reset}`);
  console.log(`${cyan}║${reset}${bold}                    Import Health Report                      ${reset}${cyan}║${reset}`);
  console.log(`${cyan}║${reset}                    Health Score: ${statusColor}${bold}${healthScore}/100${reset}                      ${cyan}║${reset}`);
  console.log(`${cyan}╠${line}╣${reset}`);

  // Statistics section
  console.log(`${cyan}║${reset} ${bold}📊 STATISTICS${reset}                                                ${cyan}║${reset}`);
  console.log(`${cyan}║${reset} • Total notes:        ${totalNotes.toString().padEnd(37)}${cyan}║${reset}`);
  console.log(`${cyan}║${reset} • Total wikilinks:    ${totalWikilinks.toString().padEnd(37)}${cyan}║${reset}`);

  const resolvedPct = totalWikilinks > 0 ? Math.round((resolvedLinks / totalWikilinks) * 100) : 100;
  console.log(`${cyan}║${reset} • Resolved links:     ${resolvedLinks} (${resolvedPct}%)${" ".repeat(Math.max(0, 29 - resolvedLinks.toString().length - resolvedPct.toString().length))}${cyan}║${reset}`);
  console.log(`${cyan}║${reset} • Dangling links:     ${danglingCount} (${100 - resolvedPct}%)${" ".repeat(Math.max(0, 29 - danglingCount.toString().length - (100 - resolvedPct).toString().length))}${cyan}║${reset}`);
  console.log(`${cyan}║${reset} • Graph density:      ${graphMetrics.graphDensity.toFixed(2)} links/note${" ".repeat(Math.max(0, 25 - graphMetrics.graphDensity.toFixed(2).length))}${cyan}║${reset}`);

  console.log(`${cyan}╠${line}╣${reset}`);

  // Graph metrics section
  console.log(`${cyan}║${reset} ${bold}📈 GRAPH METRICS${reset}                                             ${cyan}║${reset}`);
  console.log(`${cyan}║${reset} • Avg backlinks/note: ${graphMetrics.avgBacklinksPerNote.toFixed(2).padEnd(37)}${cyan}║${reset}`);

  const maxBlTitle = graphMetrics.maxBacklinksNoteTitle.slice(0, 20);
  console.log(`${cyan}║${reset} • Max backlinks:      ${graphMetrics.maxBacklinksPerNote} (note: "${maxBlTitle}")${" ".repeat(Math.max(0, 16 - maxBlTitle.length))}${cyan}║${reset}`);

  // No backlinks with warning indicator
  const noBlPct = Math.round(graphMetrics.noBacklinksPercentage * 100);
  const noBlWarning = graphMetrics.noBacklinksPercentage >= HEALTH_THRESHOLDS.ISOLATED_NOTES_WARNING ? ` ${yellow}⚠️${reset}` : "";
  console.log(`${cyan}║${reset} • Notes with 0 backlinks: ${graphMetrics.notesWithNoBacklinks} (${noBlPct}%)${noBlWarning}${" ".repeat(Math.max(0, 22 - graphMetrics.notesWithNoBacklinks.toString().length - noBlPct.toString().length - (noBlWarning ? 3 : 0)))}${cyan}║${reset}`);

  // No outlinks with warning indicator
  const noOlPct = Math.round(graphMetrics.noOutlinksPercentage * 100);
  const noOlWarning = graphMetrics.noOutlinksPercentage >= HEALTH_THRESHOLDS.NO_OUTLINKS_WARNING ? ` ${yellow}⚠️${reset}` : "";
  console.log(`${cyan}║${reset} • Notes with 0 outlinks:  ${graphMetrics.notesWithNoOutlinks} (${noOlPct}%)${noOlWarning}${" ".repeat(Math.max(0, 22 - graphMetrics.notesWithNoOutlinks.toString().length - noOlPct.toString().length - (noOlWarning ? 3 : 0)))}${cyan}║${reset}`);

  // Orphan notes with warning indicator
  const orphanPct = Math.round(graphMetrics.orphanPercentage * 100);
  const orphanWarning = graphMetrics.orphanPercentage >= HEALTH_THRESHOLDS.ORPHAN_NOTES_WARNING ? ` ${yellow}⚠️${reset}` : "";
  console.log(`${cyan}║${reset} • Orphan notes:       ${graphMetrics.orphanNotes} (${orphanPct}%)${orphanWarning}${" ".repeat(Math.max(0, 28 - graphMetrics.orphanNotes.toString().length - orphanPct.toString().length - (orphanWarning ? 3 : 0)))}${cyan}║${reset}`);

  // Anomalies section (if any)
  if (anomalies.hubNodes.length > 0 || anomalies.suspiciousAutoLinks.length > 0) {
    console.log(`${cyan}╠${line}╣${reset}`);
    console.log(`${cyan}║${reset} ${bold}${yellow}⚠️  ANOMALIES${reset}                                                ${cyan}║${reset}`);

    for (const hub of anomalies.hubNodes.slice(0, 3)) {
      const hubTitle = hub.title.slice(0, 25);
      const hubPct = Math.round(hub.percentage * 100);
      console.log(`${cyan}║${reset} • Hub node: "${hubTitle}" has ${hubPct}% of all backlinks${" ".repeat(Math.max(0, 10 - hubTitle.length - hubPct.toString().length))}${cyan}║${reset}`);
    }

    if (anomalies.suspiciousAutoLinks.length > 0) {
      const topLinks = anomalies.suspiciousAutoLinks.slice(0, 3).join('", "');
      const linkStr = `"${topLinks}"`.slice(0, 40);
      console.log(`${cyan}║${reset} • Suspicious auto-links: ${linkStr}${" ".repeat(Math.max(0, 37 - linkStr.length))}${cyan}║${reset}`);
    }
  }

  // Recommendations section (if any)
  if (recommendations.length > 0) {
    console.log(`${cyan}╠${line}╣${reset}`);
    console.log(`${cyan}║${reset} ${bold}💡 RECOMMENDATIONS${reset}                                           ${cyan}║${reset}`);

    for (let i = 0; i < Math.min(recommendations.length, 4); i++) {
      const rec = recommendations[i];
      // Word wrap recommendation
      const maxLen = 58;
      const words = rec.split(" ");
      let currentLine = `${i + 1}. `;

      for (const word of words) {
        if ((currentLine + word).length > maxLen) {
          console.log(`${cyan}║${reset} ${currentLine.padEnd(61)}${cyan}║${reset}`);
          currentLine = "   " + word + " ";
        } else {
          currentLine += word + " ";
        }
      }
      if (currentLine.trim()) {
        console.log(`${cyan}║${reset} ${currentLine.padEnd(61)}${cyan}║${reset}`);
      }
    }

    if (recommendations.length > 4) {
      console.log(`${cyan}║${reset} ${dim}... and ${recommendations.length - 4} more recommendations${reset}${" ".repeat(Math.max(0, 35 - (recommendations.length - 4).toString().length))}${cyan}║${reset}`);
    }
  }

  console.log(`${cyan}╚${line}╝${reset}`);
  console.log("");
}

/**
 * Get a short summary string for the health report
 */
export function getHealthSummary(report: ImportHealthReport): string {
  const statusEmoji = report.status === "healthy" ? "✅" : report.status === "warning" ? "⚠️" : "❌";
  return `${statusEmoji} Health Score: ${report.healthScore}/100 | ${report.totalNotes} notes | ${report.resolvedLinks}/${report.totalWikilinks} links resolved`;
}
