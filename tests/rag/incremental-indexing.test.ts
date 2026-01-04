/**
 * Tests for incremental indexing functionality
 *
 * Verifies that:
 * 1. Metadata is persisted to index-meta.json
 * 2. Only changed notes are re-indexed
 * 3. Deleted notes are removed from the index
 * 4. New notes are added to the index
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RAGIndexer } from "../../src/rag/indexer.js";
import { InMemoryVectorStore } from "../../src/rag/vectorStore.js";
import type { EmbeddingServiceInterface, DocumentChunkerInterface } from "../../src/rag/indexer.js";
import type { Chunk } from "../../src/rag/chunker.js";

// Mock embedding service that returns consistent embeddings
class MockEmbeddingService implements EmbeddingServiceInterface {
  async embedBatch(texts: string[]): Promise<Array<{ vector: number[] }>> {
    return texts.map((text) => ({
      vector: Array(384).fill(0).map((_, i) => (text.charCodeAt(i % text.length) || 0) / 256),
    }));
  }
}

// Mock chunker that returns simple chunks
class MockChunker implements DocumentChunkerInterface {
  chunk(content: string): Chunk[] {
    // Split by double newline for simplicity
    const parts = content.split(/\n\n+/).filter((p) => p.trim());
    let offset = 0;
    return parts.map((part, index) => {
      const trimmed = part.trim();
      const startOffset = offset;
      const endOffset = startOffset + trimmed.length;
      offset = endOffset + 2; // Account for \n\n
      return {
        content: trimmed,
        startOffset,
        endOffset,
        index,
        metadata: {
          hasHeader: false,
        },
      };
    });
  }
}

describe("RAGIndexer Incremental Indexing", () => {
  let tempDir: string;
  let notesDir: string;
  let metaPath: string;
  let vectorStore: InMemoryVectorStore;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gigamind-test-"));
    notesDir = path.join(tempDir, "notes");
    metaPath = path.join(tempDir, ".gigamind", "index-meta.json");
    await fs.mkdir(notesDir, { recursive: true });

    vectorStore = new InMemoryVectorStore();
    await vectorStore.initialize();
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createNote(filename: string, content: string): Promise<string> {
    const filePath = path.join(notesDir, filename);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  function createIndexer(): RAGIndexer {
    return new RAGIndexer({
      notesDir,
      metaPath,
      embeddingService: new MockEmbeddingService(),
      chunker: new MockChunker(),
      vectorStore,
    });
  }

  it("should save metadata to index-meta.json after indexAll", async () => {
    // Create a note
    const testNotePath = await createNote("test.md", `---
id: test-note
title: Test Note
---

This is test content.

Another paragraph.
`);

    const indexer = createIndexer();
    await indexer.indexAll();

    // Check that metadata file was created
    const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
    expect(metaExists).toBe(true);

    // Verify metadata content (now keyed by notePath, version 2)
    const metaContent = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(meta.version).toBe(2);
    expect(meta.notes).toBeDefined();
    expect(Object.keys(meta.notes).length).toBe(1);
    expect(meta.notes[testNotePath]).toBeDefined();
    expect(meta.notes[testNotePath].noteId).toBe("test-note");
    expect(meta.notes[testNotePath].contentHash).toBeDefined();
  });

  it("should skip unchanged notes in incremental indexing", async () => {
    // Create notes
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);

    // First full index
    const indexer1 = createIndexer();
    await indexer1.indexAll();

    const initialCount = await vectorStore.count();
    expect(initialCount).toBeGreaterThan(0);

    // Create new indexer (simulates new session) and run incremental
    const indexer2 = createIndexer();
    const result = await indexer2.indexIncremental();

    // No changes expected
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);

    // Document count should be the same
    const finalCount = await vectorStore.count();
    expect(finalCount).toBe(initialCount);
  });

  it("should re-index only modified notes", async () => {
    // Create initial notes
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Original content.
`);
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);

    // First full index
    const indexer1 = createIndexer();
    await indexer1.indexAll();

    // Modify note1
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Modified content!
`);

    // Add small delay to ensure different modification time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create new indexer and run incremental
    const indexer2 = createIndexer();
    const result = await indexer2.indexIncremental();

    // Only note1 should be updated
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.removed).toBe(0);
  });

  it("should detect and index new notes", async () => {
    // Create initial note
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);

    // First full index
    const indexer1 = createIndexer();
    await indexer1.indexAll();

    // Add new note
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);

    // Create new indexer and run incremental
    const indexer2 = createIndexer();
    const result = await indexer2.indexIncremental();

    // note2 should be added
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);
  });

  it("should remove deleted notes from index", async () => {
    // Create notes
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);

    // First full index
    const indexer1 = createIndexer();
    await indexer1.indexAll();

    const initialCount = await vectorStore.count();

    // Delete note2
    await fs.unlink(path.join(notesDir, "note2.md"));

    // Create new indexer and run incremental
    const indexer2 = createIndexer();
    const result = await indexer2.indexIncremental();

    // note2 should be removed
    expect(result.added).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(1);

    // Count should be reduced
    const finalCount = await vectorStore.count();
    expect(finalCount).toBeLessThan(initialCount);
  });

  it("should handle multiple changes in one incremental update", async () => {
    // Create initial notes
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);
    await createNote("note3.md", `---
id: note3
title: Note 3
---

Content 3.
`);

    // First full index
    const indexer1 = createIndexer();
    await indexer1.indexAll();

    // Make various changes:
    // - Delete note1
    await fs.unlink(path.join(notesDir, "note1.md"));

    // - Modify note2
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Modified content 2!
`);

    // - Add note4
    await createNote("note4.md", `---
id: note4
title: Note 4
---

Content 4.
`);

    // Add small delay to ensure different modification time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create new indexer and run incremental
    const indexer2 = createIndexer();
    const result = await indexer2.indexIncremental();

    // Check results
    expect(result.added).toBe(1);    // note4
    expect(result.updated).toBe(1);  // note2
    expect(result.removed).toBe(1);  // note1
  });

  it("should persist metadata after indexNote", async () => {
    // Create and index initial note
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);

    const indexer = createIndexer();
    await indexer.indexAll();

    // Index a new note using indexNote
    await createNote("note2.md", `---
id: note2
title: Note 2
---

Content 2.
`);

    const note2Path = path.join(notesDir, "note2.md");
    await indexer.indexNote(note2Path);

    // Verify metadata was updated (now keyed by notePath)
    const metaContent = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);
    expect(Object.keys(meta.notes).length).toBe(2);
    expect(meta.notes[note2Path]).toBeDefined();
    expect(meta.notes[note2Path].noteId).toBe("note2");
  });

  it("should trigger full reindex when metadata file is missing but vectors exist", async () => {
    // Create notes and index them
    await createNote("note1.md", `---
id: note1
title: Note 1
---

Content 1.
`);

    const indexer1 = createIndexer();
    await indexer1.indexAll();

    const initialCount = await vectorStore.count();
    expect(initialCount).toBeGreaterThan(0);

    // Delete metadata file (simulates upgrade or corruption)
    await fs.unlink(metaPath);

    // Create new indexer - loadMetadata should return { loaded: false, reason: "file_not_found" }
    const indexer2 = createIndexer();
    const metaResult = await indexer2.loadMetadata();

    expect(metaResult.loaded).toBe(false);
    expect(metaResult.reason).toBe("file_not_found");
    expect(metaResult.noteCount).toBe(0);

    // Running indexIncremental without clearing vectors first would cause duplication
    // The fix is that RAGService.initialize() checks metaResult and triggers full reindex
    // Here we verify the metadata load result indicates the problem
  });

  it("should handle duplicate noteId in frontmatter without metadata collision", async () => {
    // Create two notes with the same noteId in frontmatter
    await createNote("note-a.md", `---
id: duplicate-id
title: Note A
---

Content A.
`);
    await createNote("note-b.md", `---
id: duplicate-id
title: Note B
---

Content B.
`);

    // Index both notes
    const indexer = createIndexer();
    await indexer.indexAll();

    // Both notes should be in metadata (keyed by notePath, not noteId)
    const metaContent = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent);

    // Should have 2 metadata entries (keyed by path, not noteId)
    expect(Object.keys(meta.notes).length).toBe(2);

    // Check both paths are present
    const noteAPath = path.join(notesDir, "note-a.md");
    const noteBPath = path.join(notesDir, "note-b.md");
    expect(meta.notes[noteAPath]).toBeDefined();
    expect(meta.notes[noteBPath]).toBeDefined();

    // Both should have the same noteId but different paths
    expect(meta.notes[noteAPath].noteId).toBe("duplicate-id");
    expect(meta.notes[noteBPath].noteId).toBe("duplicate-id");

    // Note: Vector documents still use noteId for chunk IDs, so duplicate
    // noteIds can cause chunk ID collisions in the vector store.
    // This test verifies metadata collision is fixed; vector ID collision
    // is a separate concern (users should use unique IDs in frontmatter).
  });
});
