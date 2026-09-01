# Changelog

## 1.6.2 (2026-09-02)

- **Commenting while reading comments works again**: selecting a passage
  with the sidebar open now summons the comment button — the earlier
  blanket hide made "reading comments" and "asking a new question"
  mutually exclusive. The exclusion is now spatial instead of modal:
  passages hidden behind the sidebar are off-limits, and both the button
  and the ask bubble are clamped to never cross the sidebar's edge
- Opening the ask bubble while a thread's reply box is open closes the
  reply box — one composing state at a time

## 1.6.1 (2026-09-02)

- Layer exclusion is now enforced inside the functions, not by event
  order: `openPanel` closes any open ask bubble regardless of the path
  that opened the sidebar, and `openPopover` refuses while the sidebar
  is open (a keyboard or touch entry could previously slip past the
  mousedown-based closing)
- The draft "writing" badge hides while the sidebar is open
- Draft auto-refresh holds off while a sidebar is open or a question is
  being composed, so a finished draft never reloads the page out from
  under an in-progress comment

## 1.6.0 (2026-09-02)

Fast-first note generation — the URL in seconds, the page that grows:

- **`note_tool.py start`**: plans 5–7 section titles, writes an outline
  body, and builds a draft page in ~0.1s — the reader gets the URL in
  the first seconds of the reply instead of after minutes of silent
  writing
- **Self-updating drafts**: draft pages carry an `hmu-draft` meta; the
  interactive layer shows a "writing" badge and reloads itself whenever
  a newer build lands (server-to-server size diff, 5s check). The final
  build drops the flag and the page settles
- `build --draft` marks interim rebuilds; the skill's Step 3 now
  mandates the fast-first flow: outline → URL immediately → grow
  sections with `--draft` rebuilds → final build + lint → one-line close
- Per-section writing placeholders localized (en/zh)

## 1.5.1 (2026-09-02)

Lifecycle corrected: resident server, invisible offline.

- **Resident by default** (`--idle-timeout 0`): the server holds its
  localhost port like a language server until reboot — note URLs never
  die, the comment bubble is always alive. Explicit release via the new
  `qa_tool.py stop` (pidfile-based); `--idle-timeout <sec>` remains
  available for auto-release deployments. A browser page cannot spawn a
  process, so click-to-revive inside the page isn't physically possible;
  residency removes the need for it
- **Offline is invisible**: when the server is ever unreachable, the
  comment layer hides itself completely — no gray "offline" button, no
  banner; the note reads as a clean static page and comments reappear
  the moment the server answers
- Server writes a pidfile; launcher/bin copies refresh on regeneration

## 1.5.0 (2026-09-02)

Port lifecycle — release when nobody's reading, revive in one action:

- **Idle release**: the server now exits after 1h with no requests
  (default `--idle-timeout 3600`; 0 = hold forever). Any note open in a
  browser keeps it alive via the 8s poll, so the port is released only
  when nobody is reading; the skill's health probe restarts it in ~1s
- **Double-click revival**: `note_tool.py launchers` installs
  `~/.understand/Start Notes.command` (macOS) / `Start Notes.bat`
  (Windows) plus a stable `~/.understand/bin/` script copy — one
  double-click revives the server and opens the index, no Claude
  needed. The skill regenerates them whenever the interpreter or port
  changes
- Already-loaded pages keep rendering when the server sleeps; only
  commenting pauses

## 1.4.1 (2026-09-02)

- **UI language audit**: verified every comment-layer string is fully
  localized (key sets symmetric en/zh, zero CJK reachable outside the
  zh locale block) — English browsers get an all-English UI
- New `data-lang="en|zh"` attribute on the `interactive.js` tag forces a
  UI language regardless of browser locale
