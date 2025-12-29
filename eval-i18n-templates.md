# Eval i18n Templates

Purpose: document locale-specific query templates and heading stoplists used by
`eval generate-queries` (see `eval-dataset-generators.md`).

---

## 1. Format

This file documents recommended templates/stoplists. Implementations may load
the same content from i18n JSON files, but the semantics must match:

- Use `<topic>` placeholder for substitution.
- Templates should be short, question-like, and deterministic.
- Stoplists are exact-match after trimming and lowercasing (for Latin scripts).

---

## 2. English (en)

### Query templates
- `What is <topic>?`
- `Explain <topic>.`
- `How does <topic> work?`
- `Summarize <topic>.`

### Heading stoplist
- `intro`
- `introduction`
- `overview`
- `summary`
- `todo`
- `notes`

---

## 3. Korean (ko)

### Query templates
- `<topic>이(가) 무엇인지 설명해줘.`
- `<topic>의 핵심은 무엇인가요?`
- `<topic>은(는) 어떻게 동작하나요?`
- `<topic>을(를) 요약해줘.`

### Heading stoplist
- `서론`
- `개요`
- `요약`
- `할일`
- `할 일`
- `TODO`
- `노트`
- `메모`

---

## 4. Chinese (zh)

### Query templates
- `<topic>是什么？`
- `解释一下<topic>。`
- `<topic>是如何工作的？`
- `总结一下<topic>。`

### Heading stoplist
- `介绍`
- `概述`
- `概要`
- `摘要`
- `待办`
- `笔记`
- `备注`

---

## 5. Japanese (ja)

### Query templates
- `<topic>とは何ですか？`
- `<topic>を説明してください。`
- `<topic>はどのように動作しますか？`
- `<topic>を要約してください。`

### Heading stoplist
- `はじめに`
- `概要`
- `要約`
- `TODO`
- `メモ`
- `ノート`

---

## 6. Notes

- If a locale is missing, fallback to English templates.
- Keep stoplists small to avoid filtering out meaningful headings.
