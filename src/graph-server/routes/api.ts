/**
 * Graph API Routes
 * REST endpoints for graph data with lazy loading support
 */

import { Router, type Request, type Response } from "express";
import { analyzeNoteGraph, getQuickStats } from "../../utils/graph/analyzer.js";
import { normalizeNoteTitle } from "../../utils/graph/wikilinks.js";
import { clusterDanglingLinks } from "../../utils/graph/clusterAnalyzer.js";
import { mergeSimilarLinks } from "../../utils/graph/linkMerger.js";
import type { NoteGraphStats, BacklinkEntry, SimilarLinkCluster, MergeLinkResult } from "../../utils/graph/types.js";
import path from "node:path";

/**
 * Graph node for API response
 */
interface GraphNode {
  id: string;
  title: string;
  path: string;
  type: "note" | "dangling" | "orphan";
  connectionCount: number;
}

/**
 * Graph link for API response
 */
interface GraphLink {
  source: string;
  target: string;
}

/**
 * Full graph API response
 */
interface GraphAPIResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: {
    noteCount: number;
    connectionCount: number;
    danglingCount: number;
    orphanCount: number;
  };
  pagination?: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Quick stats API response
 */
interface StatsAPIResponse {
  noteCount: number;
  connectionCount: number;
  orphanCount: number;
  danglingCount: number;
  lastUpdated: number;
}

/**
 * Similar links cluster API response
 */
interface SimilarLinksAPIResponse {
  clusters: SimilarLinkCluster[];
  totalClusters: number;
  totalDanglingLinks: number;
  analyzedAt: number;
}

/**
 * Merge similar links request body
 */
interface MergeSimilarLinksRequest {
  oldTargets: string[];
  newTarget: string;
  preserveAsAlias: boolean;
}

/**
 * Merge similar links API response
 */
interface MergeSimilarLinksAPIResponse {
  filesModified: number;
  linksReplaced: number;
  modifiedFiles: string[];
  errors: Record<string, string>;
}

/**
 * Transform NoteGraphStats to API-friendly format
 */
function transformGraphStats(stats: NoteGraphStats, notesDir: string): GraphAPIResponse {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  // Build node ID from path (use relative path as ID)
  const getNodeId = (filePath: string): string => {
    return path.relative(notesDir, filePath);
  };

  // Get title from backlinks or use basename
  const getTitleFromPath = (filePath: string): string => {
    const basename = path.basename(filePath, ".md");
    // Check if we have backlinks with this path to get the title
    for (const [title, entries] of stats.backlinks) {
      for (const entry of entries) {
        if (entry.notePath === filePath) {
          return entry.noteTitle;
        }
      }
      // Check if this is the target note
      const normalizedTitle = normalizeNoteTitle(title);
      const normalizedBasename = normalizeNoteTitle(basename);
      if (normalizedTitle === normalizedBasename) {
        return title;
      }
    }
    return basename;
  };

  // Add all existing notes as nodes
  for (const [filePath, targets] of stats.forwardLinks) {
    const nodeId = getNodeId(filePath);
    const isOrphan = stats.orphanNotes.includes(filePath);

    if (!nodeIds.has(nodeId)) {
      nodeIds.add(nodeId);
      nodes.push({
        id: nodeId,
        title: getTitleFromPath(filePath),
        path: filePath,
        type: isOrphan ? "orphan" : "note",
        connectionCount: targets.length + (stats.backlinks.get(getTitleFromPath(filePath))?.length || 0),
      });
    }
  }

  // Also add notes that only have backlinks (no forward links)
  for (const [title, entries] of stats.backlinks) {
    for (const entry of entries) {
      const nodeId = getNodeId(entry.notePath);
      if (!nodeIds.has(nodeId)) {
        nodeIds.add(nodeId);
        nodes.push({
          id: nodeId,
          title: entry.noteTitle,
          path: entry.notePath,
          type: "note",
          connectionCount: entries.length,
        });
      }
    }
  }

  // Add dangling links as special nodes
  for (const dangling of stats.danglingLinks) {
    const danglingId = `dangling:${dangling.target}`;
    if (!nodeIds.has(danglingId)) {
      nodeIds.add(danglingId);
      nodes.push({
        id: danglingId,
        title: dangling.target,
        path: "",
        type: "dangling",
        connectionCount: dangling.sources.length,
      });
    }
  }

  // Build links from forwardLinks
  for (const [sourcePath, targets] of stats.forwardLinks) {
    const sourceId = getNodeId(sourcePath);

    for (const target of targets) {
      // Find the target node
      const normalizedTarget = normalizeNoteTitle(target);

      // Check if it's an existing note
      let targetId: string | null = null;

      for (const node of nodes) {
        if (node.type !== "dangling" && normalizeNoteTitle(node.title) === normalizedTarget) {
          targetId = node.id;
          break;
        }
        // Also check by basename
        if (node.type !== "dangling") {
          const nodeBasename = normalizeNoteTitle(path.basename(node.path, ".md"));
          if (nodeBasename === normalizedTarget) {
            targetId = node.id;
            break;
          }
        }
      }

      // If not found, it's a dangling link
      if (!targetId) {
        targetId = `dangling:${target}`;
      }

      // Add link if both nodes exist
      if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
        links.push({
          source: sourceId,
          target: targetId,
        });
      }
    }
  }

  return {
    nodes,
    links,
    stats: {
      noteCount: stats.noteCount,
      connectionCount: stats.uniqueConnections,
      danglingCount: stats.danglingLinks.length,
      orphanCount: stats.orphanNotes.length,
    },
  };
}