- Generated `index.html` now carries the server port on its script tag
  (same-origin serving made this invisible; file:// opens now work too)
- Body template states explicitly that the eli5 tag line must be written
  in the note's own language

## 1.4.0 (2026-09-02)

Answers that keep their context, quality, and speed:

- **Context-injected answering**: `qa_tool.py pending/watch --context`
  embeds each question's note context — title, lede, the section
  containing the quoted passage (whitespace/tag-insensitive match), and
  glossary terms the question hits (head-word matching, aliases
  stripped). Answers stay inside the note's metaphor system even after
  context compaction or a session restart, with zero extra tool calls
- **Answering discipline** in the skill: never answer without context,
  reuse the note's metaphor nouns, drawer-safe formatting only
  (paragraphs / bold / code / lists — no headers or tables), ~150-word
  default budget
- **Faster wake-up**: watcher polling 5s → 2s
- **Session hygiene**: first touch of anything note-related runs
  `pending --context` and clears the backlog; vague note references
  resolve via catalog.json
- **Selection button reliability**: a `selectionchange` safety net
  (debounced, suppressed mid-drag) now shows the comment button even
  when the mouseup is lost (drag released outside the window, keyboard
  selection, browser quirks)
- The thread reply action is labeled "Ask a question" / 「继续提问」,
  matching what it actually does

## 1.3.2 (2026-09-02)

- **Resolve now deletes the thread**: resolving removes the comment card
  (and its replies) from the sidebar outright, instead of dimming it and
  sinking it to the bottom; the in-passage highlight and badge dissolve as
  before. When every thread on a page is resolved the sidebar shows a
  small "all resolved" state, and the header count tracks open threads
  only. Dead resolved-state styling removed

## 1.3.1 (2026-09-02)

- **Per-page comment threads**: each note's sidebar now shows only the
  threads asked on that page — previously the single Q&A log rendered on
  every page, mixing questions from different notes into one list.
  Filtering is client-side by the stored `page` field; answers and
  resolves still flow through the shared log, and Claude keeps answering
  globally by question id

## 1.3.0 (2026-09-02)

Body/build split — the model writes content, the tool owns structure.

- **`note_tool.py`**: new `build` command assembles the page from a body
  file (`~/.understand/src/<slug>.html`): skeleton, hero (two-line title
  via `|`), **auto-generated rail derived from the section titles**,
  related-notes links from the catalog, pager/colophon (localized),
  catalog upsert, and index rebuild — all idempotent, so long notes can
  be built early and grow on refresh (progressive writing)
- **`note_tool.py lint`**: deterministic quality gate — element quotas
  (sections / diagram / tables / trace / deep dives / callouts / toys /
  highlighter marks / evidence items), rail-anchor resolution, no refs
  outside the served directory, asset existence, lang attribute
- **Token & speed**: skeleton, rail, and index are no longer generated
  per note (~2–3K output tokens saved on top of 1.2.0's chat cut);
  SVG `<style>` blocks hoisted into `style.css` and the eli5 star became
  a CSS `::before` (`:has`-guarded so older notes keep their inline
  stars); pipeline reordered environment-first so the build always has
  its port, with server + watcher launched in one parallel block
- Structural defects (missing rail, wrong class names, asset-path drift)
  are now impossible by construction rather than checked after the fact

## 1.2.0 (2026-09-02)

**The note is the answer.** The chat explanation is gone — the skill now
writes the annotated note directly and replies with a two-line
confirmation (title + URL). Cuts 2–3K output tokens and 30–60s of latency
from every invocation; the terminal was duplicating what the note says
better.

- SKILL.md restructured to a four-step pipeline (identify → note →
  server → watcher); the quality rubric now governs notes and browser
  answers alike
- Chat follow-ups stay brief in-terminal and get their full ELI5
  treatment appended to the note
- README (en/zh) and marketplace descriptions updated to match

## 1.1.4 (2026-09-02)

- Code comments in the bundled JS/CSS and the ops reference now describe
  the interaction in neutral, self-contained terms

## 1.1.3 (2026-09-02)

- **Sidebar open = all floating controls step aside**: the selection
  comment button no longer appears anywhere on the page while the comment
  sidebar is open (previously only selections *behind* the sidebar were
  suppressed, so the button still floated over visible text and even
  re-appeared right after opening the sidebar)
- The round 💬 button hides while the sidebar is open — it was sitting on
  top of the sidebar's bottom corner — and returns on close, where a live
  selection immediately re-summons the selection button

## 1.1.2 (2026-09-02)

- **Cache fix**: the notes server now sends `Cache-Control: no-cache`, so
  browsers always revalidate `interactive.js` / `qa.css` — asset updates
  arrive on the next reload instead of being served stale from heuristic
  cache (this is why the 1.1.1 collision fixes didn't reach some open pages)
- Opening a thread's inline reply box now also releases the page
  selection, and the floating comment button stays hidden while composing

## 1.1.1 (2026-09-02)

Interaction polish for the comment layer:

- The ask bubble now positions **around** the quoted passage (above it
  when there's room, below otherwise) instead of opening on top of it
- Opening the bubble always hides the floating selection button, and
  vice versa — they can no longer stack
- Following up in a thread (reply box) collapses any open ask bubble
- Sending a question releases the page selection, so the floating button
  no longer resurrects over the freshly anchored highlight
- Selecting text inside the sidebar (e.g. copying an answer) no longer
  summons the button; passages hidden behind the open sidebar aren't
  offered for comment

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
