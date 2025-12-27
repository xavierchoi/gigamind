/**
 * GigaMind Knowledge Graph - Similar Links Panel
 * Analyzes and displays similar dangling links with merge functionality
 * Uses Web Worker for background similarity calculations
 */

// ========================================================
// State
// ========================================================

const similarLinksState = {
  clusters: [],
  isLoading: false,
  isPanelOpen: false,
  threshold: 0.7,
  highlightedClusterId: null,
  pendingMerge: null,
  worker: null,
  workerReady: false,
  analysisProgress: 0,
};

// Cluster colors for highlighting
const CLUSTER_COLORS = [
  '#e74c3c', // Red
  '#3498db', // Blue
  '#2ecc71', // Green
  '#9b59b6', // Purple
  '#f39c12', // Orange
  '#1abc9c', // Teal
  '#e91e63', // Pink
  '#00bcd4', // Cyan
  '#ff5722', // Deep Orange
  '#8bc34a', // Light Green
];

// ========================================================
// DOM Elements
// ========================================================

const slElements = {
  toggle: document.getElementById('similar-links-toggle'),
  panel: document.getElementById('similar-links-panel'),
  closeBtn: document.getElementById('close-similar-links'),
  analyzeBtn: document.getElementById('analyze-similar-links'),
  thresholdSlider: document.getElementById('similarity-threshold'),
  thresholdValue: document.getElementById('threshold-value'),
  loadingState: document.getElementById('similar-links-loading'),
  emptyState: document.getElementById('similar-links-empty'),
  clustersContainer: document.getElementById('similar-links-clusters'),
  mergeModal: document.getElementById('merge-modal'),
  mergeMessage: document.getElementById('merge-modal-message'),
  mergePreserveAlias: document.getElementById('merge-preserve-alias'),
  mergeCancelBtn: document.getElementById('merge-cancel'),
  mergeConfirmBtn: document.getElementById('merge-confirm'),
};

// ========================================================
// Translation Helper
// ========================================================

function t(key) {
  return window.graphAPI?.t?.(key) || key;
}

function tFormat(key, values) {
  return window.graphAPI?.tFormat?.(key, values) || key;
}

// ========================================================
// Web Worker Management
// ========================================================

/**
 * Initialize the similarity calculation web worker
 */
function initWorker() {
  if (similarLinksState.worker) {
    return; // Already initialized
  }

  try {
    similarLinksState.worker = new Worker('/js/similarity-worker.js');

    similarLinksState.worker.onmessage = function(e) {
      const { type } = e.data;

      switch (type) {
        case 'ready':
          console.log('[Similar Links] Worker ready');
          similarLinksState.workerReady = true;
          break;

        case 'progress':
          handleWorkerProgress(e.data);
          break;

        case 'result':
          handleWorkerResult(e.data);
          break;

        case 'error':
          handleWorkerError(e.data);
          break;
      }
    };

    similarLinksState.worker.onerror = function(error) {
      console.error('[Similar Links] Worker error:', error);
      similarLinksState.workerReady = false;
      // Fallback to server-side analysis
      showToast(t('similar_links_worker_error'));
    };

  } catch (error) {
    console.warn('[Similar Links] Web Worker not supported, falling back to server-side analysis');
    similarLinksState.worker = null;
  }
}

/**
 * Handle progress updates from worker
 */
function handleWorkerProgress(data) {
  const { percent, phase, totalLinks } = data;
  similarLinksState.analysisProgress = percent;
  updateProgressUI(percent, phase, totalLinks);
}

/**
 * Handle final result from worker
 */
function handleWorkerResult(data) {
  const { clusters, totalDanglingLinks } = data;
  console.log('[Similar Links] Worker result:', {
    clusters: clusters.length,
    totalDanglingLinks
  });

  similarLinksState.clusters = clusters;
  similarLinksState.isLoading = false;
  hideLoadingState();
  renderClusters();
}

/**
 * Handle worker error
 */
function handleWorkerError(data) {
  console.error('[Similar Links] Worker error:', data.error);
  similarLinksState.isLoading = false;
  hideLoadingState();
  showToast(t('similar_links_error'));
  showEmptyState();
}