/**
 * Get focused graph with configurable depth (N-hop neighbors)
 * @param fullGraph The complete graph data
 * @param nodeId The center node ID
 * @param depth Number of hops from center (default: 1)
 * @param limit Maximum nodes to return (default: 100)
 */
function getFocusedGraph(
  fullGraph: GraphAPIResponse,
  nodeId: string,
  depth: number = 1,
  limit: number = 100
): GraphAPIResponse {
  // Build adjacency map for efficient traversal
  const adjacencyMap = new Map<string, Set<string>>();

  for (const link of fullGraph.links) {
    if (!adjacencyMap.has(link.source)) {
      adjacencyMap.set(link.source, new Set());
    }
    if (!adjacencyMap.has(link.target)) {
      adjacencyMap.set(link.target, new Set());
    }
    adjacencyMap.get(link.source)!.add(link.target);
    adjacencyMap.get(link.target)!.add(link.source);
  }

  // BFS to find nodes within depth
  const connectedIds = new Set<string>([nodeId]);
  const nodeDistances = new Map<string, number>([[nodeId, 0]]);
  const queue: Array<{ id: string; dist: number }> = [{ id: nodeId, dist: 0 }];

  while (queue.length > 0 && connectedIds.size < limit) {
    const current = queue.shift()!;

    if (current.dist >= depth) continue;

    const neighbors = adjacencyMap.get(current.id) || new Set();
    for (const neighbor of neighbors) {
      if (!connectedIds.has(neighbor) && connectedIds.size < limit) {
        connectedIds.add(neighbor);
        nodeDistances.set(neighbor, current.dist + 1);
        queue.push({ id: neighbor, dist: current.dist + 1 });
      }
    }
  }

  // Filter nodes and links
  const nodes = fullGraph.nodes.filter((node) => connectedIds.has(node.id));
  const links = fullGraph.links.filter(
    (link) => connectedIds.has(link.source) && connectedIds.has(link.target)
  );

  return {
    nodes,
    links,
    stats: fullGraph.stats, // Keep original stats
  };
}

/**
 * Apply pagination to graph nodes and filter links accordingly
 * @param fullGraph The complete graph data
 * @param offset Pagination offset
 * @param limit Maximum nodes to return
 * @param sort Sort order: 'connections' (most connected first) or 'default'
 */
