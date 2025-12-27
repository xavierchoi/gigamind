/**
 * GigaMind Similarity Worker
 * Background thread for computing string similarity between dangling links
 * Prevents main thread blocking during O(n^2) similarity calculations
 */

// ========================================================
// Similarity Algorithms (ported from similarity.ts)
// ========================================================

/**
 * Jaro similarity calculation
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score 0-1
 */
function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
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

  // Calculate transpositions
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
 * Jaro-Winkler similarity calculation
 * Adds prefix bonus to Jaro similarity
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} prefixScale - Prefix scale factor (default: 0.1)
 * @returns {number} Similarity score 0-1
 */
function jaroWinklerSimilarity(s1, s2, prefixScale = 0.1) {
  const jaro = jaroSimilarity(s1, s2);

  // Common prefix length (max 4 characters)
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
 * Generate n-grams from a string
 * @param {string} str - Input string
 * @param {number} n - Gram size (default: 2 for bigrams)
 * @returns {Set<string>} Set of n-grams
 */
function generateNgrams(str, n = 2) {
  const ngrams = new Set();
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
 * N-gram similarity using Dice coefficient
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} n - Gram size (default: 2)
 * @returns {number} Similarity score 0-1
 */
function ngramSimilarity(s1, s2, n = 2) {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const ngrams1 = generateNgrams(s1, n);
  const ngrams2 = generateNgrams(s2, n);

  // Intersection size
  let intersection = 0;
  for (const gram of ngrams1) {
    if (ngrams2.has(gram)) {
      intersection++;
    }
  }

  // Dice coefficient: 2 * |A n B| / (|A| + |B|)
  return (2 * intersection) / (ngrams1.size + ngrams2.size);
}

/**
 * Tokenize a string for token overlap calculation
 * Handles Korean particles and common separators
 * @param {string} str - Input string
 * @returns {string[]} Array of tokens
 */
function tokenize(str) {
  // Split by whitespace and special characters
  const tokens = str
    .toLowerCase()
    .split(/[\s\-_.,;:!?'"()[\]{}]+/)
    .filter((t) => t.length > 0);

  // Korean particles (compound first, then single)
  const compoundParticles = /(으로|에서|에게|까지|부터|처럼|만큼|보다)$/;
  const singleParticles = /[은는이가을를의에와과로]$/;

  return tokens.map((token) => {
    // For Korean tokens longer than 2 chars, try to remove compound particles
    if (/[\uAC00-\uD7A3]$/.test(token) && token.length > 2) {
      const withoutCompound = token.replace(compoundParticles, '');
      if (withoutCompound !== token) return withoutCompound;
    }
    // For Korean tokens longer than 1 char, try to remove single particles
    if (/[\uAC00-\uD7A3]$/.test(token) && token.length > 1) {
      return token.replace(singleParticles, '');
    }
    return token;
  });
}

/**
 * Token overlap similarity using Jaccard coefficient
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score 0-1
 */
function tokenOverlapSimilarity(s1, s2) {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const tokens1 = new Set(tokenize(s1));
  const tokens2 = new Set(tokenize(s2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Intersection size
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  // Union size
  const union = new Set([...tokens1, ...tokens2]).size;

  // Jaccard: |A n B| / |A u B|
  return intersection / union;
}

/**
 * Containment similarity
 * Checks if one string is contained within another
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score 0-1
 */
function containmentSimilarity(s1, s2) {
  const n1 = s1.toLowerCase().trim();
  const n2 = s2.toLowerCase().trim();

  if (n1 === n2) return 1;

  // If one is fully contained in the other, return high score
  if (n1.includes(n2)) {
    return n2.length / n1.length;
  }
  if (n2.includes(n1)) {
    return n1.length / n2.length;
  }

  return 0;
}

/**
 * Calculate composite similarity score
 * Combines multiple algorithms with weighted average
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {{score: number, jaroWinkler: number, ngram: number, tokenOverlap: number}}
 */
function calculateSimilarity(s1, s2) {
  const jw = jaroWinklerSimilarity(s1, s2);
  const ng = ngramSimilarity(s1, s2);
  const to = tokenOverlapSimilarity(s1, s2);
  const ct = containmentSimilarity(s1, s2);

  // Adjust weights based on containment relationship
  let score;
  if (ct > 0.5) {
    // If one string contains >50% of the other, weight containment higher
    score = 0.3 * jw + 0.2 * ng + 0.2 * to + 0.3 * ct;
  } else {
    // Default weights: JW 40%, ngram 30%, token 30%
    score = 0.4 * jw + 0.3 * ng + 0.3 * to;
  }

  return {
    score,
    jaroWinkler: jw,
    ngram: ng,
    tokenOverlap: to,
  };
}

// ========================================================
// Union-Find Data Structure
// ========================================================

class UnionFind {
  constructor(size) {
    this.parent = new Map();
    this.rank = new Map();

    for (let i = 0; i < size; i++) {
      this.parent.set(i, i);
      this.rank.set(i, 0);
    }
  }

  find(x) {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)));
    }
    return this.parent.get(x);
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX);
    const rankY = this.rank.get(rootY);

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getGroups() {
    const groups = new Map();

    for (const [index] of this.parent) {
      const root = this.find(index);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root).push(index);
    }

    return Array.from(groups.values());
  }
}

// ========================================================
// Clustering Logic
// ========================================================

/**
 * Generate a unique cluster ID
 * @returns {string} UUID-like cluster ID
 */
function generateClusterId() {
  return 'cluster-' + crypto.randomUUID();
}

/**
 * Select the representative target from cluster members
 * Chooses the most frequently occurring target
 * @param {Array} members - Cluster members
 * @returns {string} Representative target
 */