/**
 * Terminate the worker (cleanup)
 */
function terminateWorker() {
  if (similarLinksState.worker) {
    similarLinksState.worker.terminate();
    similarLinksState.worker = null;
    similarLinksState.workerReady = false;
  }
}

// ========================================================
// Panel Toggle
// ========================================================

function openPanel() {
  console.log('[Similar Links] Opening panel...');
  console.log('[Similar Links] slElements.panel:', slElements.panel);
  console.log('[Similar Links] slElements.toggle:', slElements.toggle);

  similarLinksState.isPanelOpen = true;
  if (slElements.panel) {
    slElements.panel.hidden = false;
  } else {
    console.error('[Similar Links] Panel element is null!');
  }
  if (slElements.toggle) {
    slElements.toggle.classList.add('filter-btn--active');
  }

  // Initialize worker on first open
  if (!similarLinksState.worker) {
    initWorker();
  }

  // Auto-analyze on first open if no clusters
  if (similarLinksState.clusters.length === 0) {
    analyzeSimilarLinks();
  }
}

function closePanel() {
  console.log('[Similar Links] Closing panel...');
  similarLinksState.isPanelOpen = false;
  if (slElements.panel) {
    slElements.panel.hidden = true;
  }
  if (slElements.toggle) {
    slElements.toggle.classList.remove('filter-btn--active');
  }

  // Clear cluster highlighting
  clearClusterHighlight();
}

function togglePanel() {
  console.log('[Similar Links] togglePanel called, isPanelOpen:', similarLinksState.isPanelOpen);
  if (similarLinksState.isPanelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

// ========================================================
// API Calls
// ========================================================

/**
 * Fetch dangling links from the server and analyze them
 */
async function analyzeSimilarLinks() {
  console.log('[Similar Links] analyzeSimilarLinks called');
  if (similarLinksState.isLoading) {
    console.log('[Similar Links] Already loading, skipping');
    return;
  }

  similarLinksState.isLoading = true;
  similarLinksState.analysisProgress = 0;
  showLoadingState();

  try {
    const threshold = similarLinksState.threshold;

    // Check if we should use web worker (client-side analysis)
    if (similarLinksState.worker && similarLinksState.workerReady) {
      // Fetch raw dangling links data
      console.log('[Similar Links] Fetching dangling links for worker analysis...');
      const response = await fetch('/api/dangling-links');

      if (!response.ok) {
        throw new Error('Failed to fetch dangling links');
      }

      const data = await response.json();
      const danglingLinks = data.danglingLinks || [];

      console.log('[Similar Links] Sending', danglingLinks.length, 'dangling links to worker');

      // Send to worker for analysis
      similarLinksState.worker.postMessage({
        type: 'analyze',
        danglingLinks,
        options: {
          threshold,
          minClusterSize: 2,
          maxResults: 50
        }
      });

      // Result will be handled by worker message handler
      return;
    }

    // Fallback: server-side analysis
    console.log('[Similar Links] Fetching /api/similar-links?threshold=' + threshold);
    const response = await fetch(`/api/similar-links?threshold=${threshold}`);
    console.log('[Similar Links] Response status:', response.status);

    if (!response.ok) {
      throw new Error('Failed to fetch similar links');
    }

    const data = await response.json();
    console.log('[Similar Links] Data received:', data);
    console.log('[Similar Links] Total dangling links:', data.totalDanglingLinks || 0);
    console.log('[Similar Links] Clusters in response:', data.clusters?.length || 0);
    similarLinksState.clusters = data.clusters || [];

    renderClusters();
  } catch (error) {
    console.error('[Similar Links] Error analyzing similar links:', error);
    showToast(t('similar_links_error'));
    showEmptyState();
  } finally {
    similarLinksState.isLoading = false;
    hideLoadingState();
  }
}

/**
 * Cancel ongoing analysis
 */
function cancelAnalysis() {
  if (similarLinksState.worker && similarLinksState.isLoading) {
    similarLinksState.worker.postMessage({ type: 'cancel' });
    similarLinksState.isLoading = false;
    hideLoadingState();
  }
}

async function mergeClusters(clusterId, targetName, memberTargets, preserveAlias) {
  try {
    const response = await fetch('/api/similar-links/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clusterId,
        newTarget: targetName,
        oldTargets: memberTargets,
        preserveAsAlias: preserveAlias,
      }),
    });

    if (!response.ok) {
      throw new Error('Merge failed');
    }

    const result = await response.json();

    // Show success toast
    showToast(tFormat('similar_links_merge_success', {
      links: result.linksReplaced,
      files: result.filesModified,
    }));

    // Refresh the analysis
    await analyzeSimilarLinks();

    // Refresh the graph
    if (window.graphAPI?.loadFullGraph) {
      // Reload graph data to reflect the changes
      window.location.reload();
    }

    return result;
  } catch (error) {
    console.error('Error merging clusters:', error);
    showToast(t('similar_links_merge_error'));
    throw error;
  }
}

