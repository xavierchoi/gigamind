/**
 * GigaMind Knowledge Graph — D3.js Force-Directed Graph
 * Cosmic Observatory aesthetic with smooth interactions
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
  simulation: null,
  svg: null,
  g: null,
  zoom: null,
  currentZoomLevel: 1,
};

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  node: {
    minRadius: 5,
    maxRadius: 20,
    baseRadius: 8,
  },
  force: {
    linkDistance: 80,
    chargeStrength: -200,
    collideRadius: 30,
    centerStrength: 0.05,
  },
  zoom: {
    min: 0.1,
    max: 4,
    highThreshold: 1.5,
  },
  animation: {
    duration: 500,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

async function initGraph() {
  try {
    // Fetch graph data
    const response = await fetch('/api/graph');
    if (!response.ok) throw new Error('Failed to fetch graph data');

    const data = await response.json();
    state.fullGraphData = data;
    state.nodes = data.nodes;
    state.links = data.links;
    state.stats = data.stats;

    // Update stats display
    updateStats(data.stats);

    // Initialize SVG and simulation
    initSVG();
    initSimulation();
    renderGraph();

    // Hide loading
    document.getElementById('loading').hidden = true;
  } catch (error) {
    console.error('Failed to initialize graph:', error);
    document.querySelector('.loading__text').textContent = '그래프를 불러오는데 실패했습니다';
  }
}

function initSVG() {
  const svg = d3.select('#graph-canvas');
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Clear existing content
  svg.selectAll('*').remove();

  // Define arrow markers for links (optional, not used currently)
  const defs = svg.append('defs');

  // Glow filter for nodes
  const glowFilter = defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%')
    .attr('y', '-50%')
    .attr('width', '200%')
    .attr('height', '200%');

  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'coloredBlur');

  const feMerge = glowFilter.append('feMerge');
  feMerge.append('feMergeNode').attr('in', 'coloredBlur');
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

  // Create main group for zoom/pan
  state.g = svg.append('g').attr('class', 'graph-container');

  // Links group (rendered first, behind nodes)
  state.g.append('g').attr('class', 'links-group');

  // Nodes group
  state.g.append('g').attr('class', 'nodes-group');

  // Setup zoom behavior
  state.zoom = d3.zoom()
    .scaleExtent([CONFIG.zoom.min, CONFIG.zoom.max])
    .on('zoom', (event) => {
      state.g.attr('transform', event.transform);
      state.currentZoomLevel = event.transform.k;

      // Toggle high-zoom class for label visibility
      svg.classed('zoom-high', event.transform.k > CONFIG.zoom.highThreshold);
    });

  svg.call(state.zoom);

  // Center initial view
  const initialTransform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(0.8);
  svg.call(state.zoom.transform, initialTransform);

  state.svg = svg;
}

function initSimulation() {
  const width = window.innerWidth;
  const height = window.innerHeight;

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
      .radius(d => getNodeRadius(d) + 10)
    )
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

  // Exit
  link.exit()
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 0)
    .remove();

  // Enter + Update
  const linkEnter = link.enter()
    .append('path')
    .attr('class', 'link')
    .style('opacity', 0);

  linkEnter.merge(link)
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 1);
}

function renderNodes() {
  const nodesGroup = state.g.select('.nodes-group');

  const node = nodesGroup.selectAll('.node')
    .data(state.nodes, d => d.id);

  // Exit
  node.exit()
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 0)
    .attr('transform', d => `translate(${d.x}, ${d.y}) scale(0)`)
    .remove();

  // Enter
  const nodeEnter = node.enter()
    .append('g')
    .attr('class', d => `node node--${d.type}`)
    .style('opacity', 0)
    .call(drag(state.simulation))
    .on('click', handleNodeClick)
    .on('dblclick', handleNodeDoubleClick)
    .on('mouseenter', handleNodeHover)
    .on('mouseleave', handleNodeLeave);

  // Circle
  nodeEnter.append('circle')
    .attr('r', 0)
    .attr('filter', 'url(#glow)');

  // Label
  nodeEnter.append('text')
    .attr('class', 'node-label')
    .attr('dy', d => getNodeRadius(d) + 14)
    .attr('text-anchor', 'middle')
    .text(d => truncateTitle(d.title));

  // Merge enter + update
  const nodeUpdate = nodeEnter.merge(node);

  nodeUpdate
    .transition()
    .duration(CONFIG.animation.duration)
    .style('opacity', 1)
    .attr('class', d => {
      let classes = `node node--${d.type}`;
      if (d.id === state.focusedNodeId) classes += ' node--focused';
      return classes;
    });

  nodeUpdate.select('circle')
    .transition()
    .duration(CONFIG.animation.duration)
    .attr('r', getNodeRadius);

  nodeUpdate.select('text')
    .attr('dy', d => getNodeRadius(d) + 14)
    .text(d => truncateTitle(d.title));
}

function ticked() {
  // Update link positions with curved paths
  state.g.selectAll('.link')
    .attr('d', linkArc);

  // Update node positions
  state.g.selectAll('.node')
    .attr('transform', d => `translate(${d.x}, ${d.y})`);
}

// Curved link path
function linkArc(d) {
  const dx = d.target.x - d.source.x;
  const dy = d.target.y - d.source.y;
  const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;

  return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactions
// ═══════════════════════════════════════════════════════════════════════════

function handleNodeClick(event, d) {
  event.stopPropagation();

  if (state.focusedNodeId === d.id) {
    // Already focused, unfocus
    exitFocusMode();
  } else {
    // Enter focus mode
    enterFocusMode(d.id);
  }
}

function handleNodeDoubleClick(event, d) {
  event.stopPropagation();
  showNodeDetails(d);
}

function handleNodeHover(event, d) {
  // Highlight connected links
  state.g.selectAll('.link')
    .classed('link--highlighted', link =>
      link.source.id === d.id || link.target.id === d.id
    );

  // Show tooltip
  showTooltip(event, d.title);
}

function handleNodeLeave() {
  // Remove link highlights
  state.g.selectAll('.link')
    .classed('link--highlighted', false);

  // Hide tooltip
  hideTooltip();
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
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

  // Find connected nodes
  const connectedIds = new Set([nodeId]);
  state.fullGraphData.links.forEach(link => {
    const sourceId = link.source.id || link.source;
    const targetId = link.target.id || link.target;
    if (sourceId === nodeId) connectedIds.add(targetId);
    if (targetId === nodeId) connectedIds.add(sourceId);
  });

  // Filter nodes and links
  state.nodes = state.fullGraphData.nodes.filter(n => connectedIds.has(n.id));
  state.links = state.fullGraphData.links.filter(l => {
    const sourceId = l.source.id || l.source;
    const targetId = l.target.id || l.target;
    return connectedIds.has(sourceId) && connectedIds.has(targetId);
  });

  // Update simulation
  state.simulation.nodes(state.nodes);
  state.simulation.force('link').links(state.links);
  state.simulation.alpha(0.8).restart();

  // Re-render
  renderGraph();

  // Show focus indicator
  document.getElementById('focus-indicator').hidden = false;

  // Center on focused node
  const focusedNode = state.nodes.find(n => n.id === nodeId);
  if (focusedNode) {
    const transform = d3.zoomIdentity
      .translate(window.innerWidth / 2 - focusedNode.x * 1.2, window.innerHeight / 2 - focusedNode.y * 1.2)
      .scale(1.2);
    state.svg.transition().duration(CONFIG.animation.duration).call(state.zoom.transform, transform);
  }
}

function exitFocusMode() {
  state.focusedNodeId = null;

  // Restore full graph
  state.nodes = state.fullGraphData.nodes;
  state.links = state.fullGraphData.links;

  // Update simulation
  state.simulation.nodes(state.nodes);
  state.simulation.force('link').links(state.links);
  state.simulation.alpha(0.8).restart();

  // Re-render
  renderGraph();

  // Hide focus indicator
  document.getElementById('focus-indicator').hidden = true;

  // Reset zoom
  resetView();
}

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar / Node Details
// ═══════════════════════════════════════════════════════════════════════════

function showNodeDetails(node) {
  const sidebar = document.getElementById('node-sidebar');
  const typeEl = document.getElementById('sidebar-type');
  const titleEl = document.getElementById('sidebar-title');
  const pathEl = document.getElementById('sidebar-path');
  const backlinksCount = document.getElementById('backlinks-count');
  const forwardlinksCount = document.getElementById('forwardlinks-count');
  const backlinksList = document.getElementById('backlinks-list');
  const forwardlinksList = document.getElementById('forwardlinks-list');

  // Set type badge
  typeEl.textContent = node.type.toUpperCase();
  typeEl.setAttribute('data-type', node.type);

  // Set title and path
  titleEl.textContent = node.title;
  pathEl.textContent = node.path || '(미생성 노트)';

  // Find backlinks (nodes that link to this node)
  const backlinks = state.fullGraphData.links
    .filter(l => (l.target.id || l.target) === node.id)
    .map(l => state.fullGraphData.nodes.find(n => n.id === (l.source.id || l.source)))
    .filter(Boolean);

  // Find forward links (nodes this node links to)
  const forwardlinks = state.fullGraphData.links
    .filter(l => (l.source.id || l.source) === node.id)
    .map(l => state.fullGraphData.nodes.find(n => n.id === (l.target.id || l.target)))
    .filter(Boolean);

  // Update counts
  backlinksCount.textContent = backlinks.length;
  forwardlinksCount.textContent = forwardlinks.length;

  // Render backlinks list
  backlinksList.innerHTML = backlinks.length
    ? backlinks.map(n => `<li class="sidebar__list-item" data-node-id="${n.id}">${n.title}</li>`).join('')
    : '<li class="sidebar__list-empty">백링크 없음</li>';

  // Render forward links list
  forwardlinksList.innerHTML = forwardlinks.length
    ? forwardlinks.map(n => `<li class="sidebar__list-item" data-node-id="${n.id}">${n.title}</li>`).join('')
    : '<li class="sidebar__list-empty">포워드 링크 없음</li>';

  // Add click handlers to list items
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

  // Show sidebar
  sidebar.hidden = false;
}

function hideNodeDetails() {
  document.getElementById('node-sidebar').hidden = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tooltip
// ═══════════════════════════════════════════════════════════════════════════

function showTooltip(event, text) {
  const tooltip = document.getElementById('tooltip');
  tooltip.textContent = text;
  tooltip.hidden = false;

  // Position tooltip
  const x = event.pageX + 12;
  const y = event.pageY - 12;
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
    .call(state.zoom.scaleBy, 1.5);
}

function zoomOut() {
  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.scaleBy, 0.67);
}

function resetView() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  state.svg.transition()
    .duration(CONFIG.animation.duration)
    .call(state.zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
}

function searchNodes(query) {
  if (!query) {
    // Reset all nodes to normal
    state.g.selectAll('.node')
      .style('opacity', 1)
      .classed('node--focused', d => d.id === state.focusedNodeId);
    return;
  }

  const lowerQuery = query.toLowerCase();

  state.g.selectAll('.node')
    .style('opacity', d =>
      d.title.toLowerCase().includes(lowerQuery) ? 1 : 0.2
    )
    .classed('node--focused', d =>
      d.title.toLowerCase().includes(lowerQuery)
    );

  // Also highlight matching nodes' labels
  state.g.selectAll('.node')
    .select('.node-label')
    .style('opacity', function(d) {
      return d.title.toLowerCase().includes(lowerQuery) ? 1 : 0;
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function getNodeRadius(d) {
  const count = d.connectionCount || 1;
  const scale = d3.scaleSqrt()
    .domain([1, 20])
    .range([CONFIG.node.minRadius, CONFIG.node.maxRadius])
    .clamp(true);
  return scale(count);
}

function truncateTitle(title, maxLength = 20) {
  if (title.length <= maxLength) return title;
  return title.slice(0, maxLength - 1) + '…';
}

function updateStats(stats) {
  document.getElementById('stat-notes').textContent = stats.noteCount;
  document.getElementById('stat-connections').textContent = stats.connectionCount;
  document.getElementById('stat-dangling').textContent = stats.danglingCount;
  document.getElementById('stat-orphan').textContent = stats.orphanCount;
}

// ═══════════════════════════════════════════════════════════════════════════
// Window Events
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('resize', () => {
  // Recenter on resize
  if (state.simulation) {
    state.simulation.force('center', d3.forceCenter(0, 0));
    state.simulation.alpha(0.3).restart();
  }
});

// Click on empty space to close sidebar
document.getElementById('graph-canvas').addEventListener('click', (e) => {
  if (e.target.tagName === 'svg') {
    hideNodeDetails();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Export for controls.js
// ═══════════════════════════════════════════════════════════════════════════

window.graphAPI = {
  zoomIn,
  zoomOut,
  resetView,
  searchNodes,
  exitFocusMode,
  hideNodeDetails,
};

// Initialize on load
document.addEventListener('DOMContentLoaded', initGraph);
