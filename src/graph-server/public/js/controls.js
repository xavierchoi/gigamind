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
  searchRecent: document.getElementById('search-recent'),
  searchRecentList: document.getElementById('search-recent-list'),
  searchRecentClear: document.getElementById('search-recent-clear'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomLevel: document.getElementById('zoom-level'),
  zoomSlider: document.getElementById('zoom-slider'),
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
  legend: document.getElementById('legend'),
  legendToggle: document.getElementById('legend-toggle'),
  filterButtons: document.querySelectorAll('.filter-btn'),
  loadMoreBtn: document.getElementById('load-more-btn'),
  loadAllBtn: document.getElementById('load-all-btn'),
  breadcrumb: document.getElementById('breadcrumb'),
  contextMenu: document.getElementById('context-menu'),
  shortcutsModal: document.getElementById('shortcuts-modal'),
  shortcutsModalClose: document.getElementById('shortcuts-modal-close'),
  themeToggle: document.getElementById('theme-toggle'),
};

// ═══════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════

let searchState = {
  query: '',
  results: [],
  selectedIndex: -1,
  isOpen: false,
  recentSelectedIndex: -1,
  isRecentOpen: false,
  activeDropdown: null, // 'results' | 'recent' | null
};

// ═══════════════════════════════════════════════════════════════════════════
// Recent Searches Management
// ═══════════════════════════════════════════════════════════════════════════

const RECENT_SEARCHES_KEY = 'gigamind_recent_searches';
const MAX_RECENT_SEARCHES = 5;

const recentSearches = {
  items: [],

  load() {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      this.items = stored ? JSON.parse(stored) : [];
    } catch {
      this.items = [];
    }
  },

  save() {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(this.items));
    } catch {
      // localStorage not available
    }
  },

  add(query) {
    if (!query || !query.trim()) return;

    const trimmed = query.trim();
    // Remove if already exists
    this.items = this.items.filter(item => item.toLowerCase() !== trimmed.toLowerCase());
    // Add to beginning
    this.items.unshift(trimmed);
    // Limit size
    if (this.items.length > MAX_RECENT_SEARCHES) {
      this.items = this.items.slice(0, MAX_RECENT_SEARCHES);
    }
    this.save();
  },

  remove(index) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.save();
    }
  },

  clear() {
    this.items = [];
    this.save();
  },

  getAll() {
    return this.items;
  }
};

// Load recent searches on init
recentSearches.load();

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

// Zoom Slider event handler
elements.zoomSlider?.addEventListener('input', (e) => {
  const zoomLevel = parseInt(e.target.value, 10) / 100;
  window.graphAPI?.setZoomLevel(zoomLevel);
  // Update aria-valuenow for accessibility
  e.target.setAttribute('aria-valuenow', e.target.value);
});

// Zoom level display click handler - reset to 100%
elements.zoomLevel?.addEventListener('click', () => {
  window.graphAPI?.setZoomLevel(1.0);
  if (elements.zoomSlider) {
    elements.zoomSlider.value = 100;
    elements.zoomSlider.setAttribute('aria-valuenow', '100');
  }
});

// Zoom level keyboard handler for accessibility
elements.zoomLevel?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    window.graphAPI?.setZoomLevel(1.0);
    if (elements.zoomSlider) {
      elements.zoomSlider.value = 100;
      elements.zoomSlider.setAttribute('aria-valuenow', '100');
    }
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// Legend Toggle
// ═══════════════════════════════════════════════════════════════════════════

const LEGEND_STORAGE_KEY = 'gigamind-legend-collapsed';

// Restore legend collapsed state from localStorage
function restoreLegendState() {
  const collapsed = localStorage.getItem(LEGEND_STORAGE_KEY) === 'true';
  if (collapsed && elements.legend) {
    elements.legend.classList.add('legend--collapsed');
    if (elements.legendToggle) {
      elements.legendToggle.setAttribute('aria-expanded', 'false');
    }
  }
}

