# Note design vocabulary — annotated textbook

Every note is one self-contained HTML page styled like a paper textbook a
friendly tutor has already annotated: a left rail outlining the chapter,
highlighter over the sentences that matter, a pencil note in the margin,
footnotes proving every claim. The stylesheet
(`~/.understand/notes/assets/style.css`) ships the entire vocabulary; your job is
choosing where each element goes — **and using enough of them. A note that
is mostly paragraphs with one yellow box per section is a failed note.**

## Element quotas (hard requirements)

| Scope | Requirement |
|---|---|
| Whole note | ≥ 5 sections (`section.block`) |
| Whole note | ≥ 1 **SVG diagram** (`figure.diag`, recipe below) |
| Whole note | ≥ 2 **tables** (one of them = closing glossary, always) |
| Whole note | ≥ 1 **trace block** (tree-shaped walk-through, recipe below) |
| Whole note | 2–3 **deep dives** (`h3` + own eli5 box) |
| Whole note | ≥ 2 **callouts** with specific tag text |
| Per section | eli5 box first, then **≥ 2 other element types** (figure / table / trace / pre / row+mn / callout) |
| Per eli5 box | ≥ 4 `<span class="toys">` keywords |
| Whole note | ~20–30 KB — a note half the size of a good blog post is unfinished |

If the topic feels too small to fill this, the topic is too small — split
it or pick a bigger slice.

## Page skeleton

```
nav.rail                        brand / date / section anchors / related notes
main.main > div.content
├── header.hero                 eyebrow / h1.chapter (2 lines) / lede / hero-rule
├── section.block (×N)          one per sub-topic, id="s1"… (numbers: 1, 2, 3…)
├── div.sources                 evidence chain ([S1]…[Sn])
├── footer.pager                ← index / next →
└── footer.colophon             2 lines, in the note's language
```

Head loads `assets/style.css` then `assets/qa.css` (both live in
`~/.understand/notes/assets/`, **inside** the served directory — a page
must never reference anything outside it); before `</body>`
goes `<script defer src="assets/interactive.js" data-port="PORT"></script>`
(pull the real port from `~/.understand/config.json`).

## The left rail

The rail is what makes the page read as a *book*, not a text wall — never
skip it. One `<li>` per section, `href="#sN"` matching section ids, titles
short (≤ 12 chars) so nothing wraps ugly:

```html
<nav class="rail" aria-label="…">
  <p class="rail-brand"><a href="index.html">Help Me Understand</a></p>
  <p class="rail-sub">annotated textbook<br>2026-09-02</p>
  <p class="rail-title">本页小节 / On this page</p>
  <ol>
    <li><a href="#s1">Cache-Control</a></li>
    …
  </ol>
  <div class="rail-meta">…related notes, index link…</div>
</nav>
```

Use `li class="here"` on nothing (single page) or on the glossary last item
as a subtle "you made it" dot; use `li class="done"` only in multi-note
series. `rail-meta` lists 1–3 related notes from the catalog plus the index
link. The rail title follows the note's language.

## Hero

- `h1.chapter` breaks into **two lines** with `<br>` — big serif linebreaks
  are the single strongest "textbook" signal.
- The `lede` carries exactly one `mark.hl` clause: the note's one-sentence
  takeaway.
- eyebrow: `Help Me Understand / 2026-09-02 / topic` (or `docs`, `selection`).

## The elements

| Element | Class | When to use |
|---|---|---|
| Analogy box | `div.eli5 > span.tag + p` | Opens **every** section and every deep dive. Star SVG included. |
| Analogy keywords | `span.toys` | The metaphor's nouns, ≥ 4 per box. |
| Highlighter | `mark.hl` | 2–4 sentences per note a beginner must not miss. A fully-highlighted page highlights nothing. |
| Margin note | `div.row > (div) + aside.mn` | Caveat, pointer, or term gloss. `<b>` title first line. |
| Section number | `h2 > span.no` | `1`, `2`, `3` … |
| Deep dive | `h3` + own eli5 box | 2–3 per note, for the sub-topics that deserve their own metaphor. |
| Code | `pre > code` with `span.c/.k/.s/.n` token classes | Manual highlighting, keep it light. |
| File citation | `span.fileline` | Inline `path/to/file.py:42` chips, green; in tables they can be a whole column. |
| Terminal/trace | `div.trace` with `.t-head/.ok/.ev/.raw` | Command transcripts and event walks (recipe below). |
| Diagram | `figure.diag > svg` | The big-picture box-and-arrow picture (recipe below). |
| Callout | `div.callout.dive / .risk / .phil` | Tag text is specific, not generic: `RISK · the one config everyone gets wrong`, `PHIL · why it refuses to guess`, `NEXT · where to go from here`. |
| Table | plain `table` | Comparisons, parameter lists, glossary. |
| Badge | `span.badge.b-blue/.b-green/.b-rust` | Inline status labels. |
| Evidence chain | `div.sources > ol > li` + `sup.sref > a` | `[S1]` in body, `id="S1"` in footer. |