// ========================================================
// Rendering
// ========================================================

function showLoadingState() {
  // Create progress bar if it doesn't exist
  let progressContainer = slElements.loadingState.querySelector('.progress-container');
  if (!progressContainer) {
    progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <div class="progress-info">
        <span class="progress-text">0%</span>
        <span class="progress-phase" data-i18n="similar_links_analyzing">${t('similar_links_analyzing')}</span>
      </div>
      <button class="progress-cancel-btn" title="${t('similar_links_cancel')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Add cancel button handler
    const cancelBtn = progressContainer.querySelector('.progress-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', cancelAnalysis);
    }

    slElements.loadingState.appendChild(progressContainer);
  }

  slElements.loadingState.hidden = false;
  slElements.emptyState.hidden = true;
  slElements.clustersContainer.innerHTML = '';
}

function hideLoadingState() {
  slElements.loadingState.hidden = true;
}

function updateProgressUI(percent, phase, totalLinks) {
  const progressContainer = slElements.loadingState.querySelector('.progress-container');
  if (!progressContainer) return;

  const progressFill = progressContainer.querySelector('.progress-fill');
  const progressText = progressContainer.querySelector('.progress-text');
  const progressPhase = progressContainer.querySelector('.progress-phase');

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }

  if (progressText) {
    progressText.textContent = `${percent}%`;
  }

  if (progressPhase) {
    let phaseText = '';
    switch (phase) {
      case 'starting':
        phaseText = tFormat('similar_links_progress_starting', { count: totalLinks || 0 });
        break;
      case 'calculating':
        phaseText = t('similar_links_progress_calculating');
        break;
      case 'clustering':
        phaseText = t('similar_links_progress_clustering');
        break;
      default:
        phaseText = t('similar_links_analyzing');
    }
    progressPhase.textContent = phaseText;
  }
}

function showEmptyState() {
  slElements.emptyState.hidden = false;
  slElements.clustersContainer.innerHTML = '';
}

function renderClusters() {
  console.log('[Similar Links] renderClusters called, clusters:', similarLinksState.clusters.length);
  if (similarLinksState.clusters.length === 0) {
    console.log('[Similar Links] No clusters found, showing empty state');
    showEmptyState();
    return;
  }

  console.log('[Similar Links] Rendering', similarLinksState.clusters.length, 'clusters');
  slElements.emptyState.hidden = true;
  slElements.clustersContainer.innerHTML = '';

  similarLinksState.clusters.forEach((cluster, index) => {
    const clusterEl = createClusterCard(cluster, index);
    slElements.clustersContainer.appendChild(clusterEl);
  });
}

