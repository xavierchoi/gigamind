# Eval Dataset Generators Design

Purpose: define deterministic dataset bootstrap commands for search and link eval.
Status: design-only (no code in this document).

---

## 1. Shared Behavior

- Deterministic randomness via `--seed`.
- Notes are read from `--notes` (read-only).
- Paths are stored relative to `--notes`.
- All character offsets are UTF-16 code units (JS `String.slice()`).
- All anchor ranges use half-open intervals: `[start, end)`.
- IDs are stable hashes: `sha1(<relpath>|<anchor>|<seed>|<index>)`.
- Skip files under excluded patterns:
  `.git/`, `.gigamind/`, `eval/`, `node_modules/`, `.DS_Store`, `*.tmp`, `*.swp`.

---

## 2. generate-queries (search dataset)

### 2.1 CLI

```
gigamind eval generate-queries --notes <dir> --out <path> [options]
```

Options:
- `--max-per-note <int>`: max queries per note (default: 3)
- `--include-headers`: include H1-H3 headings (default: title only)

### 2.2 Inputs

- Markdown files under `--notes`.
- Frontmatter is parsed with `parseNote()` (title, body).

### 2.3 Candidate Extraction

1. Title:
   - Use frontmatter `title` if present, else file basename.
2. Headings (optional):
   - Extract `#`, `##`, `###` from body.
   - Ignore headings inside code fences.

### 2.4 Filtering Heuristics

- Skip headings shorter than 3 chars.
- Skip headings in a stoplist: `intro`, `overview`, `todo`, `notes`,
  plus locale-specific equivalents (loaded from i18n config).
- Deduplicate identical headings per note.

### 2.5 Query Templates (locale-aware)

Examples:
- `What is <topic>?`
- `Explain <topic>.`
- `How does <topic> work?`
- `Summarize <topic>.`

Locale notes:
- English examples are listed inline.
- Non-English templates should be sourced from i18n resources (no inline text here).

Selection:
- Always include title-based query first.
- Sample additional queries up to `--max-per-note`.
- If heading contains punctuation, prefer `Explain <topic>.`

### 2.6 Output Record

```
{
  "id": "q-<hash>",
  "query": "What is <topic>?",
  "answerable": true,
  "expected_notes": ["path/to/note.md"],
  "expected_spans": [
    {
      "note_path": "path/to/note.md",
      "start": 123,
      "end": 240,
      "text": "optional snapshot"
    }
  ]
}
```

Span logic:
- If the query is derived from a heading, include `expected_spans`
  using the heading range in the full file content.
- If headings are parsed from the body (frontmatter stripped), add the
  frontmatter length offset to map into full-file indices.
- If not available, omit `expected_spans`.

---

## 3. generate-links (links dataset)

### 3.1 CLI

```
gigamind eval generate-links --notes <dir> --out-notes <dir> --dataset <path> [options]
```

Options:
- `--remove-ratio <float>`: ratio of links to remove (default: 0.3)
- `--seed <int>`: deterministic RNG seed (default: 42)

### 3.2 Copy Step

- Copy `--notes` to `--out-notes` (read-only source).
- Preserve file tree and frontmatter.
- Exclude patterns same as hashing excludes.

### 3.3 Link Extraction

Use `parseWikilinks(content)` to get:
- `target`, `alias`, `position.start`, `position.end`

Visible text:
- If `alias` exists -> use alias
- Else -> use `target` (strip section suffix)

### 3.4 Removal Algorithm

Goal: replace `[[...]]` with visible text and record `anchor_range` in modified content.

Recommended method:
1. Collect all wikilinks with positions.
2. Sort by `position.start` descending.
3. For each link selected for removal:
   - Replace the full `[[...]]` with visible text.
   - Record `anchor_range` as the replacement range in the modified content.
4. Write modified content to `--out-notes`.

This avoids complex offset recalculation for multiple edits.

### 3.5 Selection Strategy

- Use seeded RNG to select links to remove by ratio.
- Optional (future): ensure at least one removal per note.
- Optional (future): dedupe by target to avoid many near-identical samples.

### 3.6 Output Record

```
{
  "id": "l-<hash>",
  "source_note": "path/to/note.md",
  "anchor": "Visible text",
  "anchor_range": { "start": 145, "end": 152 },
  "expected_links": ["Target Note"]
}
```

Optional:
- `context`: short snippet around anchor from modified content.

---

## 4. Validation and Reporting

After generation:
- Verify that each `anchor_range` matches `anchor` in modified content.
- Emit summary counts: notes processed, links found, links removed.
- If `--dry-run` is added later, skip writes and only report counts.

---

## 5. Testing Checklist (minimal)

- Headings extraction ignores code fences.
- Anchor ranges remain valid after multiple replacements.
- RNG is deterministic across runs with the same seed.