// Initialize legend state on load
restoreLegendState();

elements.legendToggle?.addEventListener('click', () => {
  const legend = elements.legend;
  if (!legend) return;

  const isCollapsed = legend.classList.toggle('legend--collapsed');

  // Update aria-expanded
  elements.legendToggle.setAttribute('aria-expanded', String(!isCollapsed));

  // Save state to localStorage
  localStorage.setItem(LEGEND_STORAGE_KEY, String(isCollapsed));
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
// Theme Management
// ═══════════════════════════════════════════════════════════════════════════

const THEME_STORAGE_KEY = 'gigamind-theme';

/**
 * Initialize theme based on saved preference or system setting
 */
function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  // If no saved preference, CSS media query will handle system preference
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme');

  let newTheme;
  if (currentTheme === 'light') {
    newTheme = 'dark';
  } else if (currentTheme === 'dark') {
    newTheme = 'light';
  } else {
    // No explicit theme set, check system preference and toggle opposite
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    newTheme = prefersDark ? 'light' : 'dark';
  }

  root.setAttribute('data-theme', newTheme);
  localStorage.setItem(THEME_STORAGE_KEY, newTheme);

  // Notify graph to update minimap colors
  window.graphAPI?.updateMinimapColors?.();
}

/**
 * Listen for system theme preference changes
 */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (!savedTheme) {
    // No manual setting saved, system preference will apply via CSS
    // But we should update minimap colors
    window.graphAPI?.updateMinimapColors?.();
  }
});

// Theme toggle button handler
elements.themeToggle?.addEventListener('click', toggleTheme);

// Initialize theme on page load
initTheme();

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

  // Close recent searches when typing
  closeRecentDropdown();

  if (!query.trim()) {
    closeSearchDropdown();
    window.graphAPI?.searchNodes('');
    return;
  }

  const matches = window.graphAPI?.searchNodes(query) || [];
  searchState.results = matches;
  searchState.selectedIndex = -1;
  searchState.activeDropdown = 'results';

  renderSearchResults(matches, query);
  openSearchDropdown();
  updateAriaAttributes();
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
      <li class="search-results__empty" role="option" aria-disabled="true">${t('search_no_results')}</li>
    `;
    return;
  }

  // Limit to 10 results
  const displayResults = results.slice(0, 10);

  elements.searchResultsList.innerHTML = displayResults.map((node, index) => {
    const highlightedTitle = highlightMatch(node.title, query);
    const inbound = countInbound(node.id);
    const outbound = countOutbound(node.id);
    const isSelected = index === searchState.selectedIndex;
    const itemId = `search-result-${index}`;

    return `
      <li class="search-results__item"
          id="${itemId}"
          data-node-id="${node.id}"
          data-index="${index}"
          role="option"
          aria-selected="${isSelected}"
          tabindex="${isSelected ? '0' : '-1'}">
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
  searchState.activeDropdown = null;
  elements.searchResults.hidden = true;
  elements.searchInput.removeAttribute('aria-activedescendant');
}

function openRecentDropdown() {
  searchState.isRecentOpen = true;
  searchState.recentSelectedIndex = -1;
  searchState.activeDropdown = 'recent';
  if (elements.searchRecent) {
    elements.searchRecent.hidden = false;
  }
}

function closeRecentDropdown() {
  searchState.isRecentOpen = false;
  searchState.recentSelectedIndex = -1;
  if (searchState.activeDropdown === 'recent') {
    searchState.activeDropdown = null;
  }
  if (elements.searchRecent) {
    elements.searchRecent.hidden = true;
  }
  elements.searchInput.removeAttribute('aria-activedescendant');
}

function updateAriaAttributes() {
  // Update aria-activedescendant on the search input
  if (searchState.selectedIndex >= 0) {
    const itemId = `search-result-${searchState.selectedIndex}`;
    elements.searchInput.setAttribute('aria-activedescendant', itemId);
  } else {
    elements.searchInput.removeAttribute('aria-activedescendant');
  }
}

