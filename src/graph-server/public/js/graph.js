/**
 * GigaMind Knowledge Graph — Neural Observatory
 * D3.js Force-Directed Graph with refined interactions
 */

// ═══════════════════════════════════════════════════════════════════════════
// State Management
// ═══════════════════════════════════════════════════════════════════════════

const state = {
  nodes: [],
  links: [],
  stats: null,
  fullGraphData: null,
  focusedNodeId: null,
  selectedNodeId: null,
  simulation: null,
  svg: null,
  g: null,
  zoom: null,
  currentZoomLevel: 1,
  currentTransform: null,
  labelsVisible: false,
  filters: {
    note: true,
    orphan: true,
    dangling: true,
  },
  minimapBounds: null, // Stores minimap coordinate mapping info
  // Progressive loading state
  loading: {
    isLoading: false,
    loadedNodeIds: new Set(),
    currentOffset: 0,
    pageSize: 100,
    totalNodes: 0,
    hasMore: true,
    isFullGraphLoaded: false,
  },
  // i18n translations
  i18n: {
    locale: 'en',
    translations: {},
  },
  // Pinned nodes - Map of nodeId -> {fx, fy}
  pinnedNodes: new Map(),
};

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the computed value of a CSS custom property
 * @param {string} name - CSS variable name (e.g., '--minimap-link')
 * @returns {string} The computed value
 */
function getCSSVariable(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Update minimap colors when theme changes
 */
function updateMinimapColors() {
  updateMinimap();
}

const CONFIG = {
  node: {
    minRadius: 4,
    maxRadius: 18,
    baseRadius: 6,
  },
  force: {
    linkDistance: 100,
    chargeStrength: -180,
    collideRadius: 25,
    centerStrength: 0.03,
  },
  zoom: {
    min: 0.1,
    max: 5,
    highThreshold: 1.8,
  },
  animation: {
    duration: 300,
    alphaRestart: 0.3, // Gentler restart
    alphaCool: 0.4,    // Faster cooling for stability
  },
  minimap: {
    width: 180,
    height: 120,
    padding: 10,
  },
  accessibility: {
    // Index of currently focused node for keyboard navigation
    focusedNodeIndex: -1,
    // ID of the last navigated node for connection traversal
    lastNavigatedNodeId: null,
    // Whether reduced motion is preferred
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Touch Device Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect touch device and add appropriate class to body
 * Enables touch-specific CSS optimizations
 */
function detectTouchDevice() {
  const isTouchDevice = (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0)
  );

  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasNoHover = window.matchMedia('(hover: none)').matches;

  if (isTouchDevice || (isCoarsePointer && hasNoHover)) {
    document.body.classList.add('touch-device');
  }

  // Also detect hybrid devices (like Surface)
  if (isCoarsePointer && !hasNoHover) {
    document.body.classList.add('hybrid-device');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Internationalization (i18n)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load translations from the server
 */
async function loadI18n() {
  try {
    const response = await fetch('/api/i18n');
    if (response.ok) {
      const data = await response.json();
      state.i18n.locale = data.locale;
      state.i18n.translations = data.translations;
      applyI18nToDOM();
    }
  } catch (error) {
    console.warn('Failed to load i18n:', error);
    // Continue with default English text
  }
}

/**
 * Get translated string
 */
function t(key) {
  return state.i18n.translations[key] || key;
}

/**
 * Apply translations to DOM elements with data-i18n attribute
 */
function applyI18nToDOM() {
  // Translate text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = state.i18n.translations[key];
    if (translation) {
      // For title element, set document.title as well
      if (el.tagName === 'TITLE') {
        document.title = translation;
      }
      el.textContent = translation;
    }
  });

  // Translate placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = state.i18n.translations[key];
    if (translation) {
      el.placeholder = translation;
    }
  });

  // Translate title attributes (tooltips)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translation = state.i18n.translations[key];
    if (translation) {
      el.title = translation;
    }
  });

  // Translate aria-label attributes
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    const translation = state.i18n.translations[key];
    if (translation) {
      el.setAttribute('aria-label', translation);
    }
  });
}

/**
 * Format a translation template with values
 * e.g., "Showing {{loaded}} of {{total}} nodes" with {loaded: 5, total: 10}
 */
function tFormat(key, values) {
  let template = state.i18n.translations[key] || key;
  if (values) {
    Object.keys(values).forEach(k => {
      template = template.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), values[k]);
    });
  }
  return template;
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine the error type and return appropriate user-friendly message
 * @param {Error} error - The error object
 * @param {Response} [response] - Optional fetch response for status codes
 * @returns {Object} Object with messageKey and detailedError
 */
function categorizeError(error, response = null) {
  let messageKey = 'error_network';
  let detailedError = error.toString();

  if (response) {
    // Server error (5xx)
    if (response.status >= 500) {
      messageKey = 'error_server';
      detailedError = `Server Error (${response.status}): ${response.statusText}`;
    }
    // Client error (4xx)
    else if (response.status >= 400) {
      messageKey = 'error_not_found';
      detailedError = `Request Error (${response.status}): ${response.statusText}`;
    }
  } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
    messageKey = 'error_network';
    detailedError = 'Network connection failed. Please check your internet connection.';
  } else if (error.name === 'SyntaxError') {
    messageKey = 'error_parse';
    detailedError = 'Failed to parse server response. The data may be corrupted.';
  } else if (error.name === 'AbortError') {
    messageKey = 'error_timeout';
    detailedError = 'Request timed out. Please try again.';
  }

  return { messageKey, detailedError };
}

/**
 * Show error state UI
 * @param {Error} error - The error object
 * @param {Response} [response] - Optional fetch response
 */
function showError(error, response = null) {
  const loadingContent = document.getElementById('loading-content');
  const loadingError = document.getElementById('loading-error');
  const errorMessage = document.getElementById('error-message');
  const errorDetails = document.getElementById('error-details');

  if (!loadingContent || !loadingError) return;

  // Categorize the error
  const { messageKey, detailedError } = categorizeError(error, response);

  // Hide loading content, show error state
  loadingContent.hidden = true;
  loadingError.hidden = false;

  // Set error message (translated if available)
  const translatedMessage = t(messageKey);
  errorMessage.textContent = translatedMessage !== messageKey
    ? translatedMessage
    : getDefaultErrorMessage(messageKey);

  // Set error details
  errorDetails.textContent = detailedError;
  errorDetails.hidden = true; // Start hidden

  // Announce to screen readers
  announceToScreenReader(t('sr_error_occurred') || 'An error occurred while loading the graph');
}

/**
 * Get default error message if translation is not available
 * @param {string} messageKey - The error message key
 * @returns {string} Default error message
 */
function getDefaultErrorMessage(messageKey) {
  const defaults = {
    error_network: 'Unable to connect to server. Please check your connection.',
    error_server: 'Server error occurred. Please try again later.',
    error_not_found: 'The requested resource was not found.',
    error_parse: 'Failed to process server response.',
    error_timeout: 'Request timed out. Please try again.',
  };
  return defaults[messageKey] || 'An unexpected error occurred.';
}

/**
 * Hide error state and show loading content
 */
function hideError() {
  const loadingContent = document.getElementById('loading-content');
  const loadingError = document.getElementById('loading-error');
  const errorDetails = document.getElementById('error-details');

  if (!loadingContent || !loadingError) return;

  loadingError.hidden = true;
  loadingContent.hidden = false;

  // Reset error details
  if (errorDetails) {
    errorDetails.hidden = true;
  }
}

/**
 * Toggle error details visibility
 */
function toggleErrorDetails() {
  const errorDetails = document.getElementById('error-details');
  const detailsBtn = document.getElementById('error-details-btn');

  if (!errorDetails || !detailsBtn) return;

  const isHidden = errorDetails.hidden;
  errorDetails.hidden = !isHidden;

  // Update button text
  detailsBtn.textContent = isHidden
    ? (t('error_hide_details') || 'Hide Details')
    : (t('error_show_details') || 'Show Details');
}