## Diagram recipe (`figure.diag`)

Boxes with rounded corners, arrows with the `arr` marker, labels in the
paper's own fonts — copy this skeleton and adapt (viewBox width 1040):

```html
<figure class="diag">
<svg viewBox="0 0 1040 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="…">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#2B4A9B"/></marker></defs>
  <style>
    .box { fill: #FFFDF8; stroke: #1E2129; stroke-width: 1.5; }
    .lbl { font: 700 15px -apple-system, "PingFang SC", sans-serif; fill: #1E2129; }
    .sub { font: 12px -apple-system, "PingFang SC", sans-serif; fill: #565B66; }
    .wire { font: 11px "SF Mono", Menlo, monospace; fill: #2B4A9B; }
    .dash { stroke: #8B8F99; stroke-dasharray: 5 4; stroke-width: 1.2; fill: none; }
  </style>
  <rect class="box" x="40" y="60" width="240" height="130" rx="10"/>
  <text class="lbl" x="65" y="100">📱 label</text>
  <text class="sub" x="65" y="128">sub-caption</text>
  <line x1="280" y1="125" x2="692" y2="125" stroke="#2B4A9B" stroke-width="2" marker-end="url(#arr)"/>
  <text class="wire" x="330" y="112">what flows on this wire</text>
</svg>
<figcaption><b>Title</b>—one line on how to read it.</figcaption>
</figure>
```

Emoji in `lbl` labels are welcome (📱💻🏭🗄️). Solid line = the thing this
note is about; dashed (`class="dash"`) = context the reader doesn't control.

## Trace recipe (`div.trace`)

A tree-shaped narrative of "what happens when …" — this is where a
walk-through stops being a list and becomes a story:

```html
<div class="trace">
  <div class="t-head"># what happens when you press the button</div>
  <div>finger taps</div>
  <div>├ <span class="ev">View.submit()</span> collects input <span class="raw">→ Features/X.swift:88</span></div>
  <div>│&nbsp;&nbsp;├ guard validates <span class="raw">→ Core/Y.swift:31</span></div>
  <div>│&nbsp;&nbsp;└ <span class="ok">✔ candidate built, nothing mutated yet</span></div>
  <div>└ <span class="ok">✔ committed: state + storage swapped atomically</span></div>
  <div class="raw">any step fails: error translated → shown in red, old config untouched</div>
</div>
```

`├ └ │` box-drawing chars, `&nbsp;` for indentation, `.ev` = function/event,
`.ok` = good outcome, `.raw` = file:line or commentary.

## Glossary (closing section, always)

Last section = a 2-column glossary table (`term` / `one-liner in plain
words`) covering every term the note introduced, then a `NEXT` callout
pointing at the natural follow-up threads (= the numbered deep-dive threads
from the terminal answer).

## Writing rules

- **The metaphor is one system.** One metaphor for the whole note; the
  moment you switch mid-note, a five-year-old is lost.
- **Layer 2 maps 1:1 back.** After the yellow box, re-tell the same story
  with real names, glossing each term at first use.
- **Prose first, markup second** — an element earns its class by carrying
  meaning (analogy / evidence / trap), never by looking nice.
- **Everything follows the user's language** (`<html lang>`, rail, headings,
  callout tags, colophon); code identifiers and `file:line` stay as-is.

## Index page (`notes/index.html`)

Same head + hero; a `.toc-cards` grid of `.toc-card` links (`.no` = date,
`.t` = title, `.d` = one-line lede), newest first. Regenerate from
`~/.understand/catalog.json` after every note change; it is a derived
artifact, never hand-edited.