function paginateGraph(
  fullGraph: GraphAPIResponse,
  offset: number,
  limit: number,
  sort: 'connections' | 'default' = 'default'
): GraphAPIResponse {
  const totalNodes = fullGraph.nodes.length;

  // Sort nodes if requested
  let sortedNodes = [...fullGraph.nodes];
  if (sort === 'connections') {
    sortedNodes.sort((a, b) => b.connectionCount - a.connectionCount);
  }

  const paginatedNodes = sortedNodes.slice(offset, offset + limit);
  const paginatedNodeIds = new Set(paginatedNodes.map((n) => n.id));

  // Only include links where both nodes are in the paginated set
  const paginatedLinks = fullGraph.links.filter(
    (link) => paginatedNodeIds.has(link.source) && paginatedNodeIds.has(link.target)
  );

  return {
    nodes: paginatedNodes,
    links: paginatedLinks,
    stats: fullGraph.stats,
    pagination: {
      offset,
      limit,
      total: totalNodes,
      hasMore: offset + limit < totalNodes,
    },
  };
}

/**
 * Create the graph API router
 */
export function createGraphRouter(notesDir: string): Router {
  const router = Router();

  // GET /api/stats - Quick stats without full graph analysis (lightweight)
  router.get("/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await getQuickStats(notesDir);
      const response: StatsAPIResponse = {
        noteCount: stats.noteCount,
        connectionCount: stats.connectionCount,
        orphanCount: stats.orphanCount,
        danglingCount: stats.danglingCount,
        lastUpdated: Date.now(),
      };
      res.json(response);
    } catch (error) {
      console.error("Error fetching quick stats:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // GET /api/graph - Full graph data with pagination and lazy loading
  router.get("/graph", async (req: Request, res: Response) => {
    try {
      const {
        depth,       // Hops from center node (only used with center)
        center,      // Starting node for focused view
        limit,       // Max nodes to return
        offset,      // Pagination offset
        sort,        // Sort order: 'connections' or 'default'
        all,         // If 'true', return full graph without pagination
      } = req.query;

      const parsedDepth = depth ? parseInt(depth as string, 10) : 2;
      const parsedLimit = limit ? parseInt(limit as string, 10) : 100;
      const parsedOffset = offset ? parseInt(offset as string, 10) : 0;
      const sortOrder = sort === 'connections' ? 'connections' : 'default';
      const returnAll = all === 'true';

      const stats = await analyzeNoteGraph(notesDir, { includeContext: false });
      const fullGraph = transformGraphStats(stats, notesDir);

      // If center is specified, return subgraph within depth of center node
      if (center) {
        const decodedCenter = decodeURIComponent(center as string);
        const subgraph = getFocusedGraph(fullGraph, decodedCenter, parsedDepth, parsedLimit);
        return res.json(subgraph);
      }

      // If all=true, return full graph without pagination
      if (returnAll) {
        return res.json(fullGraph);
      }

      // Otherwise return graph with pagination
      const paginatedGraph = paginateGraph(fullGraph, parsedOffset, parsedLimit, sortOrder);
      res.json(paginatedGraph);
    } catch (error) {
      console.error("Error fetching graph data:", error);
      res.status(500).json({ error: "Failed to analyze graph" });
    }
  });

  // GET /api/graph/:nodeId - Focused graph (single note + N-hop neighbors)
  router.get("/graph/:nodeId", async (req: Request, res: Response) => {
    try {
      const { nodeId } = req.params;
      const { depth, limit } = req.query;

      const decodedNodeId = decodeURIComponent(nodeId);
      const parsedDepth = depth ? parseInt(depth as string, 10) : 1;
      const parsedLimit = limit ? parseInt(limit as string, 10) : 100;

      const stats = await analyzeNoteGraph(notesDir, { includeContext: false });
      const fullGraph = transformGraphStats(stats, notesDir);
      const focusedGraph = getFocusedGraph(fullGraph, decodedNodeId, parsedDepth, parsedLimit);

      res.json(focusedGraph);
    } catch (error) {
      console.error("Error fetching focused graph:", error);
      res.status(500).json({ error: "Failed to analyze graph" });
    }
  });

  // GET /api/dangling-links - Get raw dangling links for client-side analysis
  router.get("/dangling-links", async (_req: Request, res: Response) => {
    try {
      const stats = await analyzeNoteGraph(notesDir, { includeContext: false });

      console.log(`[Dangling Links API] Found ${stats.danglingLinks.length} dangling links`);

      res.json({
        danglingLinks: stats.danglingLinks,
        totalCount: stats.danglingLinks.length,
        fetchedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error fetching dangling links:", error);
      res.status(500).json({ error: "Failed to fetch dangling links" });
    }
  });

  // GET /api/similar-links - Get similar dangling link clusters
  router.get("/similar-links", async (req: Request, res: Response) => {
    try {
      const { threshold, limit } = req.query;

      const parsedThreshold = threshold ? parseFloat(threshold as string) : 0.7;
      const parsedLimit = limit ? parseInt(limit as string, 10) : 50;

      // Validate threshold range (including NaN check)
      if (isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 1) {
        return res.status(400).json({ error: "Threshold must be a number between 0 and 1" });
      }

      // Validate limit range (including NaN check)
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
        return res.status(400).json({ error: "Limit must be between 1 and 1000" });
      }

      const stats = await analyzeNoteGraph(notesDir, { includeContext: false });

      console.log(`[Similar Links API] Found ${stats.danglingLinks.length} dangling links`);
      if (stats.danglingLinks.length > 0) {
        console.log(`[Similar Links API] Sample dangling links:`, stats.danglingLinks.slice(0, 5).map(d => d.target));
      }

      const clusters = clusterDanglingLinks(stats.danglingLinks, {
        threshold: parsedThreshold,
        maxResults: parsedLimit,
      });

      console.log(`[Similar Links API] Found ${clusters.length} clusters at threshold ${parsedThreshold}`);

      const response: SimilarLinksAPIResponse = {
        clusters,
        totalClusters: clusters.length,
        totalDanglingLinks: stats.danglingLinks.length,
        analyzedAt: Date.now(),
      };

      res.json(response);
    } catch (error) {
      console.error("Error analyzing similar links:", error);
      res.status(500).json({ error: "Failed to analyze similar links" });
    }
  });

  // POST /api/similar-links/merge - Merge similar links
  router.post("/similar-links/merge", async (req: Request, res: Response) => {
    try {
      const { oldTargets, newTarget, preserveAsAlias } = req.body as MergeSimilarLinksRequest;

      // Validate request body
      if (!oldTargets || !Array.isArray(oldTargets) || oldTargets.length === 0) {
        return res.status(400).json({ error: "oldTargets must be a non-empty array" });
      }

      // Validate each oldTarget is a non-empty string
      if (!oldTargets.every((target: unknown) => typeof target === "string" && (target as string).trim().length > 0)) {
        return res.status(400).json({ error: "Each oldTarget must be a non-empty string" });
      }

      if (!newTarget || typeof newTarget !== "string" || !newTarget.trim()) {
        return res.status(400).json({ error: "newTarget must be a non-empty string" });
      }

      if (typeof preserveAsAlias !== "boolean") {
        return res.status(400).json({ error: "preserveAsAlias must be a boolean" });
      }

      const result: MergeLinkResult = await mergeSimilarLinks(notesDir, {
        oldTargets,
        newTarget,
        preserveAsAlias,
      });

      // Convert Map to plain object for JSON response
      const response: MergeSimilarLinksAPIResponse = {
        filesModified: result.filesModified,
        linksReplaced: result.linksReplaced,
        modifiedFiles: result.modifiedFiles,
        errors: Object.fromEntries(result.errors),
      };

      res.json(response);
    } catch (error) {
      console.error("Error merging similar links:", error);
      res.status(500).json({ error: "Failed to merge similar links" });
    }
  });

  // GET /api/heartbeat - Keep server alive
  router.get("/heartbeat", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  return router;
}