/**
 * Initialize error UI event listeners
 */
function initErrorHandlers() {
  const retryBtn = document.getElementById('retry-btn');
  const detailsBtn = document.getElementById('error-details-btn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      hideError();
      initGraph();
    });
  }

  if (detailsBtn) {
    detailsBtn.addEventListener('click', toggleErrorDetails);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

async function initGraph() {
  try {
    // Detect touch device and add appropriate class
    detectTouchDevice();

    // Load i18n translations first
    await loadI18n();

    // Fetch initial page with most connected nodes (hubs) first
    const response = await fetch(`/api/graph?limit=${state.loading.pageSize}&sort=connections`);

    // Handle HTTP errors with response context
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      showError(error, response);
      return;
    }

    const data = await response.json();

    // Initialize fullGraphData with first page
    state.fullGraphData = {
      nodes: [...data.nodes],
      links: [...data.links],
      stats: data.stats,
    };
    state.nodes = [...data.nodes];
    state.links = [...data.links];
    state.stats = data.stats;

    // Update loading state from pagination info
    if (data.pagination) {
      state.loading.currentOffset = data.pagination.offset + data.pagination.limit;
      state.loading.totalNodes = data.pagination.total;
      state.loading.hasMore = data.pagination.hasMore;

      // Track loaded node IDs
      data.nodes.forEach(n => state.loading.loadedNodeIds.add(n.id));
    } else {
      // No pagination = full graph returned
      state.loading.hasMore = false;
      state.loading.isFullGraphLoaded = true;
      state.loading.totalNodes = data.nodes.length;
    }

    updateStats(data.stats);
    updateLoadingProgress();
    initSVG();
    initSimulation();
    renderGraph();
    initMinimap();
    initLoadMoreUI();
    initEmptyStateUI();

    // Check for empty state after data is loaded
    checkEmptyState();

    // Staggered reveal
    setTimeout(() => {
      document.getElementById('loading').hidden = true;
    }, 300);
  } catch (error) {
    console.error('Failed to initialize graph:', error);
    showError(error);
  }
}

/**
 * Load more nodes progressively
 */
async function loadMoreNodes() {
  if (state.loading.isLoading || !state.loading.hasMore || state.loading.isFullGraphLoaded) {
    return;
  }

  state.loading.isLoading = true;
  showLoadingIndicator(true);

  try {
    const response = await fetch(
      `/api/graph?limit=${state.loading.pageSize}&offset=${state.loading.currentOffset}&sort=connections`
    );
    if (!response.ok) throw new Error('Failed to fetch more nodes');

    const data = await response.json();

    // Filter out already loaded nodes
    const newNodes = data.nodes.filter(n => !state.loading.loadedNodeIds.has(n.id));

    // Add new nodes to tracking
    newNodes.forEach(n => state.loading.loadedNodeIds.add(n.id));

    // Merge new nodes into fullGraphData
    state.fullGraphData.nodes.push(...newNodes);

    // Add links where both source and target are now loaded
    const allLoadedIds = state.loading.loadedNodeIds;
    const newLinks = data.links.filter(l => {
      const sourceId = l.source.id || l.source;
      const targetId = l.target.id || l.target;
      return allLoadedIds.has(sourceId) && allLoadedIds.has(targetId);
    });

    // Filter out duplicate links
    const existingLinkKeys = new Set(
      state.fullGraphData.links.map(l => `${l.source.id || l.source}-${l.target.id || l.target}`)
    );
    const uniqueNewLinks = newLinks.filter(l => {
      const key = `${l.source.id || l.source}-${l.target.id || l.target}`;
      return !existingLinkKeys.has(key);
    });

    state.fullGraphData.links.push(...uniqueNewLinks);

    // Update pagination state
    if (data.pagination) {
      state.loading.currentOffset = data.pagination.offset + data.pagination.limit;
      state.loading.hasMore = data.pagination.hasMore;
    } else {
      state.loading.hasMore = false;
    }

    // Apply filters and update display
    applyFilters();

    // Re-bind simulation data
    state.simulation.nodes(state.nodes);
    state.simulation.force('link').links(state.links);
    state.simulation.alpha(0.2).restart();

    renderGraph();
    updateLoadingProgress();
    updateMinimap();

  } catch (error) {
    console.error('Failed to load more nodes:', error);
  } finally {
    state.loading.isLoading = false;
    showLoadingIndicator(false);
  }
}

/**
 * Load the complete graph at once
 */
async function loadFullGraph() {
  if (state.loading.isLoading || state.loading.isFullGraphLoaded) {
    return;
  }

  state.loading.isLoading = true;
  showLoadingIndicator(true, t('loading_full_graph'));

  try {
    const response = await fetch('/api/graph?all=true');
    if (!response.ok) throw new Error('Failed to fetch full graph');

    const data = await response.json();

    // Replace fullGraphData with complete data
    state.fullGraphData = {
      nodes: [...data.nodes],
      links: [...data.links],
      stats: data.stats,
    };

    // Update loading state
    state.loading.isFullGraphLoaded = true;
    state.loading.hasMore = false;
    state.loading.totalNodes = data.nodes.length;
    state.loading.loadedNodeIds = new Set(data.nodes.map(n => n.id));

    // Apply filters and update display
    applyFilters();

    // Re-bind simulation data
    state.simulation.nodes(state.nodes);
    state.simulation.force('link').links(state.links);
    state.simulation.alpha(0.3).restart();

    renderGraph();
    updateLoadingProgress();
    updateMinimap();
    updateLoadMoreUI();

  } catch (error) {
    console.error('Failed to load full graph:', error);
  } finally {
    state.loading.isLoading = false;
    showLoadingIndicator(false);
  }
}

/**
 * Show/hide the loading indicator
 */
function showLoadingIndicator(show, message = null) {
  const defaultMessage = t('loading_more_nodes') || 'Loading more nodes...';
  let indicator = document.getElementById('progressive-loading-indicator');

  if (show) {
    const displayMessage = message || defaultMessage;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'progressive-loading-indicator';
      indicator.className = 'progressive-loading';
      indicator.innerHTML = `
        <div class="progressive-loading__spinner"></div>
        <span class="progressive-loading__text">${displayMessage}</span>
      `;
      document.body.appendChild(indicator);
    } else {
      indicator.querySelector('.progressive-loading__text').textContent = displayMessage;
    }
    indicator.hidden = false;
  } else if (indicator) {
    indicator.hidden = true;
  }
}

/**
 * Update the loading progress display in header stats
 */
function updateLoadingProgress() {
  const loadedCount = state.loading.loadedNodeIds.size;
  const totalCount = state.loading.totalNodes;

  // Update the nodes stat to show "X of Y" format
  const statNotesEl = document.getElementById('stat-notes');
  if (statNotesEl && totalCount > 0 && !state.loading.isFullGraphLoaded) {
    statNotesEl.textContent = loadedCount;

    // Add or update the "of total" indicator
    let ofTotalEl = document.getElementById('stat-notes-total');
    if (!ofTotalEl) {
      ofTotalEl = document.createElement('span');
      ofTotalEl.id = 'stat-notes-total';
      ofTotalEl.className = 'header__stat-total';
      statNotesEl.parentNode.appendChild(ofTotalEl);
    }
    ofTotalEl.textContent = ` / ${totalCount}`;
    ofTotalEl.hidden = false;
  } else if (state.loading.isFullGraphLoaded) {
    // Hide the "of total" when full graph is loaded
    const ofTotalEl = document.getElementById('stat-notes-total');
    if (ofTotalEl) {
      ofTotalEl.hidden = true;
    }
  }
}

/**
 * Initialize the Load More UI
 */
function initLoadMoreUI() {
  updateLoadMoreUI();
}

/**
 * Update the Load More button state
 */
