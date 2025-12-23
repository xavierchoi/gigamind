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
};

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

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
};

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

async function initGraph() {
  try {
    const response = await fetch('/api/graph');
    if (!response.ok) throw new Error('Failed to fetch graph data');

    const data = await response.json();
    state.fullGraphData = data;
    state.nodes = [...data.nodes];
    state.links = [...data.links];
    state.stats = data.stats;

    updateStats(data.stats);
    initSVG();
    initSimulation();
    renderGraph();
    initMinimap();

    // Staggered reveal
    setTimeout(() => {
      document.getElementById('loading').hidden = true;
    }, 300);
  } catch (error) {
    console.error('Failed to initialize graph:', error);
    document.querySelector('.loading__text').textContent = 'Failed to load graph data';
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

  // Main container
  state.g = svg.append('g').attr('class', 'graph-container');
  state.g.append('g').attr('class', 'links-group');
  state.g.append('g').attr('class', 'nodes-group');

  // Zoom behavior
  state.zoom = d3.zoom()
    .scaleExtent([CONFIG.zoom.min, CONFIG.zoom.max])
    .on('zoom', (event) => {
      state.g.attr('transform', event.transform);
      state.currentZoomLevel = event.transform.k;
      state.currentTransform = event.transform;

      svg.classed('zoom-high', event.transform.k > CONFIG.zoom.highThreshold);
      updateZoomDisplay();
      updateMinimap();
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
    .call(drag(state.simulation))
    .on('click', handleNodeClick)
    .on('dblclick', handleNodeDoubleClick)
    .on('mouseenter', handleNodeHover)
    .on('mouseleave', handleNodeLeave);

  nodeEnter.append('circle')
    .attr('r', d => getNodeRadius(d))
    .attr('filter', 'url(#glow)');

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
      return classes;
    });

  nodeUpdate.select('circle')
    .attr('r', getNodeRadius);

  nodeUpdate.select('text')
    .attr('dy', d => getNodeRadius(d) + 14)
    .text(d => truncateTitle(d.title));
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

  // Draw links
  ctx.strokeStyle = 'rgba(124, 156, 188, 0.15)';
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
      ctx.fillStyle = '#7c9cbc';
    } else if (node.type === 'orphan') {
      ctx.fillStyle = '#6c7080';
    } else {
      ctx.fillStyle = '#c4956c';
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
    d.fx = null;
    d.fy = null;
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

// ═══════════════════════════════════════════════════════════════════════════
// Focus Mode
// ═══════════════════════════════════════════════════════════════════════════

function enterFocusMode(nodeId) {
  state.focusedNodeId = nodeId;

  const focusedNode = state.fullGraphData.nodes.find(n => n.id === nodeId);
  if (focusedNode) {
    document.getElementById('focus-node-name').textContent = focusedNode.title;
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

  resetView();
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

  backlinksList.innerHTML = backlinks.length
    ? backlinks.map(n => `<li class="sidebar__list-item" data-node-id="${n.id}">${n.title}</li>`).join('')
    : '<li class="sidebar__list-empty">No backlinks</li>';

  forwardlinksList.innerHTML = forwardlinks.length
    ? forwardlinks.map(n => `<li class="sidebar__list-item" data-node-id="${n.id}">${n.title}</li>`).join('')
    : '<li class="sidebar__list-empty">No forward links</li>';

  sidebar.querySelectorAll('.sidebar__list-item[data-node-id]').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-node-id');
      const targetNode = state.fullGraphData.nodes.find(n => n.id === targetId);
      if (targetNode) {
        enterFocusMode(targetId);
        showNodeDetails(targetNode);
      }
    });
  });

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

function updateStats(stats) {
  const animateNumber = (el, target) => {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

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

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

window.graphAPI = {
  zoomIn,
  zoomOut,
  resetView,
  searchNodes,
  focusOnNode,
  exitFocusMode,
  hideNodeDetails,
  toggleLabels,
  toggleFilter,
  getFilters: () => state.filters,
  getNodes: () => state.fullGraphData?.nodes || [],
};

// Initialize on load
document.addEventListener('DOMContentLoaded', initGraph);
