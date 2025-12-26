/**
 * GigaMind Knowledge Graph — UI Controls
 * Search dropdown, filter toggles, keyboard navigation
 */

// ═══════════════════════════════════════════════════════════════════════════
// DOM Elements
// ═══════════════════════════════════════════════════════════════════════════

const elements = {
  searchInput: document.getElementById('search-input'),
  searchResults: document.getElementById('search-results'),
  searchResultsList: document.getElementById('search-results-list'),
  searchCount: document.getElementById('search-count'),
  searchClear: document.getElementById('search-clear'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomLevel: document.getElementById('zoom-level'),
  resetView: document.getElementById('reset-view'),
  toggleLabels: document.getElementById('toggle-labels'),
  exitFocus: document.getElementById('exit-focus'),
  closeSidebar: document.getElementById('close-sidebar'),
  focusIndicator: document.getElementById('focus-indicator'),
  sidebar: document.getElementById('node-sidebar'),
  sidebarTitle: document.getElementById('sidebar-title'),
  createNoteBtn: document.getElementById('create-note-btn'),
  minimap: document.getElementById('minimap'),
  minimapToggle: document.getElementById('minimap-toggle'),
  filterButtons: document.querySelectorAll('.filter-btn'),
  loadMoreBtn: document.getElementById('load-more-btn'),
  loadAllBtn: document.getElementById('load-all-btn'),
};

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

let searchState = {
  query: '',
  results: [],
  selectedIndex: -1,
  isOpen: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// Button Handlers
// ═══════════════════════════════════════════════════════════════════════════

elements.zoomIn.addEventListener('click', () => {
  window.graphAPI?.zoomIn();
});

elements.zoomOut.addEventListener('click', () => {
  window.graphAPI?.zoomOut();
});

elements.resetView.addEventListener('click', () => {
  window.graphAPI?.resetView();
});

elements.toggleLabels?.addEventListener('click', () => {
  const isActive = window.graphAPI?.toggleLabels();
  elements.toggleLabels.classList.toggle('control-btn--active', isActive);
});

elements.exitFocus.addEventListener('click', () => {
  window.graphAPI?.exitFocusMode();
});

elements.closeSidebar.addEventListener('click', () => {
  window.graphAPI?.hideNodeDetails();
});

// Create Note button (for dangling links)
elements.createNoteBtn?.addEventListener('click', () => {
  const nodeTitle = elements.sidebarTitle?.textContent;
  if (nodeTitle && nodeTitle !== '—') {
    window.graphAPI?.handleCreateNote(nodeTitle);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Progressive Loading Controls
// ═══════════════════════════════════════════════════════════════════════════

elements.loadMoreBtn?.addEventListener('click', () => {
  window.graphAPI?.loadMoreNodes();
});

elements.loadAllBtn?.addEventListener('click', () => {
  window.graphAPI?.loadFullGraph();
});

// ═══════════════════════════════════════════════════════════════════════════
// Minimap Toggle & Navigation
// ═══════════════════════════════════════════════════════════════════════════

elements.minimapToggle?.addEventListener('click', () => {
  elements.minimap.classList.toggle('minimap--collapsed');
});

// Minimap click-to-navigate handler
const minimapCanvas = document.getElementById('minimap-canvas');
minimapCanvas?.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  // Calculate click position relative to canvas
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Pan the graph to the clicked position
  window.graphAPI?.panToMinimapPosition(x, y);
});

// ═══════════════════════════════════════════════════════════════════════════
// Filter Toggles
// ═══════════════════════════════════════════════════════════════════════════

elements.filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const filterType = btn.dataset.filter;
    if (!filterType) return;

    btn.classList.toggle('filter-btn--active');
    window.graphAPI?.toggleFilter(filterType);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Search with Dropdown
// ═══════════════════════════════════════════════════════════════════════════

let searchDebounceTimer = null;

function performSearch(query) {
  searchState.query = query;

  if (!query.trim()) {
    closeSearchDropdown();
    window.graphAPI?.searchNodes('');
    return;
  }

  const matches = window.graphAPI?.searchNodes(query) || [];
  searchState.results = matches;
  searchState.selectedIndex = -1;

  renderSearchResults(matches, query);
  openSearchDropdown();
}

function renderSearchResults(results, query) {
  const count = results.length;
  // Use translation API from graphAPI
  const t = window.graphAPI?.t || ((key) => key);
  const tFormat = window.graphAPI?.tFormat || ((key, values) => {
    let template = key;
    if (values) {
      Object.keys(values).forEach(k => {
        template = template.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), values[k]);
      });
    }
    return template;
  });

  // Use singular or plural form based on count
  if (count === 1) {
    elements.searchCount.textContent = t('search_results_count_one');
  } else {
    elements.searchCount.textContent = tFormat('search_results_count', { count });
  }

  if (results.length === 0) {
    elements.searchResultsList.innerHTML = `
      <li class="search-results__empty">${t('search_no_results')}</li>
    `;
    return;
  }

  // Limit to 10 results
  const displayResults = results.slice(0, 10);

  elements.searchResultsList.innerHTML = displayResults.map((node, index) => {
    const highlightedTitle = highlightMatch(node.title, query);
    const inbound = countInbound(node.id);
    const outbound = countOutbound(node.id);

    return `
      <li class="search-results__item ${index === searchState.selectedIndex ? 'search-results__item--selected' : ''}"
          data-node-id="${node.id}"
          data-index="${index}">
        <span class="search-results__item-indicator search-results__item-indicator--${node.type}"></span>
        <span class="search-results__item-title">${highlightedTitle}</span>
        <span class="search-results__item-connections">${inbound + outbound}</span>
      </li>
    `;
  }).join('');

  // Add click handlers
  elements.searchResultsList.querySelectorAll('.search-results__item').forEach(item => {
    item.addEventListener('click', () => {
      const nodeId = item.dataset.nodeId;
      selectSearchResult(nodeId);
    });
  });
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countInbound(nodeId) {
  const nodes = window.graphAPI?.getNodes() || [];
  // This would need the links data, simplified for now
  return 0;
}

function countOutbound(nodeId) {
  return 0;
}

function selectSearchResult(nodeId) {
  window.graphAPI?.focusOnNode(nodeId);
  closeSearchDropdown();
  elements.searchInput.value = '';
  elements.searchInput.blur();
}

function openSearchDropdown() {
  searchState.isOpen = true;
  elements.searchResults.hidden = false;
}

function closeSearchDropdown() {
  searchState.isOpen = false;
  searchState.selectedIndex = -1;
  elements.searchResults.hidden = true;
}

function navigateResults(direction) {
  if (!searchState.isOpen || searchState.results.length === 0) return;

  const maxIndex = Math.min(searchState.results.length - 1, 9);

  if (direction === 'down') {
    searchState.selectedIndex = Math.min(searchState.selectedIndex + 1, maxIndex);
  } else {
    searchState.selectedIndex = Math.max(searchState.selectedIndex - 1, 0);
  }

  updateSelectedResult();
}

function updateSelectedResult() {
  elements.searchResultsList.querySelectorAll('.search-results__item').forEach((item, index) => {
    item.classList.toggle('search-results__item--selected', index === searchState.selectedIndex);
  });

  // Scroll into view
  const selected = elements.searchResultsList.querySelector('.search-results__item--selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function confirmSelection() {
  if (searchState.selectedIndex >= 0 && searchState.selectedIndex < searchState.results.length) {
    const node = searchState.results[searchState.selectedIndex];
    selectSearchResult(node.id);
  }
}

// Search input event listeners
elements.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performSearch(e.target.value.trim());
  }, 100);
});

