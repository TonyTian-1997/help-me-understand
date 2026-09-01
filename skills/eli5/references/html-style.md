# Note body design vocabulary — annotated textbook

You write **only the note body** — `<section class="block">` blocks plus
the `footer.sources` evidence chain — to `~/.understand/src/<slug>.html`.
`note_tool.py build` wraps it into the page: head, hero, the left rail
(derived from your `<h2>` titles), related notes, pager, colophon,
catalog, and the index are all generated. **Never write skeleton HTML,
`<html>`/`<head>`/`<body>`, rail markup, or `index.html` by hand** —
hand-written structure fails lint and gets overwritten on the next build.

The finished page reads like a paper textbook a friendly tutor already
annotated: a left chapter rail, highlighter over the sentences that
matter, pencil notes in the margin, footnotes proving every claim.
**A body that is mostly paragraphs with one yellow box per section is a
failed body** — lint enforces the quotas below.

## Element quotas (lint-enforced)

| Scope | Requirement |
|---|---|
| Whole body | ≥ 5 sections (`section.block`, ids `s1`… sequential) |
| Whole body | ≥ 1 **SVG diagram** (`figure.diag`, recipe below) |
| Whole body | ≥ 2 **tables** (one = closing glossary, always) |
| Whole body | ≥ 1 **trace block** (tree-shaped walk-through, recipe below) |
| Whole body | ≥ 2 **deep dives** (`h3` + own eli5 box) |
| Whole body | ≥ 2 **callouts** with specific tag text |
| Whole body | ≥ 3 evidence items (`<li id="S…">` in sources) |
| Whole body + lede | ≥ 2 highlighter marks (`mark.hl` / `span.hl`) |
| Per section | eli5 box first, then **≥ 2 other element types** (figure / table / trace / pre / row+mn / callout) |
| Per eli5 box | ≥ 4 `<span class="toys">` keywords |

If the topic feels too small to fill this, the topic is too small —
split it or pick a bigger slice.

## What goes where

**Into the body file** (`src/<slug>.html`): sections, sources footer.
Section ids sequential (`s1`, `s2`…); the `h2 > span.no` number mirrors
the id. Section titles become the rail entries verbatim — keep them
tight (they'll be listed in the rail; very long titles get ellipsized
there).

**Into the build command**: the two hero lines (`--title "line one|line
two"` — the `|` becomes a `<br>`), the lede with its single highlighted
takeaway clause (`--lede "…<mark class=\"hl\">…</mark>…"`), `--lang`.
The rail title, related notes, colophon, and index labels are localized
by the tool from `--lang`.

## The elements

| Element | Class | When to use |
|---|---|---|
| Analogy box | `div.eli5 > span.tag + p` | Opens **every** section and every deep dive. No star SVG — the stylesheet draws it (`::before`). |
| Analogy keywords | `span.toys` | The metaphor's nouns, ≥ 4 per box. |
| Highlighter | `mark.hl` (or `.hl` on a span) | 2–4 sentences per note a beginner must not miss. A fully-highlighted page highlights nothing. |
| Margin note | `div.row > (div) + aside.mn` | Caveat, pointer, or term gloss. `<b>` title first line. |
| Section number | `h2 > span.no` | `1`, `2`, `3` … matching the id. |
| Deep dive | `h3` + own eli5 box | 2–3 per note, for sub-topics that deserve their own metaphor. |
| Code | `pre > code` with `span.c/.k/.s/.n` token classes | Manual highlighting, keep it light. |
| File citation | `span.fileline` | Inline `path/to/file.py:42` chips; in tables they can be a whole column. |
| Terminal/trace | `div.trace` with `.t-head/.ok/.ev/.raw` | Command transcripts and event walks (recipe below). |
| Diagram | `figure.diag > svg` | The big-picture box-and-arrow picture (recipe below). |
| Callout | `div.callout.dive / .risk / .phil` | Tag text is specific: `RISK · the one config everyone gets wrong`, `PHIL · why it refuses to guess`, `NEXT · where to go from here`. |
| Table | plain `table` | Comparisons, parameter lists, glossary. |
| Badge | `span.badge.b-blue/.b-green/.b-rust` | Inline status labels. |
| Evidence chain | `footer.sources > ol > li` + `sup.sref > a` | `[S1]` in body, `id="S1"` in the footer. |

## Diagram recipe (`figure.diag`) — no `<style>` block!

The `.box/.lbl/.sub/.wire/.dash` classes live in `style.css` (document
CSS applies to inline SVG) — **never write a `<style>` inside the SVG**.
Keep the arrow `defs`; adapt boxes, wires, labels:

```html
<figure class="diag">
<svg viewBox="0 0 1040 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="…">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#2B4A9B"/></marker></defs>
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
note is about; dashed (`class="dash"`) = context the reader doesn't
control. If a page has multiple figures, give each marker a unique id
(`arr2`, …).

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
words`) covering every term the body introduced, then a `NEXT` callout
with 2–4 numbered follow-up threads.

## Writing rules

- **The metaphor is one system.** One metaphor for the whole note; the
  moment you switch mid-note, a five-year-old is lost.
- **Layer 2 maps 1:1 back.** After the yellow box, re-tell the same story
  with real names, glossing each term at first use.
- **Prose first, markup second** — an element earns its class by carrying
  meaning (analogy / evidence / trap), never by looking nice.
- **Everything follows the user's language** (passed as `--lang`):
  section titles, callout tags, sources; code identifiers and
  `file:line` stay as-is.