function updateLoadMoreUI() {
  const loadMoreBar = document.getElementById('load-more-bar');
  if (!loadMoreBar) return;

  const loadMoreBtn = document.getElementById('load-more-btn');
  const loadAllBtn = document.getElementById('load-all-btn');
  const progressText = document.getElementById('load-progress-text');

  if (state.loading.isFullGraphLoaded || !state.loading.hasMore) {
    loadMoreBar.hidden = true;
  } else {
    loadMoreBar.hidden = false;

    const loaded = state.loading.loadedNodeIds.size;
    const total = state.loading.totalNodes;
    progressText.textContent = tFormat('load_progress', { loaded, total });

    loadMoreBtn.disabled = state.loading.isLoading;
    loadAllBtn.disabled = state.loading.isLoading;
  }
}

function initSVG() {
  const svg = d3.select('#graph-canvas');
  const width = window.innerWidth;
  const height = window.innerHeight;

  svg.selectAll('*').remove();

  const defs = svg.append('defs');

  // Glow filter
  const glowFilter = defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');

  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '2.5')
    .attr('result', 'coloredBlur');

  const feMerge = glowFilter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Arrow marker for link direction
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L10,0L0,4')
    .attr('class', 'link-arrow');

  defs.append('marker')
    .attr('id', 'arrow-hover')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L10,0L0,4')
    .attr('fill', 'var(--link-hover)');

  // Colorblind accessibility patterns
  // Orphan node pattern: diagonal hatching for visual distinction
  const orphanPattern = defs.append('pattern')
    .attr('id', 'orphan-hatch')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 6)
    .attr('height', 6)
    .attr('patternTransform', 'rotate(45)');

  orphanPattern.append('rect')
    .attr('width', 6)
    .attr('height', 6)
    .attr('fill', 'var(--node-orphan)');

  orphanPattern.append('line')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', 6)
    .attr('stroke', 'var(--node-orphan-pattern-line)')
    .attr('stroke-width', 2);

  // Inner circle pattern for orphan nodes (dotted border effect)
  const orphanDotPattern = defs.append('pattern')
    .attr('id', 'orphan-dots')
    .attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 4)
    .attr('height', 4);

  orphanDotPattern.append('circle')
    .attr('cx', 2)
    .attr('cy', 2)
    .attr('r', 1)
    .attr('fill', 'var(--surface-2)');

  // Main container
  state.g = svg.append('g').attr('class', 'graph-container');
  state.g.append('g').attr('class', 'links-group');
  state.g.append('g').attr('class', 'nodes-group');

  // Zoom behavior with auto-load on zoom out
  let lastZoomLevel = 1;
  state.zoom = d3.zoom()
    .scaleExtent([CONFIG.zoom.min, CONFIG.zoom.max])
    .on('zoom', (event) => {
      state.g.attr('transform', event.transform);
      state.currentZoomLevel = event.transform.k;
      state.currentTransform = event.transform;

      svg.classed('zoom-high', event.transform.k > CONFIG.zoom.highThreshold);
      updateZoomDisplay();
      updateMinimap();

      // Auto-load more nodes when zooming out significantly
      if (event.transform.k < lastZoomLevel * 0.6 && event.transform.k < 0.5) {
        if (state.loading.hasMore && !state.loading.isLoading && !state.loading.isFullGraphLoaded) {
          loadMoreNodes();
        }
      }
      lastZoomLevel = event.transform.k;
    });

  svg.call(state.zoom);

  // Initial centering
  const initialTransform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(0.8);
  svg.call(state.zoom.transform, initialTransform);
  state.currentTransform = initialTransform;

  state.svg = svg;
}

function initSimulation() {
  state.simulation = d3.forceSimulation(state.nodes)
    .force('link', d3.forceLink(state.links)
      .id(d => d.id)
      .distance(CONFIG.force.linkDistance)
    )
    .force('charge', d3.forceManyBody()
      .strength(CONFIG.force.chargeStrength)
    )
    .force('center', d3.forceCenter(0, 0)
      .strength(CONFIG.force.centerStrength)
    )
    .force('collide', d3.forceCollide()
      .radius(d => getNodeRadius(d) + 8)
    )
    .alphaDecay(0.02)
    .velocityDecay(0.4)
    .on('tick', ticked);
}

// ═══════════════════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════════════════

function renderGraph() {
  renderLinks();
  renderNodes();
}

function renderLinks() {
  const linksGroup = state.g.select('.links-group');

  const link = linksGroup.selectAll('.link')
    .data(state.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);

  link.exit()
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 0)
    .remove();

  const linkEnter = link.enter()
    .append('path')
    .attr('class', 'link')
    .attr('marker-end', 'url(#arrow)')
    .style('opacity', 1);

  linkEnter.merge(link)
    .attr('d', linkArc);
}

function renderNodes() {
  const nodesGroup = state.g.select('.nodes-group');

  const node = nodesGroup.selectAll('.node')
    .data(state.nodes, d => d.id);

  node.exit()
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 0)
    .attr('transform', d => `translate(${d.x}, ${d.y}) scale(0)`)
    .remove();

  const nodeEnter = node.enter()
    .append('g')
    .attr('class', d => `node node--${d.type}`)
    .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`)
    .style('opacity', 1)
    // Accessibility attributes for keyboard navigation
    .attr('tabindex', '0')
    .attr('role', 'button')
    .attr('aria-label', d => getNodeAriaLabel(d))
    .call(drag(state.simulation))
    .on('click', handleNodeClick)
    .on('dblclick', handleNodeDoubleClick)
    .on('contextmenu', handleNodeContextMenu)
    .on('mouseenter', handleNodeHover)
    .on('mouseleave', handleNodeLeave)
    // Keyboard event handlers
    .on('keydown', handleNodeKeydown)
    .on('focus', handleNodeFocus)
    .on('blur', handleNodeBlur);

  // Touch hit area - larger invisible circle for touch devices
  // Ensures minimum 44px touch target as per WCAG guidelines
  nodeEnter.append('circle')
    .attr('class', 'node-touch-area')
    .attr('r', d => Math.max(22, getNodeRadius(d) + 12))
    .style('fill', 'transparent')
    .style('stroke', 'none')
    .style('pointer-events', 'all');

  // Visible node circle
  nodeEnter.append('circle')
    .attr('r', d => getNodeRadius(d))
    .attr('filter', 'url(#glow)');

  // Colorblind accessibility: Cross mark for orphan nodes
  // Adds shape differentiation beyond color alone
  nodeEnter.filter(d => d.type === 'orphan')
    .append('g')
    .attr('class', 'node-cross-group')
    .each(function(d) {
      const crossSize = getNodeRadius(d) * 0.5;
      const g = d3.select(this);
      // Horizontal line
      g.append('line')
        .attr('class', 'node-cross')
        .attr('x1', -crossSize)
        .attr('y1', 0)
        .attr('x2', crossSize)
        .attr('y2', 0);
      // Vertical line
      g.append('line')
        .attr('class', 'node-cross')
        .attr('x1', 0)
        .attr('y1', -crossSize)
        .attr('x2', 0)
        .attr('y2', crossSize);
    });

  // Pin indicator (small pin icon)
  nodeEnter.append('path')
    .attr('class', 'node-pin-indicator')
    .attr('d', 'M0,-4L2,-2L2,2L0,4L-2,2L-2,-2Z')
    .attr('transform', d => `translate(${getNodeRadius(d) - 2}, ${-getNodeRadius(d) + 2})`)
    .style('opacity', 0);

  nodeEnter.append('text')
    .attr('class', 'node-label')
    .attr('dy', d => getNodeRadius(d) + 14)
    .attr('text-anchor', 'middle')
    .text(d => truncateTitle(d.title));

  const nodeUpdate = nodeEnter.merge(node);

  nodeUpdate
    .attr('class', d => {
      let classes = `node node--${d.type}`;
      if (d.id === state.focusedNodeId) classes += ' node--focused';
      if (d.id === state.selectedNodeId) classes += ' node--selected';
      if (state.pinnedNodes.has(d.id)) classes += ' node--pinned';
      return classes;
    })
    .attr('aria-label', d => getNodeAriaLabel(d))
    .attr('aria-pressed', d => d.id === state.selectedNodeId ? 'true' : 'false');

  // Update touch hit area
  nodeUpdate.select('.node-touch-area')
    .attr('r', d => Math.max(22, getNodeRadius(d) + 12));

  // Update visible node circle (select second circle, not touch area)
  nodeUpdate.selectAll('circle:not(.node-touch-area)')
    .attr('r', getNodeRadius);

  // Update pin indicator visibility
  nodeUpdate.select('.node-pin-indicator')
    .attr('transform', d => `translate(${getNodeRadius(d) - 2}, ${-getNodeRadius(d) + 2})`)
    .style('opacity', d => state.pinnedNodes.has(d.id) ? 1 : 0);

  nodeUpdate.select('.node-label')
    .attr('dy', d => getNodeRadius(d) + 14)
    .text(d => truncateTitle(d.title));
}

/**
 * Handle right-click context menu on nodes
 */
function handleNodeContextMenu(event, d) {
  event.preventDefault();
  event.stopPropagation();

  // Show context menu via controls API
  if (window.controlsAPI?.contextMenu) {
    window.controlsAPI.contextMenu.show(event, d);
  }
}

function ticked() {
  state.g.selectAll('.link')
    .attr('d', d => {
      // Guard against undefined positions
      if (d.source.x === undefined || d.target.x === undefined) return '';
      return linkArc(d);
    });

  state.g.selectAll('.node')
    .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);

  // Update minimap on tick (throttled by D3)
  if (state.simulation.alpha() > 0.05) {
    updateMinimap();
  }
}

function linkArc(d) {
  const sourceX = d.source.x || 0;
  const sourceY = d.source.y || 0;
  const targetX = d.target.x || 0;
  const targetY = d.target.y || 0;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const dr = Math.sqrt(dx * dx + dy * dy) * 1.2 || 1;
  return `M${sourceX},${sourceY}A${dr},${dr} 0 0,1 ${targetX},${targetY}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Minimap