elements.searchInput.addEventListener('focus', () => {
  if (searchState.query && searchState.results.length > 0) {
    openSearchDropdown();
  }
});

elements.searchInput.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      navigateResults('down');
      break;

    case 'ArrowUp':
      e.preventDefault();
      navigateResults('up');
      break;

    case 'Enter':
      e.preventDefault();
      if (searchState.isOpen && searchState.selectedIndex >= 0) {
        confirmSelection();
      }
      break;

    case 'Escape':
      e.preventDefault();
      if (searchState.isOpen) {
        closeSearchDropdown();
      } else {
        elements.searchInput.value = '';
        elements.searchInput.blur();
        window.graphAPI?.searchNodes('');
      }
      break;
  }
});

// Clear button
elements.searchClear?.addEventListener('click', () => {
  elements.searchInput.value = '';
  closeSearchDropdown();
  window.graphAPI?.searchNodes('');
  elements.searchInput.focus();
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!elements.searchInput.contains(e.target) && !elements.searchResults.contains(e.target)) {
    closeSearchDropdown();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // Don't trigger shortcuts when typing in search
  if (document.activeElement === elements.searchInput) {
    return;
  }

  switch (e.key) {
    case '/':
      e.preventDefault();
      elements.searchInput.focus();
      break;

    case 'Escape':
      if (!elements.focusIndicator.hidden) {
        window.graphAPI?.exitFocusMode();
      } else if (!elements.sidebar.hidden) {
        window.graphAPI?.hideNodeDetails();
      }
      break;

    case '+':
    case '=':
      e.preventDefault();
      window.graphAPI?.zoomIn();
      break;

    case '-':
    case '_':
      e.preventDefault();
      window.graphAPI?.zoomOut();
      break;

    case '0':
      e.preventDefault();
      window.graphAPI?.resetView();
      break;

    case 'l':
    case 'L':
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const isActive = window.graphAPI?.toggleLabels();
        elements.toggleLabels?.classList.toggle('control-btn--active', isActive);
      }
      break;

    case 'f':
    case 'F':
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      }
      break;

    case 'm':
    case 'M':
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        elements.minimap?.classList.toggle('minimap--collapsed');
      }
      break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Touch Support
// ═══════════════════════════════════════════════════════════════════════════

let touchStartDistance = 0;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    touchStartDistance = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (touchStartDistance > 0) {
      const scale = distance / touchStartDistance;
      if (scale > 1.15) {
        window.graphAPI?.zoomIn();
        touchStartDistance = distance;
      } else if (scale < 0.85) {
        window.graphAPI?.zoomOut();
        touchStartDistance = distance;
      }
    }
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  touchStartDistance = 0;
}, { passive: true });

// ═══════════════════════════════════════════════════════════════════════════
// Heartbeat
// ═══════════════════════════════════════════════════════════════════════════

setInterval(() => {
  fetch('/api/heartbeat').catch(() => {});
}, 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// Console Branding
// ═══════════════════════════════════════════════════════════════════════════

console.log(
  '%cGigaMind Neural Observatory',
  'font-size: 14px; font-weight: 600; color: #d4a574; font-family: Georgia, serif;'
);
console.log(
  '%c/ search  +/- zoom  0 reset  L labels  M minimap  F fullscreen  ESC exit',
  'color: #5c5c6c; font-family: monospace; font-size: 11px;'
);
