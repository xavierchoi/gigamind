# Eval i18n Integration Design

Purpose: map eval query templates and stoplists into the project's i18n system.
Status: design-only (no code in this document).

---

## 1. i18n Namespace

Add a new namespace: `eval`

Proposed files:
- `src/i18n/locales/en/eval.json`
- `src/i18n/locales/ko/eval.json`
Optional (when eval CLI supports these locales):
- `src/i18n/locales/zh/eval.json`
- `src/i18n/locales/ja/eval.json`

Wire into `src/i18n/index.ts`:
- add `eval` to `ns` list
- load `eval.json` for `en` and `ko`

---

## 2. JSON Schema

```
{
  "query_templates": {
    "default": [
      "What is <topic>?",
      "Explain <topic>.",
      "How does <topic> work?",
      "Summarize <topic>."
    ]
  },
  "heading_stoplist": {
    "default": [
      "intro",
      "introduction",
      "overview",
      "summary",
      "todo",
      "notes"
    ]
  }
}
```

Rules:
- `<topic>` is the only placeholder.
- Implementations should lower-case stoplist comparisons for Latin scripts.
- If a locale is missing, fall back to English.

---

## 3. Korean Example (`ko/eval.json`)

```
{
  "query_templates": {
    "default": [
      "<topic>이(가) 무엇인지 설명해줘.",
      "<topic>의 핵심은 무엇인가요?",
      "<topic>은(는) 어떻게 동작하나요?",
      "<topic>을(를) 요약해줘."
    ]
  },
  "heading_stoplist": {
    "default": [
      "서론",
      "개요",
      "요약",
      "할일",
      "할 일",
      "TODO",
      "노트",
      "메모"
    ]
  }
}
```

---

## 4. Additional Locales

If `zh`/`ja` are supported by eval CLI, their JSON files should mirror the
templates in `eval-i18n-templates.md`. UI language support can remain `ko/en`
if desired; eval locale loading can be scoped to the CLI only.

---

## 5. Generator Integration

`eval generate-queries` should:
- Load `eval.query_templates.default` based on locale.
- Load `eval.heading_stoplist.default` based on locale.
- If locale is not specified, infer from note language or fall back to `en`.

Suggested CLI flag:
- `--locale <lang>`: override automatic inference (default: auto).

---

## 5. References

- `eval-i18n-templates.md`: template and stoplist content.
- `eval-dataset-generators.md`: generator behavior.