// ═══════════════════════════════════════════════════════════════════════════

function initMinimap() {
  updateMinimap();
}

function updateMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const { width, height, padding } = CONFIG.minimap;

  // Clear
  ctx.clearRect(0, 0, width, height);

  if (state.nodes.length === 0) return;

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  state.nodes.forEach(node => {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  });

  const graphWidth = maxX - minX || 1;
  const graphHeight = maxY - minY || 1;
  const scale = Math.min(
    (width - 2 * padding) / graphWidth,
    (height - 2 * padding) / graphHeight
  );
  const offsetX = (width - graphWidth * scale) / 2 - minX * scale;
  const offsetY = (height - graphHeight * scale) / 2 - minY * scale;

  // Store bounds for click navigation
  state.minimapBounds = {
    scale,
    offsetX,
    offsetY,
    minX,
    minY,
    graphWidth,
    graphHeight,
    canvasWidth: width,
    canvasHeight: height,
  };

  // Get colors from CSS variables (supports theme switching)
  const linkColor = getCSSVariable('--minimap-link') || 'rgba(124, 156, 188, 0.15)';
  const noteColor = getCSSVariable('--minimap-node-note') || '#7c9cbc';
  const orphanColor = getCSSVariable('--minimap-node-orphan') || '#6c7080';
  const danglingColor = getCSSVariable('--minimap-node-dangling') || '#c4956c';

  // Draw links
  ctx.strokeStyle = linkColor;
  ctx.lineWidth = 0.5;
  state.links.forEach(link => {
    const sx = link.source.x * scale + offsetX;
    const sy = link.source.y * scale + offsetY;
    const tx = link.target.x * scale + offsetX;
    const ty = link.target.y * scale + offsetY;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  });

  // Draw nodes
  state.nodes.forEach(node => {
    const x = node.x * scale + offsetX;
    const y = node.y * scale + offsetY;
    const r = Math.max(1.5, getNodeRadius(node) * scale * 0.5);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (node.type === 'note') {
      ctx.fillStyle = noteColor;
    } else if (node.type === 'orphan') {
      ctx.fillStyle = orphanColor;
    } else {
      ctx.fillStyle = danglingColor;
    }
    ctx.fill();
  });

  // Update viewport indicator
  updateMinimapViewport(scale, offsetX, offsetY, minX, minY, graphWidth, graphHeight);
}

function updateMinimapViewport(scale, offsetX, offsetY, minX, minY, graphWidth, graphHeight) {
  const viewport = document.getElementById('minimap-viewport');
  if (!viewport || !state.currentTransform) return;

  const { width, height } = CONFIG.minimap;
  const canvas = document.getElementById('minimap-canvas');
  const canvasRect = canvas.getBoundingClientRect();

  // Current view bounds in graph coordinates
  const t = state.currentTransform;
  const viewLeft = -t.x / t.k;
  const viewTop = -t.y / t.k;
  const viewWidth = window.innerWidth / t.k;
  const viewHeight = window.innerHeight / t.k;

  // Convert to minimap coordinates
  const vpLeft = viewLeft * scale + offsetX;
  const vpTop = viewTop * scale + offsetY;
  const vpWidth = viewWidth * scale;
  const vpHeight = viewHeight * scale;

  viewport.style.left = `${Math.max(0, vpLeft)}px`;
  viewport.style.top = `${Math.max(28, vpTop + 28)}px`; // Account for header
  viewport.style.width = `${Math.min(width, vpWidth)}px`;
  viewport.style.height = `${Math.min(height, vpHeight)}px`;
}

/**
 * Pan the graph view to center on the clicked minimap position
 * @param {number} minimapX - X coordinate relative to minimap canvas
 * @param {number} minimapY - Y coordinate relative to minimap canvas
 */
function panToMinimapPosition(minimapX, minimapY) {
  if (!state.minimapBounds || !state.svg || !state.zoom) return;

  const bounds = state.minimapBounds;

  // Convert minimap coordinates to graph coordinates
  // minimapX = graphX * scale + offsetX  =>  graphX = (minimapX - offsetX) / scale
  const graphX = (minimapX - bounds.offsetX) / bounds.scale;
  const graphY = (minimapY - bounds.offsetY) / bounds.scale;

  // Get current zoom level to maintain it
  const currentScale = state.currentZoomLevel || 0.8;

  // Calculate the transform to center the clicked point
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  const newTransform = d3.zoomIdentity
    .translate(windowWidth / 2 - graphX * currentScale, windowHeight / 2 - graphY * currentScale)
    .scale(currentScale);

  // Animate the pan
  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.transform, newTransform);
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactions
// ═══════════════════════════════════════════════════════════════════════════

function handleNodeClick(event, d) {
  event.stopPropagation();

  if (state.focusedNodeId === d.id) {
    exitFocusMode();
  } else {
    enterFocusMode(d.id);
  }
}

function handleNodeDoubleClick(event, d) {
  event.stopPropagation();
  showNodeDetails(d);
}

function handleNodeHover(event, d) {
  state.g.selectAll('.link')
    .classed('link--highlighted', link =>
      link.source.id === d.id || link.target.id === d.id
    )
    .attr('marker-end', link =>
      link.source.id === d.id || link.target.id === d.id
        ? 'url(#arrow-hover)'
        : 'url(#arrow)'
    );

  showTooltip(event, d);
}

function handleNodeLeave() {
  state.g.selectAll('.link')
    .classed('link--highlighted', false)
    .attr('marker-end', 'url(#arrow)');

  hideTooltip();
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.2).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);

    // If node is pinned, keep the fixed position
    if (state.pinnedNodes.has(d.id)) {
      d.fx = d.x;
      d.fy = d.y;
      state.pinnedNodes.set(d.id, { fx: d.x, fy: d.y });
    } else {
      d.fx = null;
      d.fy = null;
    }

    // Save state to history
    saveStateToHistory();
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