function selectRepresentative(members) {
  if (members.length === 0) {
    return '';
  }

  // Sort by total count, then source count, then alphabetically
  const sorted = [...members].sort((a, b) => {
    const countA = a.sources.reduce((sum, s) => sum + s.count, 0);
    const countB = b.sources.reduce((sum, s) => sum + s.count, 0);

    if (countB !== countA) {
      return countB - countA;
    }

    if (b.sources.length !== a.sources.length) {
      return b.sources.length - a.sources.length;
    }

    return a.target.localeCompare(b.target);
  });

  return sorted[0].target;
}

/**
 * Cluster dangling links based on similarity
 * @param {Array} danglingLinks - Array of dangling link objects
 * @param {Object} options - Analysis options
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Array} Array of similar link clusters
 */
function clusterDanglingLinks(danglingLinks, options, progressCallback) {
  const threshold = options?.threshold ?? 0.7;
  const minClusterSize = options?.minClusterSize ?? 2;
  const maxResults = options?.maxResults ?? 50;

  if (danglingLinks.length < 2) {
    return [];
  }

  // 1. Extract targets and create index map
  const targets = danglingLinks.map((dl) => dl.target);
  const targetToIndex = new Map();
  targets.forEach((target, index) => {
    targetToIndex.set(target, index);
  });

  // 2. Initialize Union-Find
  const uf = new UnionFind(targets.length);

  // 3. Calculate similarities and connect pairs above threshold
  const similarityCache = new Map();
  const totalPairs = (targets.length * (targets.length - 1)) / 2;
  let processedPairs = 0;
  let lastProgressReport = 0;

  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const similarity = calculateSimilarity(targets[i], targets[j]);

      // Cache for later use in cluster statistics
      const cacheKey = `${i}-${j}`;
      similarityCache.set(cacheKey, similarity);

      if (similarity.score >= threshold) {
        uf.union(i, j);
      }

      processedPairs++;

      // Report progress every 5%
      const currentProgress = Math.floor((processedPairs / totalPairs) * 100);
      if (currentProgress >= lastProgressReport + 5) {
        lastProgressReport = currentProgress;
        progressCallback({ type: 'progress', percent: currentProgress, phase: 'calculating' });
      }
    }
  }

  // 4. Extract connected components
  progressCallback({ type: 'progress', percent: 100, phase: 'clustering' });
  const groups = uf.getGroups();

  // 5. Convert groups to clusters (only those meeting minimum size)
  const clusters = [];

  for (const group of groups) {
    if (group.length < minClusterSize) {
      continue;
    }

    // Create cluster members
    const members = group.map((index) => {
      const dl = danglingLinks[index];
      return {
        target: dl.target,
        similarity: 1, // Will be updated below
        sources: dl.sources.map((s) => ({
          notePath: s.notePath,
          noteTitle: s.noteTitle,
          count: s.count,
        })),
      };
    });

    // Select representative
    const representative = selectRepresentative(members);

    if (!representative) {
      continue;
    }

    // Update similarity to representative
    const repIndex = targetToIndex.get(representative);
    if (repIndex === undefined) {
      continue;
    }

    for (const member of members) {
      if (member.target === representative) {
        member.similarity = 1;
      } else {
        const memberIndex = targetToIndex.get(member.target);
        const [minIdx, maxIdx] = [
          Math.min(repIndex, memberIndex),
          Math.max(repIndex, memberIndex),
        ];
        const cacheKey = `${minIdx}-${maxIdx}`;
        const similarity = similarityCache.get(cacheKey);
        member.similarity = similarity?.score ?? 0;
      }
    }

    // Calculate average similarity (excluding representative)
    const nonRepMembers = members.filter((m) => m.target !== representative);
    const avgSimilarity =
      nonRepMembers.length > 0
        ? nonRepMembers.reduce((sum, m) => sum + m.similarity, 0) / nonRepMembers.length
        : 1;

    // Total occurrences
    const totalOccurrences = members.reduce(
      (sum, m) => sum + m.sources.reduce((s, src) => s + src.count, 0),
      0
    );

    // Sort members by similarity (representative first)
    members.sort((a, b) => {
      if (a.target === representative) return -1;
      if (b.target === representative) return 1;
      return b.similarity - a.similarity;
    });

    clusters.push({
      id: generateClusterId(),
      representativeTarget: representative,
      members,
      totalOccurrences,
      averageSimilarity: avgSimilarity,
    });
  }

  // 6. Sort by total occurrences and limit results
  clusters.sort((a, b) => b.totalOccurrences - a.totalOccurrences);

  return clusters.slice(0, maxResults);
}

// ========================================================
// Worker Message Handler
// ========================================================

let isProcessing = false;

self.onmessage = function (e) {
  const { type, danglingLinks, options } = e.data;

  if (type === 'cancel') {
    // Note: True cancellation is complex; this is a soft cancel
    isProcessing = false;
    return;
  }

  if (type === 'analyze') {
    if (isProcessing) {
      self.postMessage({
        type: 'error',
        error: 'Analysis already in progress',
      });
      return;
    }

    isProcessing = true;

    try {
      // Report start
      self.postMessage({
        type: 'progress',
        percent: 0,
        phase: 'starting',
        totalLinks: danglingLinks.length,
      });

      // Perform clustering with progress callback
      const clusters = clusterDanglingLinks(danglingLinks, options, (progress) => {
        if (isProcessing) {
          self.postMessage(progress);
        }
      });

      // Report completion
      if (isProcessing) {
        self.postMessage({
          type: 'result',
          clusters,
          totalDanglingLinks: danglingLinks.length,
        });
      }
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message || 'Unknown error during analysis',
      });
    } finally {
      isProcessing = false;
    }
  }
};

// Report worker ready
self.postMessage({ type: 'ready' });
