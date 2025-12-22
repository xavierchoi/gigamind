/**
 * GigaMind Knowledge Graph — UI Controls
 * Keyboard shortcuts, button handlers, and search functionality
 */

// ═══════════════════════════════════════════════════════════════════════════
// DOM Elements
// ═══════════════════════════════════════════════════════════════════════════

const elements = {
  searchInput: document.getElementById('search-input'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  resetView: document.getElementById('reset-view'),
  exitFocus: document.getElementById('exit-focus'),
  closeSidebar: document.getElementById('close-sidebar'),
  focusIndicator: document.getElementById('focus-indicator'),
  sidebar: document.getElementById('node-sidebar'),
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

elements.exitFocus.addEventListener('click', () => {
  window.graphAPI?.exitFocusMode();
});

elements.closeSidebar.addEventListener('click', () => {
  window.graphAPI?.hideNodeDetails();
});

// ═══════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════

let searchDebounceTimer = null;

elements.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    window.graphAPI?.searchNodes(e.target.value.trim());
  }, 150);
});

elements.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    e.target.blur();
    window.graphAPI?.searchNodes('');
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
      // Focus search
      e.preventDefault();
      elements.searchInput.focus();
      break;

    case 'Escape':
      // Exit focus mode or close sidebar
      if (!elements.focusIndicator.hidden) {
        window.graphAPI?.exitFocusMode();
      } else if (!elements.sidebar.hidden) {
        window.graphAPI?.hideNodeDetails();
      }
      break;

    case '+':
    case '=':
      // Zoom in
      e.preventDefault();
      window.graphAPI?.zoomIn();
      break;

    case '-':
    case '_':
      // Zoom out
      e.preventDefault();
      window.graphAPI?.zoomOut();
      break;

    case '0':
      // Reset view
      e.preventDefault();
      window.graphAPI?.resetView();
      break;

    case 'f':
    case 'F':
      // Toggle fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
      break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Touch Support (mobile)
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
      if (scale > 1.1) {
        window.graphAPI?.zoomIn();
        touchStartDistance = distance;
      } else if (scale < 0.9) {
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
// Heartbeat (keep server alive)
// ═══════════════════════════════════════════════════════════════════════════

setInterval(() => {
  fetch('/api/heartbeat').catch(() => {
    // Server might be down, ignore
  });
}, 60 * 1000); // Every minute

// ═══════════════════════════════════════════════════════════════════════════
// Visibility Change (pause when hidden)
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab is hidden, could pause simulation
  } else {
    // Tab is visible again
    // Could refresh data here
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Console Info
// ═══════════════════════════════════════════════════════════════════════════

console.log(
  '%cGigaMind Knowledge Graph',
  'font-size: 16px; font-weight: bold; color: #a78bfa;'
);
console.log(
  '%cKeyboard shortcuts: / (search), +/- (zoom), 0 (reset), ESC (exit focus), F (fullscreen)',
  'color: #8888a0;'
);
