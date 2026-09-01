# Changelog

## 1.1.0 (2026-09-02)

Interactive Q&A layer redesigned as document-style comment threads:

- **Persistent passage highlights**: quoted text stays amber-highlighted in
  the document (deepens on hover, flashes when jumped to) instead of a
  dotted underline
- **Right comment sidebar**: slides in from the edge, white, thread cards
  with round avatars, name + time, quoted-passage chip, and the Claude
  answer as an indented reply
- **Hover-linking**: hover a card to light up its passage in the text;
  click a card to scroll to it and flash it; click a passage to open its
  thread
- **Inline reply**: a reply box under each thread continues the
  conversation with the same quoted context
- **Resolve**: mark a thread resolved — its highlight dissolves, the card
  sinks to the bottom, and `pending` no longer counts it; backed by a new
  append-only `resolve` event (`POST /resolve`)
- Circular comment FAB with an unread-answer count badge; full i18n of all
  new strings

## 1.0.2 (2026-09-02)

Critical fix: pages served over HTTP rendered unstyled.

- **Assets now live inside the served directory** (`~/.understand/notes/assets/`)
  and pages reference them as `assets/…`. Previously assets sat one level
  above the server root, so the browser's stylesheet request resolved to a
  404 and every page loaded as raw unstyled HTML (file:// viewing masked
  the bug)
- Skill guidance now states the invariant explicitly: a note must never
  reference anything outside the served directory
- README architecture diagrams updated

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
