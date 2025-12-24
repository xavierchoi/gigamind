import { watch, FSWatcher } from 'node:fs';
import { EventEmitter } from 'node:events';
import path from 'node:path';

/**
 * Interface for cache implementations that support file-based invalidation.
 * The file watcher depends on this interface to invalidate cache entries
 * when files change on disk.
 */
export interface IncrementalCache {
  /**
   * Invalidate all cache entries associated with a specific file.
   * @param filePath - Absolute path to the file that changed
   * @returns Array of cache keys that were invalidated
   */
  invalidateByFile(filePath: string): string[];
}

export interface CacheInvalidatedEvent {
  filePath: string;
  invalidated: string[];
}

export interface NoteFileWatcherEvents {
  cacheInvalidated: (event: CacheInvalidatedEvent) => void;
}

/**
 * File watcher for real-time cache invalidation of markdown notes.
 * Watches a directory for changes to .md files and invalidates
 * corresponding cache entries with debouncing to handle rapid changes.
 *
 * @example
 * ```typescript
 * const watcher = new NoteFileWatcher('/path/to/notes', cache, 300);
 * watcher.on('cacheInvalidated', ({ filePath, invalidated }) => {
 *   console.log(`Invalidated ${invalidated.length} entries for ${filePath}`);
 * });
 * watcher.start();
 * // ... later
 * watcher.stop();
 * ```
 */
export class NoteFileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private debounceMs: number;

  constructor(
    private notesDir: string,
    private cache: IncrementalCache,
    debounceMs = 300
  ) {
    super();
    this.debounceMs = debounceMs;
  }

  start(): void {
    this.watcher = watch(
      this.notesDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename?.endsWith('.md')) return;
        const fullPath = path.join(this.notesDir, filename);
        this.debouncedInvalidate(fullPath);
      }
    );
  }

  stop(): void {
    this.watcher?.close();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private debouncedInvalidate(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const invalidated = this.cache.invalidateByFile(filePath);
      if (invalidated.length > 0) {
        this.emit('cacheInvalidated', { filePath, invalidated });
      }
      this.debounceTimers.delete(filePath);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }
}