/**
 * Toggle pin state for a node
 * @param {string} nodeId - ID of the node to toggle
 */
function toggleNodePin(nodeId) {
  const node = state.nodes.find(n => n.id === nodeId) ||
    state.fullGraphData?.nodes.find(n => n.id === nodeId);

  if (!node) return;

  if (state.pinnedNodes.has(nodeId)) {
    // Unpin
    state.pinnedNodes.delete(nodeId);
    node.fx = null;
    node.fy = null;
    node.pinned = false;
    showToast(t('toast_node_unpinned') || 'Node unpinned');
  } else {
    // Pin
    const pos = { fx: node.x, fy: node.y };
    state.pinnedNodes.set(nodeId, pos);
    node.fx = node.x;
    node.fy = node.y;
    node.pinned = true;
    showToast(t('toast_node_pinned') || 'Node pinned');
  }

  // Update visual
  renderGraph();
  updateMinimap();
  saveStateToHistory();
}

/**
 * Check if a node is pinned
 * @param {string} nodeId - ID of the node to check
 * @returns {boolean} True if pinned
 */
function isNodePinned(nodeId) {
  return state.pinnedNodes.has(nodeId);
}

/**
 * Save current state to history for undo/redo
 */
function saveStateToHistory() {
  if (window.controlsAPI?.history) {
    window.controlsAPI.history.push({
      focusedNodeId: state.focusedNodeId,
      pinnedNodes: new Map(state.pinnedNodes),
      transform: state.currentTransform ? {
        x: state.currentTransform.x,
        y: state.currentTransform.y,
        k: state.currentTransform.k
      } : null
    });
  }
}

/**
 * Restore a previous state from history
 * @param {Object} savedState - State object from history
 */
function restoreState(savedState) {
  if (!savedState) return;

  // Restore pinned nodes
  if (savedState.pinnedNodes) {
    state.pinnedNodes = new Map(savedState.pinnedNodes);

    // Apply pinned positions to nodes
    state.nodes.forEach(node => {
      if (state.pinnedNodes.has(node.id)) {
        const pos = state.pinnedNodes.get(node.id);
        node.fx = pos.fx;
        node.fy = pos.fy;
        node.pinned = true;
      } else {
        node.fx = null;
        node.fy = null;
        node.pinned = false;
      }
    });
  }

  // Restore focus mode
  if (savedState.focusedNodeId !== state.focusedNodeId) {
    if (savedState.focusedNodeId) {
      enterFocusMode(savedState.focusedNodeId);
    } else if (state.focusedNodeId) {
      exitFocusMode();
    }
  }

  // Restore transform
  if (savedState.transform && state.svg && state.zoom) {
    const transform = d3.zoomIdentity
      .translate(savedState.transform.x, savedState.transform.y)
      .scale(savedState.transform.k);
    state.svg.transition()
      .duration(CONFIG.animation.duration)
      .call(state.zoom.transform, transform);
  }

  renderGraph();
  updateMinimap();
}

// ═══════════════════════════════════════════════════════════════════════════
// Focus Mode
// ═══════════════════════════════════════════════════════════════════════════

function enterFocusMode(nodeId) {
  state.focusedNodeId = nodeId;

  const focusedNode = state.fullGraphData.nodes.find(n => n.id === nodeId);
  if (focusedNode) {
    document.getElementById('focus-node-name').textContent = focusedNode.title;

    // Update breadcrumb navigation
    if (window.controlsAPI?.focusHistory) {
      window.controlsAPI.focusHistory.push(nodeId, focusedNode.title);
    }

    // Update URL state
    if (window.controlsAPI?.urlState) {
      window.controlsAPI.urlState.update({
        focusedNodeId: nodeId,
        zoom: state.currentZoomLevel
      });
    }
  }

  const connectedIds = new Set([nodeId]);
  state.fullGraphData.links.forEach(link => {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;
    if (sourceId === nodeId) connectedIds.add(targetId);
    if (targetId === nodeId) connectedIds.add(sourceId);
  });

  state.nodes = state.fullGraphData.nodes.filter(n => connectedIds.has(n.id));
  state.links = state.fullGraphData.links.filter(l => {
    const sourceId = l.source.id || l.source;
    const targetId = l.target.id || l.target;
    return connectedIds.has(sourceId) && connectedIds.has(targetId);
  });

  state.simulation.nodes(state.nodes);
  state.simulation.force('link').links(state.links);
  state.simulation.alpha(CONFIG.animation.alphaRestart).restart();

  renderGraph();

  document.getElementById('focus-indicator').hidden = false;

  // Center on focused node with smooth transition
  if (focusedNode && focusedNode.x !== undefined) {
    const transform = d3.zoomIdentity
      .translate(window.innerWidth / 2 - focusedNode.x * 1.5, window.innerHeight / 2 - focusedNode.y * 1.5)
      .scale(1.5);
    state.svg.transition().duration(CONFIG.animation.duration).call(state.zoom.transform, transform);
  }

  // Save state to history
  saveStateToHistory();
}

function exitFocusMode() {
  state.focusedNodeId = null;

  state.nodes = [...state.fullGraphData.nodes];
  state.links = [...state.fullGraphData.links];

  applyFilters();

  state.simulation.nodes(state.nodes);
  state.simulation.force('link').links(state.links);
  state.simulation.alpha(CONFIG.animation.alphaRestart).restart();

  renderGraph();

  document.getElementById('focus-indicator').hidden = true;

  // Clear breadcrumb
  if (window.controlsAPI?.focusHistory) {
    window.controlsAPI.focusHistory.clear();
  }

  // Update URL state
  if (window.controlsAPI?.urlState) {
    window.controlsAPI.urlState.update({});
  }

  resetView();

  // Save state to history
  saveStateToHistory();
}

// ═══════════════════════════════════════════════════════════════════════════
// Filtering
// ═══════════════════════════════════════════════════════════════════════════

function applyFilters() {
  if (state.focusedNodeId) return; // Don't filter in focus mode

  state.nodes = state.fullGraphData.nodes.filter(n => state.filters[n.type]);
  const nodeIds = new Set(state.nodes.map(n => n.id));
  state.links = state.fullGraphData.links.filter(l => {
    const sourceId = l.source.id || l.source;
    const targetId = l.target.id || l.target;
    return nodeIds.has(sourceId) && nodeIds.has(targetId);
  });
}

function toggleFilter(filterType) {
  state.filters[filterType] = !state.filters[filterType];

  applyFilters();

  state.simulation.nodes(state.nodes);
  state.simulation.force('link').links(state.links);
  state.simulation.alpha(CONFIG.animation.alphaRestart).restart();

  renderGraph();
  updateStats(computeFilteredStats());
}

