/**
 * GigaMind Knowledge Graph — UI Controls
 * Search dropdown, filter toggles, keyboard navigation, history management
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
  breadcrumb: document.getElementById('breadcrumb'),
  contextMenu: document.getElementById('context-menu'),
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
// History Management (Undo/Redo)
// ═══════════════════════════════════════════════════════════════════════════

const history = {
  states: [],
  currentIndex: -1,
  maxSize: 50,

  /**
   * Push a new state to history
   * @param {Object} state - State object containing focusedNodeId, pinnedNodes, transform
   */
  push(state) {
    // Remove future states if we're in the middle of history
    if (this.currentIndex < this.states.length - 1) {
      this.states = this.states.slice(0, this.currentIndex + 1);
    }

    // Create a deep copy of the state
    const stateCopy = {
      focusedNodeId: state.focusedNodeId,
      pinnedNodes: new Map(state.pinnedNodes || []),
      transform: state.transform ? { ...state.transform } : null,
      timestamp: Date.now(),
    };

    this.states.push(stateCopy);
    this.currentIndex = this.states.length - 1;

    // Limit history size
    if (this.states.length > this.maxSize) {
      this.states.shift();
      this.currentIndex--;
    }

    this.updateUI();
  },

  /**
   * Undo to previous state
   * @returns {Object|null} Previous state or null if at beginning
   */
  undo() {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    this.updateUI();
    return this.states[this.currentIndex];
  },

  /**
   * Redo to next state
   * @returns {Object|null} Next state or null if at end
   */
  redo() {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    this.updateUI();
    return this.states[this.currentIndex];
  },

  canUndo() {
    return this.currentIndex > 0;
  },

  canRedo() {
    return this.currentIndex < this.states.length - 1;
  },

  getCurrent() {
    return this.states[this.currentIndex] || null;
  },

  updateUI() {
    // Update undo/redo button states if they exist
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    if (undoBtn) undoBtn.disabled = !this.canUndo();
    if (redoBtn) redoBtn.disabled = !this.canRedo();
  },

  clear() {
    this.states = [];
    this.currentIndex = -1;
    this.updateUI();
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Focus History (Breadcrumb Navigation)
// ═══════════════════════════════════════════════════════════════════════════

const focusHistory = {
  stack: [],
  maxSize: 10,

  push(nodeId, nodeTitle) {
    // Avoid duplicates at the end
    if (this.stack.length > 0 && this.stack[this.stack.length - 1].id === nodeId) {
      return;
    }

    this.stack.push({ id: nodeId, title: nodeTitle });

    // Limit stack size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }

    this.updateBreadcrumb();
  },

  pop() {
    if (this.stack.length > 0) {
      this.stack.pop();
      this.updateBreadcrumb();
    }
  },

  clear() {
    this.stack = [];
    this.updateBreadcrumb();
  },

  goTo(index) {
    if (index >= 0 && index < this.stack.length) {
      const target = this.stack[index];
      this.stack = this.stack.slice(0, index + 1);
      this.updateBreadcrumb();
      return target;
    }
    return null;
  },

  updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const t = window.graphAPI?.t || ((key) => key);

    if (this.stack.length === 0) {
      breadcrumb.hidden = true;
      return;
    }

    breadcrumb.hidden = false;

    // Build breadcrumb HTML
    const items = [
      `<button class="breadcrumb__item breadcrumb__item--home" data-index="-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
        <span>${t('breadcrumb_home') || 'Home'}</span>
      </button>`
    ];

    this.stack.forEach((item, index) => {
      items.push(`
        <span class="breadcrumb__separator">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        <button class="breadcrumb__item ${index === this.stack.length - 1 ? 'breadcrumb__item--active' : ''}"
                data-index="${index}" data-node-id="${item.id}">
          ${escapeHtmlForBreadcrumb(item.title)}
        </button>
      `);
    });

    breadcrumb.innerHTML = items.join('');

    // Add click handlers
    breadcrumb.querySelectorAll('.breadcrumb__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index, 10);
        if (index === -1) {
          // Go to home (exit focus mode)
          window.graphAPI?.exitFocusMode();
          this.clear();
        } else {
          const target = this.goTo(index);
          if (target) {
            window.graphAPI?.focusOnNode(target.id);
          }
        }
      });
    });
  }
};

