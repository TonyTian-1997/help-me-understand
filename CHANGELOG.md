# Changelog

## 1.0.1 (2026-09-02)

Visual overhaul of the note design system — notes now match the full
"annotated textbook" look:

- **Left rail is back**: every note ships a fixed section-navigation rail
  (brand / date / section anchors / related notes), previously dropped and
  sorely missed — pages read as a book again, not a text wall
- **Element density quotas** (hard requirements in the skill guidance):
  ≥5 sections, ≥1 SVG diagram, ≥2 tables (closing glossary always), ≥1
  tree-shaped trace block, 2–3 deep dives with their own eli5 boxes, ≥2
  callouts with specific tag text, ≥4 `toys` keywords per analogy box
- Rewrote `note-template.html` as a full-fidelity skeleton (rail, diagram
  recipe, trace recipe, deep-dive structure, glossary)
- Hero conventions: two-line chapter titles, one highlighted takeaway
  clause in the lede
- `interactive.js` zh copy terminology aligned (笔记 not 讲义)

## 1.0.0 (2026-09-02)

Initial release.

- `/help-me-understand:eli5` skill: two-layer ELI5 answers (everyday analogy → engineering reality) with evidence citations and numbered deep-dive threads
- Interactive HTML notebook: self-contained annotated-textbook notes in `~/.understand/notes/`, styled after a paper textbook with highlighter marks, margin notes, and evidence-chain footnotes
- Select-to-ask in the browser: highlight any sentence in a note, ask a follow-up question, answers appear in an in-page drawer
- Local-only companion server (`127.0.0.1`, Python 3.9+ stdlib, macOS / Linux / Windows) with graceful offline fallback when Python is unavailable
- English-first with full Chinese documentation