function computeFilteredStats() {
  return {
    noteCount: state.nodes.length,
    connectionCount: state.links.length,
    danglingCount: state.fullGraphData.nodes.filter(n => n.type === 'dangling').length,
    orphanCount: state.fullGraphData.nodes.filter(n => n.type === 'orphan').length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar / Node Details
// ═══════════════════════════════════════════════════════════════════════════

const SIDEBAR_CONFIG = {
  initialDisplayCount: 5,
};

/**
 * Render a list of links with "Show More" functionality for performance
 * @param {Array} items - Array of node objects to render
 * @param {HTMLElement} listElement - The UL element to render into
 * @param {string} emptyMessage - Message to show when list is empty
 * @param {string} listId - Unique identifier for this list (for toggle state)
 */
function renderLinkList(items, listElement, emptyMessage, listId) {
  // Clear existing content
  listElement.innerHTML = '';

  if (items.length === 0) {
    listElement.innerHTML = `<li class="sidebar__list-empty">${emptyMessage}</li>`;
    return;
  }

  const initialCount = SIDEBAR_CONFIG.initialDisplayCount;
  const hasMore = items.length > initialCount;

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();

  items.forEach((node, index) => {
    const li = document.createElement('li');
    li.className = 'sidebar__list-item';
    li.setAttribute('data-node-id', node.id);
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `${t('sr_navigate_to') || 'Navigate to'} ${node.title}`);
    li.textContent = node.title;

    // Hide items beyond initial count
    if (hasMore && index >= initialCount) {
      li.classList.add('sidebar__list-item--hidden');
    }

    // Add staggered animation delay for visible items
    if (index < initialCount) {
      li.style.animationDelay = `${index * 30}ms`;
    }

    fragment.appendChild(li);
  });

  // Add "Show More" button if needed
  if (hasMore) {
    const hiddenCount = items.length - initialCount;
    const showMoreLi = document.createElement('li');
    showMoreLi.className = 'sidebar__list-more';
    showMoreLi.innerHTML = `
      <button class="sidebar__show-more-btn"
              data-list-id="${listId}"
              data-expanded="false"
              aria-expanded="false"
              aria-label="${t('sidebar_show_more') || 'Show'} ${hiddenCount} ${t('sidebar_more_items') || 'more items'}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span class="sidebar__show-more-text">${t('sidebar_show') || 'Show'} ${hiddenCount} ${t('sidebar_more') || 'more'}</span>
      </button>
    `;
    fragment.appendChild(showMoreLi);
  }

  listElement.appendChild(fragment);

  // Store full list data for potential future use
  listElement.dataset.totalCount = items.length.toString();
}

/**
 * Toggle visibility of hidden list items
 * @param {HTMLButtonElement} button - The Show More/Less button
 */
function toggleLinkListExpansion(button) {
  const listId = button.dataset.listId;
  const isExpanded = button.dataset.expanded === 'true';
  const listElement = button.closest('.sidebar__list');

  if (!listElement) return;

  const hiddenItems = listElement.querySelectorAll('.sidebar__list-item--hidden');
  const visibleItems = listElement.querySelectorAll('.sidebar__list-item:not(.sidebar__list-item--hidden)');

  if (isExpanded) {
    // Collapse: hide items beyond initial count
    const initialCount = SIDEBAR_CONFIG.initialDisplayCount;
    const allItems = listElement.querySelectorAll('.sidebar__list-item');

    allItems.forEach((item, index) => {
      if (index >= initialCount) {
        item.classList.add('sidebar__list-item--hidden');
        item.classList.remove('sidebar__list-item--reveal');
      }
    });

    // Update button
    const hiddenCount = allItems.length - initialCount;
    button.dataset.expanded = 'false';
    button.setAttribute('aria-expanded', 'false');
    button.querySelector('.sidebar__show-more-text').textContent =
      `${t('sidebar_show') || 'Show'} ${hiddenCount} ${t('sidebar_more') || 'more'}`;
    button.setAttribute('aria-label',
      `${t('sidebar_show_more') || 'Show'} ${hiddenCount} ${t('sidebar_more_items') || 'more items'}`);

    // Scroll list to top
    listElement.scrollTop = 0;
  } else {
    // Expand: show all hidden items with staggered animation
    hiddenItems.forEach((item, index) => {
      item.classList.remove('sidebar__list-item--hidden');
      item.classList.add('sidebar__list-item--reveal');
      item.style.animationDelay = `${index * 30}ms`;
    });

    // Update button
    button.dataset.expanded = 'true';
    button.setAttribute('aria-expanded', 'true');
    button.querySelector('.sidebar__show-more-text').textContent =
      t('sidebar_show_less') || 'Show less';
    button.setAttribute('aria-label', t('sidebar_collapse_list') || 'Collapse list');
  }
}

function showNodeDetails(node) {
  state.selectedNodeId = node.id;

  const sidebar = document.getElementById('node-sidebar');
  const typeEl = document.getElementById('sidebar-type');
  const titleEl = document.getElementById('sidebar-title');
  const pathEl = document.getElementById('sidebar-path');
  const previewText = document.getElementById('sidebar-preview-text');
  const backlinksCount = document.getElementById('backlinks-count');
  const forwardlinksCount = document.getElementById('forwardlinks-count');
  const backlinksList = document.getElementById('backlinks-list');
  const forwardlinksList = document.getElementById('forwardlinks-list');

  typeEl.textContent = node.type.toUpperCase();
  typeEl.setAttribute('data-type', node.type);
  titleEl.textContent = node.title;
  pathEl.textContent = node.path || '(unlinked reference)';

  // Preview text (if available)
  if (node.preview) {
    previewText.textContent = node.preview;
  } else {
    previewText.textContent = '';
  }

  const backlinks = state.fullGraphData.links
    .filter(l => (l.target.id || l.target) === node.id)
    .map(l => state.fullGraphData.nodes.find(n => n.id === (l.source.id || l.source)))
    .filter(Boolean);

  const forwardlinks = state.fullGraphData.links
    .filter(l => (l.source.id || l.source) === node.id)
    .map(l => state.fullGraphData.nodes.find(n => n.id === (l.target.id || l.target)))
    .filter(Boolean);

  backlinksCount.textContent = backlinks.length;
  forwardlinksCount.textContent = forwardlinks.length;

  // Use optimized renderLinkList for performance with many connections
  renderLinkList(
    backlinks,
    backlinksList,
    t('sidebar_no_backlinks') || 'No backlinks',
    'backlinks'
  );

  renderLinkList(
    forwardlinks,
    forwardlinksList,
    t('sidebar_no_forward_links') || 'No forward links',
    'forwardlinks'
  );

  // Show/hide create note button for dangling nodes
  const createNoteSection = document.getElementById('sidebar-create-note');
  if (createNoteSection) {
    if (node.type === 'dangling') {
      createNoteSection.hidden = false;
    } else {
      createNoteSection.hidden = true;
    }
  }

  sidebar.hidden = false;

  // Update node styling
  renderGraph();
}

function hideNodeDetails() {
  state.selectedNodeId = null;
  document.getElementById('node-sidebar').hidden = true;
  renderGraph();
}

// ═══════════════════════════════════════════════════════════════════════════
// Tooltip
// ═══════════════════════════════════════════════════════════════════════════

function showTooltip(event, node) {
  const tooltip = document.getElementById('tooltip');
  const titleEl = document.getElementById('tooltip-title');
  const metaEl = document.getElementById('tooltip-meta');

  titleEl.textContent = node.title;

  // Calculate connections
  const inbound = state.fullGraphData.links.filter(l => (l.target.id || l.target) === node.id).length;
  const outbound = state.fullGraphData.links.filter(l => (l.source.id || l.source) === node.id).length;
  metaEl.textContent = `${inbound} in · ${outbound} out · ${node.type}`;

  tooltip.hidden = false;

  const x = Math.min(event.pageX + 16, window.innerWidth - 300);
  const y = event.pageY - 8;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  document.getElementById('tooltip').hidden = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Controls
// ═══════════════════════════════════════════════════════════════════════════

function zoomIn() {
  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.scaleBy, 1.4);
}

function zoomOut() {
  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.scaleBy, 0.7);
}

function resetView() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
}

function updateZoomDisplay() {
  const percent = Math.round(state.currentZoomLevel * 100);
  document.getElementById('zoom-level').textContent = `${percent}%`;

  // Sync zoom slider via controlsAPI
  if (window.controlsAPI?.updateZoomSlider) {
    window.controlsAPI.updateZoomSlider(state.currentZoomLevel);
  }
}

/**
 * Set zoom level programmatically
 * @param {number} level - Target zoom level (0.1 to 5.0)
 */
function setZoomLevel(level) {
  // Clamp to valid range
  const clampedLevel = Math.max(CONFIG.zoom.min, Math.min(CONFIG.zoom.max, level));

  // Get current center of the view
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Calculate new transform preserving the center point
  const currentTransform = state.currentTransform || d3.zoomIdentity;
  const cx = width / 2;
  const cy = height / 2;

  // Calculate the graph coordinates of the current center
  const graphX = (cx - currentTransform.x) / currentTransform.k;
  const graphY = (cy - currentTransform.y) / currentTransform.k;

  // Create new transform that keeps the same center but with new scale
  const newTransform = d3.zoomIdentity
    .translate(cx - graphX * clampedLevel, cy - graphY * clampedLevel)
    .scale(clampedLevel);

  // Apply the transform with animation
  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.transform, newTransform);
}