function navigateResults(direction) {
  if (!searchState.isOpen || searchState.results.length === 0) return;

  const maxIndex = Math.min(searchState.results.length - 1, 9);

  if (direction === 'down') {
    // If nothing selected, start at first item; otherwise move down
    if (searchState.selectedIndex < 0) {
      searchState.selectedIndex = 0;
    } else {
      searchState.selectedIndex = Math.min(searchState.selectedIndex + 1, maxIndex);
    }
  } else {
    // If nothing selected, start at last item; otherwise move up
    if (searchState.selectedIndex < 0) {
      searchState.selectedIndex = maxIndex;
    } else if (searchState.selectedIndex === 0) {
      // Wrap around to deselect (allows cycling through)
      searchState.selectedIndex = -1;
    } else {
      searchState.selectedIndex = searchState.selectedIndex - 1;
    }
  }

  updateSelectedResult();
  updateAriaAttributes();
}

function updateSelectedResult() {
  elements.searchResultsList.querySelectorAll('.search-results__item').forEach((item, index) => {
    const isSelected = index === searchState.selectedIndex;
    item.classList.toggle('search-results__item--selected', isSelected);
    item.setAttribute('aria-selected', String(isSelected));
    item.setAttribute('tabindex', isSelected ? '0' : '-1');
  });

  // Scroll selected item into view
  const selected = elements.searchResultsList.querySelector('.search-results__item--selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function confirmSelection() {
  if (searchState.selectedIndex >= 0 && searchState.selectedIndex < searchState.results.length) {
    const node = searchState.results[searchState.selectedIndex];
    // Save search query to recent searches
    if (searchState.query) {
      recentSearches.add(searchState.query);
    }
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
      if (searchState.isOpen && searchState.results.length > 0) {
        // If no item is selected, default to first result
        if (searchState.selectedIndex < 0) {
          searchState.selectedIndex = 0;
        }
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
// Shortcuts Modal
// ═══════════════════════════════════════════════════════════════════════════

const shortcutsModal = {
  isOpen: false,

  open() {
    if (!elements.shortcutsModal) return;
    this.isOpen = true;
    elements.shortcutsModal.hidden = false;
    // Focus the close button for keyboard accessibility
    elements.shortcutsModalClose?.focus();
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
  },

  close() {
    if (!elements.shortcutsModal) return;
    this.isOpen = false;
    elements.shortcutsModal.hidden = true;
    // Restore body scroll
    document.body.style.overflow = '';
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
};

// Shortcuts modal event listeners
elements.shortcutsModalClose?.addEventListener('click', () => {
  shortcutsModal.close();
});

// Close modal when clicking on backdrop
elements.shortcutsModal?.querySelector('.shortcuts-modal__backdrop')?.addEventListener('click', () => {
  shortcutsModal.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard Shortcuts
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', (e) => {
  // Handle ? key even when in search input
  if (e.key === '?') {
    e.preventDefault();
    shortcutsModal.toggle();
    return;
  }

  // Don't trigger other shortcuts when typing in search
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
      // Close shortcuts modal first if open
      if (shortcutsModal.isOpen) {
        shortcutsModal.close();
      } else if (!elements.focusIndicator.hidden) {
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

/**
 * Update the zoom slider and display to reflect the current zoom level
 * Called from graph.js when zoom changes
 * @param {number} zoomLevel - Current zoom level (0.1 to 5.0)
 */
function updateZoomSlider(zoomLevel) {
  const sliderValue = Math.round(zoomLevel * 100);
  if (elements.zoomSlider) {
    elements.zoomSlider.value = sliderValue;
    elements.zoomSlider.setAttribute('aria-valuenow', String(sliderValue));
  }
  if (elements.zoomLevel) {
    elements.zoomLevel.textContent = `${sliderValue}%`;
  }
}

window.controlsAPI = {
  history,
  focusHistory,
  urlState,
  contextMenu,
  updateZoomSlider,
  shortcutsModal,
};