function escapeHtmlForBreadcrumb(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════
// URL State Management
// ═══════════════════════════════════════════════════════════════════════════

const urlState = {
  update(options = {}) {
    const params = new URLSearchParams();

    if (options.focusedNodeId) {
      params.set('focus', options.focusedNodeId);
    }

    if (options.zoom && options.zoom !== 1) {
      params.set('zoom', options.zoom.toFixed(2));
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState(null, '', newUrl);
  },

  restore() {
    const params = new URLSearchParams(window.location.search);

    const focusId = params.get('focus');
    const zoom = parseFloat(params.get('zoom'));

    return {
      focusedNodeId: focusId || null,
      zoom: isNaN(zoom) ? null : zoom
    };
  }
};

// Restore state from URL on load
window.addEventListener('load', () => {
  // Delay to ensure graph is initialized
  setTimeout(() => {
    const savedState = urlState.restore();
    if (savedState.focusedNodeId) {
      window.graphAPI?.focusOnNode(savedState.focusedNodeId);
    }
    if (savedState.zoom) {
      window.graphAPI?.setZoom?.(savedState.zoom);
    }
  }, 500);
});

// ═══════════════════════════════════════════════════════════════════════════
// Context Menu
// ═══════════════════════════════════════════════════════════════════════════

const contextMenu = {
  currentNode: null,
  menuElement: null,

  init() {
    // Create context menu if it doesn't exist
    if (!document.getElementById('context-menu')) {
      const menu = document.createElement('div');
      menu.id = 'context-menu';
      menu.className = 'context-menu';
      menu.hidden = true;
      menu.innerHTML = `
        <button class="context-menu__item" data-action="focus">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span data-i18n="context_focus">Focus</span>
        </button>
        <button class="context-menu__item" data-action="pin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L12 12"/>
            <circle cx="12" cy="17" r="5"/>
          </svg>
          <span data-i18n="context_pin">Pin</span>
        </button>
        <button class="context-menu__item" data-action="details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span data-i18n="context_details">Details</span>
        </button>
        <div class="context-menu__divider"></div>
        <button class="context-menu__item" data-action="copy-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span data-i18n="context_copy_link">Copy Link</span>
        </button>
      `;
      document.body.appendChild(menu);
    }

    this.menuElement = document.getElementById('context-menu');

    // Handle menu item clicks
    this.menuElement.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu__item');
      if (item && this.currentNode) {
        const action = item.dataset.action;
        this.handleAction(action, this.currentNode);
      }
      this.hide();
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!this.menuElement.contains(e.target)) {
        this.hide();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  },

  show(event, node) {
    if (!this.menuElement) this.init();

    this.currentNode = node;
    const isPinned = window.graphAPI?.isNodePinned?.(node.id) || node.pinned;

    // Update pin button text
    const pinItem = this.menuElement.querySelector('[data-action="pin"] span');
    if (pinItem) {
      const t = window.graphAPI?.t || ((key) => key);
      pinItem.textContent = isPinned ? (t('context_unpin') || 'Unpin') : (t('context_pin') || 'Pin');
    }

    // Position the menu
    const x = Math.min(event.pageX, window.innerWidth - 180);
    const y = Math.min(event.pageY, window.innerHeight - 200);

    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;
    this.menuElement.hidden = false;
  },

  hide() {
    if (this.menuElement) {
      this.menuElement.hidden = true;
      this.currentNode = null;
    }
  },

  handleAction(action, node) {
    const t = window.graphAPI?.t || ((key) => key);

    switch (action) {
      case 'focus':
        window.graphAPI?.focusOnNode(node.id);
        break;

      case 'pin':
        window.graphAPI?.toggleNodePin?.(node.id);
        break;

      case 'details':
        window.graphAPI?.showNodeDetails?.(node);
        break;

      case 'copy-link':
        const url = new URL(window.location.href);
        url.searchParams.set('focus', node.id);
        navigator.clipboard.writeText(url.toString()).then(() => {
          window.graphAPI?.showToast?.(t('toast_link_copied') || 'Link copied to clipboard');
        }).catch(() => {
          window.graphAPI?.showToast?.(t('toast_copy_failed') || 'Failed to copy link');
        });
        break;
    }
  }
};

// Initialize context menu
document.addEventListener('DOMContentLoaded', () => {
  contextMenu.init();
});

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

  // Undo: Ctrl/Cmd + Z
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
    e.preventDefault();
    const prevState = history.undo();
    if (prevState) {
      window.graphAPI?.restoreState?.(prevState);
    }
    return;
  }

  // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
  if ((e.metaKey || e.ctrlKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
    e.preventDefault();
    const nextState = history.redo();
    if (nextState) {
      window.graphAPI?.restoreState?.(nextState);
    }
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

    case 'p':
    case 'P':
      // Toggle pin for focused/selected node
      if (!e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const currentNodeId = window.graphAPI?.getSelectedNodeId?.() || window.graphAPI?.getFocusedNodeId?.();
        if (currentNodeId) {
          window.graphAPI?.toggleNodePin?.(currentNodeId);
        }
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
  '%c/ search  +/- zoom  0 reset  L labels  M minimap  F fullscreen  P pin  Ctrl+Z undo  ESC exit',
  'color: #5c5c6c; font-family: monospace; font-size: 11px;'
);

// ═══════════════════════════════════════════════════════════════════════════
// Export Control Utilities for graph.js integration
// ═══════════════════════════════════════════════════════════════════════════

window.controlsAPI = {
  history,
  focusHistory,
  urlState,
  contextMenu,
};