function toggleLabels() {
  state.labelsVisible = !state.labelsVisible;
  state.svg.classed('labels-visible', state.labelsVisible);
  return state.labelsVisible;
}

function searchNodes(query) {
  if (!query) {
    state.g.selectAll('.node')
      .style('opacity', 1)
      .classed('node--focused', d => d.id === state.focusedNodeId);
    return [];
  }

  const lowerQuery = query.toLowerCase();
  const matches = state.fullGraphData.nodes.filter(n =>
    n.title.toLowerCase().includes(lowerQuery)
  );

  state.g.selectAll('.node')
    .style('opacity', d =>
      d.title.toLowerCase().includes(lowerQuery) ? 1 : 0.15
    )
    .classed('node--focused', d =>
      d.title.toLowerCase().includes(lowerQuery)
    );

  state.g.selectAll('.node')
    .select('.node-label')
    .style('opacity', d =>
      d.title.toLowerCase().includes(lowerQuery) ? 1 : 0
    );

  return matches;
}

function focusOnNode(nodeId) {
  const node = state.fullGraphData.nodes.find(n => n.id === nodeId);
  if (node) {
    enterFocusMode(nodeId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Accessibility
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate accessible label for a node
 * @param {Object} d - Node data
 * @returns {string} Accessible label describing the node
 */
function getNodeAriaLabel(d) {
  const inbound = state.fullGraphData?.links.filter(l => (l.target.id || l.target) === d.id).length || 0;
  const outbound = state.fullGraphData?.links.filter(l => (l.source.id || l.source) === d.id).length || 0;

  const typeLabel = d.type === 'note' ? t('node_type_note') || 'Note' :
    d.type === 'orphan' ? t('node_type_orphan') || 'Orphan note' :
      t('node_type_dangling') || 'Dangling reference';

  return `${d.title}. ${typeLabel}. ${inbound} ${t('sr_inbound') || 'inbound'}, ${outbound} ${t('sr_outbound') || 'outbound'} ${t('sr_connections') || 'connections'}. ${t('sr_press_enter') || 'Press Enter to focus, Space for details'}`;
}

/**
 * Handle keyboard events on nodes
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} d - Node data
 */
function handleNodeKeydown(event, d) {
  switch (event.key) {
    case 'Enter':
      // Enter to focus on node
      event.preventDefault();
      handleNodeClick(event, d);
      announceToScreenReader(t('sr_focused_on') || 'Focused on ' + d.title);
      break;

    case ' ':
    case 'Spacebar':
      // Space to show details
      event.preventDefault();
      showNodeDetails(d);
      announceToScreenReader(t('sr_details_opened') || 'Details panel opened for ' + d.title);
      break;

    case 'ArrowRight':
    case 'ArrowDown':
      // Navigate to connected nodes (outbound)
      event.preventDefault();
      navigateToConnectedNode(d, 'outbound');
      break;

    case 'ArrowLeft':
    case 'ArrowUp':
      // Navigate to connected nodes (inbound)
      event.preventDefault();
      navigateToConnectedNode(d, 'inbound');
      break;

    case 'Escape':
      // Exit focus mode
      if (state.focusedNodeId) {
        event.preventDefault();
        exitFocusMode();
        announceToScreenReader(t('sr_exited_focus') || 'Exited focus mode');
      }
      break;
  }
}

/**
 * Navigate to a connected node using arrow keys
 * @param {Object} currentNode - Current node
 * @param {string} direction - 'inbound' or 'outbound'
 */
function navigateToConnectedNode(currentNode, direction) {
  let connectedNodes = [];

  if (direction === 'outbound') {
    connectedNodes = state.fullGraphData.links
      .filter(l => (l.source.id || l.source) === currentNode.id)
      .map(l => state.nodes.find(n => n.id === (l.target.id || l.target)))
      .filter(Boolean);
  } else {
    connectedNodes = state.fullGraphData.links
      .filter(l => (l.target.id || l.target) === currentNode.id)
      .map(l => state.nodes.find(n => n.id === (l.source.id || l.source)))
      .filter(Boolean);
  }

  if (connectedNodes.length === 0) {
    announceToScreenReader(t('sr_no_connections') || 'No ' + direction + ' connections');
    return;
  }

  // Find the next node to focus (cycle through connected nodes)
  const currentIndex = connectedNodes.findIndex(n => n.id === CONFIG.accessibility.lastNavigatedNodeId);
  const nextIndex = (currentIndex + 1) % connectedNodes.length;
  const nextNode = connectedNodes[nextIndex];

  CONFIG.accessibility.lastNavigatedNodeId = nextNode.id;

  // Focus on the next node
  const nodeElement = state.g.selectAll('.node').filter(n => n.id === nextNode.id).node();
  if (nodeElement) {
    nodeElement.focus();
    // Pan to center the node in view
    centerOnNode(nextNode);
    announceToScreenReader(`${t('sr_navigated_to') || 'Navigated to'} ${nextNode.title}`);
  }
}

/**
 * Center the view on a specific node
 * @param {Object} node - Node to center on
 */
function centerOnNode(node) {
  if (!node || node.x === undefined) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = state.currentZoomLevel || 1;

  const transform = d3.zoomIdentity
    .translate(width / 2 - node.x * scale, height / 2 - node.y * scale)
    .scale(scale);

  state.svg.transition()
    .duration(CONFIG.accessibility.prefersReducedMotion ? 0 : CONFIG.animation.duration)
    .call(state.zoom.transform, transform);
}

/**
 * Handle node focus event
 * @param {FocusEvent} event - The focus event
 * @param {Object} d - Node data
 */
function handleNodeFocus(event, d) {
  // Show tooltip on focus for keyboard users
  showTooltip(event, d);

  // Highlight connected links
  state.g.selectAll('.link')
    .classed('link--highlighted', link =>
      link.source.id === d.id || link.target.id === d.id
    );
}

/**
 * Handle node blur event
 * @param {FocusEvent} event - The focus event
 * @param {Object} d - Node data
 */
function handleNodeBlur(event, d) {
  hideTooltip();

  // Remove link highlighting
  state.g.selectAll('.link')
    .classed('link--highlighted', false);
}

/**
 * Announce a message to screen readers
 * @param {string} message - Message to announce
 */
function announceToScreenReader(message) {
  const announcer = document.getElementById('sr-announcements');
  if (announcer) {
    announcer.textContent = message;
    // Clear after a short delay to allow repeated announcements
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  }
}

/**
 * Update graph summary for screen readers
 */
function updateGraphSummary() {
  const summary = document.getElementById('sr-graph-summary');
  if (!summary || !state.stats) return;

  const text = tFormat('sr_graph_summary', {
    notes: state.stats.noteCount,
    connections: state.stats.connectionCount,
    dangling: state.stats.danglingCount,
    orphan: state.stats.orphanCount
  }) || `Graph contains ${state.stats.noteCount} notes, ${state.stats.connectionCount} connections, ${state.stats.danglingCount} dangling references, and ${state.stats.orphanCount} orphan nodes.`;

  summary.textContent = text;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function getNodeRadius(d) {
  const count = d.connectionCount || 1;
  const scale = d3.scaleSqrt()
    .domain([1, 25])
    .range([CONFIG.node.minRadius, CONFIG.node.maxRadius])
    .clamp(true);
  return scale(count);
}

function truncateTitle(title, maxLength = 24) {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

/**
 * Handle creating a note from a dangling link
 * Copies the GigaMind command to clipboard
 */
function handleCreateNote(nodeTitle) {
  // Validate title
  if (!nodeTitle || nodeTitle === '—' || nodeTitle.trim() === '') {
    showToast(t('toast_invalid_node'));
    return;
  }

  // Use locale-appropriate command format
  const command = state.i18n.locale === 'ko'
    ? `/note ${nodeTitle}에 대해 노트를 작성해줘`
    : `/note Write a note about ${nodeTitle}`;

  // Check clipboard API availability
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    showToast(t('toast_clipboard_unavailable') + command);
    return;
  }

  navigator.clipboard.writeText(command).then(() => {
    showToast(t('toast_copied'));
  }).catch((err) => {
    console.error('Clipboard write failed:', err);
    showToast(t('toast_copy_failed') + command);
  });
}

/**
 * Show a toast notification
 */
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.hidden = false;
  toast.classList.add('toast--visible');

  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
  }, duration);
}

function updateStats(stats) {
  state.stats = stats;

  const animateNumber = (el, target) => {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    // Skip animation if reduced motion is preferred
    if (CONFIG.accessibility.prefersReducedMotion) {
      el.textContent = target;
      return;
    }

    const diff = target - current;
    const step = Math.ceil(Math.abs(diff) / 10);
    let value = current;

    const animate = () => {
      if (diff > 0) {
        value = Math.min(value + step, target);
      } else {
        value = Math.max(value - step, target);
      }
      el.textContent = value;
      if (value !== target) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };

  animateNumber(document.getElementById('stat-notes'), stats.noteCount);
  animateNumber(document.getElementById('stat-connections'), stats.connectionCount);
  animateNumber(document.getElementById('stat-dangling'), stats.danglingCount);
  animateNumber(document.getElementById('stat-orphan'), stats.orphanCount);

  // Update screen reader summary
  updateGraphSummary();
}

// ═══════════════════════════════════════════════════════════════════════════
// Empty State
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check and display empty state UI when there are no nodes
 * Hides other UI elements and shows a friendly empty state message
 */
function checkEmptyState() {
  const emptyState = document.getElementById('empty-state');
  if (!emptyState) return;

  const hasNodes = state.fullGraphData?.nodes?.length > 0;
  emptyState.hidden = hasNodes;

  // Hide other UI elements when in empty state
  const minimap = document.getElementById('minimap');
  const shortcutsHint = document.querySelector('.shortcuts-hint');
  const commandBar = document.querySelector('.command-bar');
  const headerStats = document.querySelector('.header__stats');

  if (!hasNodes) {
    if (minimap) minimap.hidden = true;
    if (shortcutsHint) shortcutsHint.hidden = true;
    if (commandBar) commandBar.style.display = 'none';
    if (headerStats) headerStats.style.display = 'none';

    // Announce to screen readers
    announceToScreenReader(t('empty_sr_announcement') || 'No notes in your knowledge graph yet. Create notes using GigaMind CLI to get started.');
  } else {
    if (minimap) minimap.hidden = false;
    if (shortcutsHint) shortcutsHint.hidden = false;
    if (commandBar) commandBar.style.display = '';
    if (headerStats) headerStats.style.display = '';
  }
}

/**
 * Initialize empty state UI event listeners
 */
function initEmptyStateUI() {
  const refreshBtn = document.getElementById('empty-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      location.reload();
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  if (state.simulation) {
    state.simulation.force('center', d3.forceCenter(0, 0));
    state.simulation.alpha(0.1).restart();
  }
  updateMinimap();
});

document.getElementById('graph-canvas').addEventListener('click', (e) => {
  if (e.target.tagName === 'svg') {
    hideNodeDetails();
  }
});

// Event delegation for sidebar interactions (list items and show more buttons)
document.getElementById('node-sidebar').addEventListener('click', (e) => {
  // Handle "Show More/Less" button clicks
  const showMoreBtn = e.target.closest('.sidebar__show-more-btn');
  if (showMoreBtn) {
    e.preventDefault();
    toggleLinkListExpansion(showMoreBtn);
    return;
  }

  // Handle list item clicks (navigate to node)
  const listItem = e.target.closest('.sidebar__list-item[data-node-id]');
  if (listItem) {
    const targetId = listItem.getAttribute('data-node-id');
    const targetNode = state.fullGraphData.nodes.find(n => n.id === targetId);
    if (targetNode) {
      enterFocusMode(targetId);
      showNodeDetails(targetNode);
    }
    return;
  }
});

// Handle keyboard navigation for sidebar list items
document.getElementById('node-sidebar').addEventListener('keydown', (e) => {
  const listItem = e.target.closest('.sidebar__list-item[data-node-id]');
  if (listItem && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    const targetId = listItem.getAttribute('data-node-id');
    const targetNode = state.fullGraphData.nodes.find(n => n.id === targetId);
    if (targetNode) {
      enterFocusMode(targetId);
      showNodeDetails(targetNode);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Cluster Highlighting (for Similar Links feature)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Highlight nodes that belong to a cluster
 * @param {string[]} nodeIds - Array of node IDs to highlight
 * @param {string} color - Color to use for highlighting
 */
function highlightClusterNodes(nodeIds, color) {
  const nodeIdSet = new Set(nodeIds);

  // Set custom property for the cluster color
  document.documentElement.style.setProperty('--cluster-highlight-color', color);

  // Apply highlighting class to matching nodes
  state.g.selectAll('.node')
    .classed('node--cluster-highlight', d => nodeIdSet.has(d.id))
    .style('opacity', d => nodeIdSet.has(d.id) ? 1 : 0.3);

  // Dim non-cluster links
  state.g.selectAll('.link')
    .style('opacity', link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      return nodeIdSet.has(sourceId) || nodeIdSet.has(targetId) ? 1 : 0.1;
    });

  // Show labels for highlighted nodes
  state.g.selectAll('.node')
    .select('.node-label')
    .style('opacity', d => nodeIdSet.has(d.id) ? 1 : 0);
}

/**
 * Clear cluster highlighting and restore normal view
 */
function clearClusterHighlight() {
  // Remove highlighting class from all nodes
  state.g.selectAll('.node')
    .classed('node--cluster-highlight', false)
    .style('opacity', 1);

  // Restore link opacity
  state.g.selectAll('.link')
    .style('opacity', 1);

  // Restore label visibility based on current settings
  state.g.selectAll('.node')
    .select('.node-label')
    .style('opacity', d => {
      if (state.labelsVisible) return 1;
      if (d.id === state.focusedNodeId || d.id === state.selectedNodeId) return 1;
      return null; // Let CSS handle it
    });

  // Remove custom property
  document.documentElement.style.removeProperty('--cluster-highlight-color');
}

window.graphAPI = {
  zoomIn,
  zoomOut,
  resetView,
  setZoomLevel,
  searchNodes,
  focusOnNode,
  exitFocusMode,
  hideNodeDetails,
  showNodeDetails,
  toggleLabels,
  toggleFilter,
  panToMinimapPosition,
  loadMoreNodes,
  loadFullGraph,
  handleCreateNote,
  highlightClusterNodes,
  clearClusterHighlight,
  showToast,
  updateMinimapColors,
  t,
  tFormat,
  // Node pinning
  toggleNodePin,
  isNodePinned,
  // State management
  restoreState,
  // Empty state
  checkEmptyState,
  // Accessibility APIs
  announceToScreenReader,
  centerOnNode,
  // Getters
  getFilters: () => state.filters,
  getNodes: () => state.fullGraphData?.nodes || [],
  getFocusedNodeId: () => state.focusedNodeId,
  getSelectedNodeId: () => state.selectedNodeId,
  getZoomLevel: () => state.currentZoomLevel,
  getLoadingState: () => ({
    isLoading: state.loading.isLoading,
    loadedCount: state.loading.loadedNodeIds.size,
    totalCount: state.loading.totalNodes,
    hasMore: state.loading.hasMore,
    isFullGraphLoaded: state.loading.isFullGraphLoaded,
  }),
  getPrefersReducedMotion: () => CONFIG.accessibility.prefersReducedMotion,
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize error handlers once before initGraph
  initErrorHandlers();
  initGraph();
});