function createClusterCard(cluster, index) {
  const color = CLUSTER_COLORS[index % CLUSTER_COLORS.length];
  const card = document.createElement('div');
  card.className = 'cluster-card';
  card.dataset.clusterId = cluster.id;
  card.style.setProperty('--cluster-color', color);

  // Header with representative and stats
  const header = document.createElement('div');
  header.className = 'cluster-card__header';
  header.innerHTML = `
    <div class="cluster-card__color-indicator" style="background: ${color}"></div>
    <div class="cluster-card__info">
      <span class="cluster-card__representative">${escapeHtml(cluster.representativeTarget)}</span>
      <span class="cluster-card__badge">${t('similar_links_recommended')}</span>
    </div>
    <span class="cluster-card__count">${cluster.totalOccurrences}${t('similar_links_occurrences')}</span>
  `;

  // Members list
  const members = document.createElement('div');
  members.className = 'cluster-card__members';

  cluster.members.forEach(member => {
    const isRepresentative = member.target === cluster.representativeTarget;
    const memberEl = document.createElement('div');
    memberEl.className = `cluster-card__member ${isRepresentative ? 'cluster-card__member--representative' : ''}`;

    const similarity = Math.round(member.similarity * 100);
    const sourceCount = member.sources.reduce((sum, s) => sum + s.count, 0);

    memberEl.innerHTML = `
      <span class="cluster-card__member-target">${escapeHtml(member.target)}</span>
      <span class="cluster-card__member-stats">
        ${!isRepresentative ? `<span class="cluster-card__similarity">${similarity}%</span>` : ''}
        <span class="cluster-card__source-count">${sourceCount}</span>
      </span>
    `;

    // Keyboard accessibility for cluster member
    memberEl.setAttribute('tabindex', '0');
    memberEl.setAttribute('role', 'button');
    memberEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        highlightClusterNodes(cluster, color);
      }
    });

    // Click to focus on nodes with this target
    memberEl.addEventListener('click', () => {
      highlightClusterNodes(cluster, color);
    });

    members.appendChild(memberEl);
  });

  // Actions
  const actions = document.createElement('div');
  actions.className = 'cluster-card__actions';

  const mergeBtn = document.createElement('button');
  mergeBtn.className = 'cluster-card__merge-btn';
  mergeBtn.setAttribute('aria-label', `Merge to ${cluster.representativeTarget}`);
  mergeBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M8 12h8"/>
      <path d="M12 8v8"/>
    </svg>
    <span>${t('similar_links_merge')}</span>
  `;
  mergeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openMergeModal(cluster);
  });

  actions.appendChild(mergeBtn);

  // Assemble card
  card.appendChild(header);
  card.appendChild(members);
  card.appendChild(actions);

  // Hover to highlight nodes
  card.addEventListener('mouseenter', () => {
    highlightClusterNodes(cluster, color);
  });

  card.addEventListener('mouseleave', () => {
    if (!similarLinksState.highlightedClusterId) {
      clearClusterHighlight();
    }
  });

  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================================
// Merge Modal
// ========================================================

function openMergeModal(cluster) {
  similarLinksState.pendingMerge = cluster;

  const memberCount = cluster.members.length;
  slElements.mergeMessage.textContent = tFormat('similar_links_merge_confirm', {
    count: memberCount,
    target: cluster.representativeTarget,
  });

  slElements.mergeModal.hidden = false;
  slElements.mergePreserveAlias.checked = true;

  // Focus management: move focus to confirm button for accessibility
  setTimeout(() => slElements.mergeConfirmBtn?.focus(), 100);
}

function closeMergeModal() {
  similarLinksState.pendingMerge = null;
  slElements.mergeModal.hidden = true;
}

async function confirmMerge() {
  const cluster = similarLinksState.pendingMerge;
  if (!cluster) return;

  const preserveAlias = slElements.mergePreserveAlias.checked;
  const memberTargets = cluster.members
    .filter(m => m.target !== cluster.representativeTarget)
    .map(m => m.target);

  closeMergeModal();

  try {
    await mergeClusters(
      cluster.id,
      cluster.representativeTarget,
      memberTargets,
      preserveAlias
    );
  } catch (error) {
    // Error already handled in mergeClusters
  }
}

// ========================================================
// Graph Highlighting
// ========================================================

function highlightClusterNodes(cluster, color) {
  if (!window.graphAPI) return;

  // Get all dangling node IDs that belong to this cluster
  const danglingIds = cluster.members.map(m => `dangling:${m.target}`);

  // Call graphAPI to highlight nodes
  if (window.graphAPI.highlightClusterNodes) {
    window.graphAPI.highlightClusterNodes(danglingIds, color);
  }
}

function clearClusterHighlight() {
  if (window.graphAPI?.clearClusterHighlight) {
    window.graphAPI.clearClusterHighlight();
  }
}

// ========================================================
// Toast
// ========================================================

function showToast(message) {
  if (window.graphAPI?.showToast) {
    // Use the graph's toast function if available
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (toast && toastMessage) {
      toastMessage.textContent = message;
      toast.hidden = false;
      toast.classList.add('toast--visible');
      setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => {
          toast.hidden = true;
        }, 300);
      }, 3000);
    }
  }
}

// ========================================================
// Event Listeners
// ========================================================

function initSimilarLinks() {
  console.log('[Similar Links] Initializing...');

  // Re-query elements in case DOM wasn't ready
  const toggle = document.getElementById('similar-links-toggle');
  const closeBtn = document.getElementById('close-similar-links');
  const analyzeBtn = document.getElementById('analyze-similar-links');
  const thresholdSlider = document.getElementById('similarity-threshold');
  const mergeCancelBtn = document.getElementById('merge-cancel');
  const mergeConfirmBtn = document.getElementById('merge-confirm');
  const mergeModal = document.getElementById('merge-modal');

  console.log('[Similar Links] Toggle button found:', !!toggle);
  console.log('[Similar Links] Panel found:', !!slElements.panel);

  // Panel toggle
  if (toggle) {
    toggle.addEventListener('click', (e) => {
      console.log('[Similar Links] Button clicked!');
      e.stopPropagation(); // Prevent controls.js from interfering
      togglePanel();
    });
    console.log('[Similar Links] Click handler attached');
  } else {
    console.error('[Similar Links] Toggle button not found!');
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Threshold slider
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      if (slElements.thresholdValue) {
        slElements.thresholdValue.textContent = `${value}%`;
      }
      similarLinksState.threshold = value / 100;
    });
  }

  // Analyze button
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeSimilarLinks);
  }

  // Modal
  if (mergeCancelBtn) {
    mergeCancelBtn.addEventListener('click', closeMergeModal);
  }

  if (mergeConfirmBtn) {
    mergeConfirmBtn.addEventListener('click', confirmMerge);
  }

  // Close modal on backdrop click
  if (mergeModal) {
    const backdrop = mergeModal.querySelector('.merge-modal__backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeMergeModal);
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // S key to toggle similar links panel (when not in search)
    if (e.key === 's' || e.key === 'S') {
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        togglePanel();
      }
    }

    // ESC to close modal or panel
    if (e.key === 'Escape') {
      if (mergeModal && !mergeModal.hidden) {
        closeMergeModal();
      } else if (similarLinksState.isPanelOpen) {
        closePanel();
      }
    }
  });

  // Add progress bar styles dynamically
  addProgressStyles();
}

/**
 * Add CSS styles for progress bar dynamically
 */
function addProgressStyles() {
  const styleId = 'similar-links-progress-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Progress Container */
    .progress-container {
      width: 100%;
      padding: var(--sp-3) 0;
    }

    .progress-bar {
      width: 100%;
      height: 6px;
      background: var(--surface-3);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: var(--sp-2);
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary), #e0b588);
      border-radius: 3px;
      transition: width 0.3s ease-out;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .progress-text {
      font-family: var(--font-mono);
      color: var(--accent-primary);
      font-weight: 500;
    }

    .progress-phase {
      color: var(--text-muted);
    }

    .progress-cancel-btn {
      position: absolute;
      top: var(--sp-2);
      right: var(--sp-2);
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease);
    }

    .progress-cancel-btn:hover {
      background: var(--surface-3);
      color: var(--text-primary);
    }

    .similar-links-panel__loading {
      position: relative;
    }
  `;
  document.head.appendChild(style);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSimilarLinks);
} else {
  initSimilarLinks();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  terminateWorker();
});

// ========================================================
// Public API
// ========================================================

window.similarLinksAPI = {
  togglePanel,
  openPanel,
  closePanel,
  analyzeSimilarLinks,
  cancelAnalysis,
  getState: () => ({ ...similarLinksState }),
  getClusterColors: () => CLUSTER_COLORS,
};
