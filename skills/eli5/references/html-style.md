# Note design vocabulary — annotated textbook

Every note is one self-contained HTML page styled like a paper textbook a
friendly tutor has already annotated: highlighter over the sentences that
matter, a pencil note in the margin, footnotes proving every claim. The
stylesheet (`~/.understand/assets/style.css`) ships the entire vocabulary;
your job is choosing where each element goes. All colors/fonts live in CSS
variables — never hardcode a color in a note.

## Page skeleton

```
main.main > div.content
├── header.hero            eyebrow / h1.chapter / p.lede / hero-rule
├── section.block (×N)     one per sub-topic, id="s1"…
├── footer.sources         evidence chain (numbered citations)
├── footer.colophon        generated-by line
└── footer.pager           ← index / next note links
```

Head loads `../assets/style.css` then `../assets/qa.css`; before `</body>`
goes `<script defer src="../assets/interactive.js" data-port="PORT"></script>`
(pull the real port from `~/.understand/config.json`).

## The elements

| Element | Class | When to use |
|---|---|---|
| Analogy box | `div.eli5 > span.tag + p` | Opens **every** section. Layer 1. The `.tag` row carries the star SVG (copy from the template). |
| Analogy keywords | `span.toys` | The metaphor's nouns, so they visually pop inside the yellow box. |
| Highlighter | `mark.hl` | The 2–4 sentences per note a beginner absolutely must not miss. Sparingly — a fully-highlighted page highlights nothing. |
| Margin note | `div.row > p + aside.mn` | A caveat, pointer, or term gloss that would break Layer 2's flow. `<b>` title first line. |
| Section number | `h2 > span.no` | `1`, `2`, … plain integers. |
| Sub-heading | `h3` | Auto-bulleted with a diamond; no class needed. |
| Code | `pre > code` with `span.c/.k/.s/.n` token classes | Comment/keyword/string/name highlighting is manual — keep it light. |
| File citation | `span.fileline` | Inline `path/to/file.py:42` chips, green. |
| Terminal block | `div.trace` with `.t-head/.ok/.ev/.raw` | Command transcripts, log excerpts. |
| Callout | `div.callout.dive / .risk / .phil` | Blue = deeper context; rust = pitfalls/trade-offs; yellow = design philosophy. Tag text: `DEEPER`, `WATCH OUT`, `WHY IT'S DESIGNED THIS WAY`. |
| Table | plain `table` | Comparisons (X vs Y), parameter lists. |
| Badge | `span.badge.b-blue/.b-green/.b-rust` | Small status labels (`v2 only`, `deprecated`). |
| Evidence chain | `footer.sources > ol > li` + `sup.sref > a` | Every factual claim about code gets `[N]` in the body and `[N] path:line` in the footer. |

## Writing rules

- **The metaphor is one system.** If Layer 1 is a post office, letters,
  sorting desks and mailboxes stay a post office for the whole note; the
  moment you switch metaphors mid-note, a five-year-old is lost.
- **Layer 2 maps 1:1 back.** After the yellow box, immediately re-tell the
  same story with real names: "the sorting desk is the event loop
  *(the thing that decides who gets handled next)*".
- **Terms get a plain-words gloss at first use**, in parentheses or a
  margin note — never a definition section nobody reaches.
- **Prose first, markup second.** An element earns its class by carrying
  meaning (this is an analogy / this is evidence / this is a trap), not by
  looking nice.
- `<html lang>` matches the answer language (`en`, `zh-CN`, …). Titles,
  lede, colophon, section headings — everything in the note follows the
  user's language; code identifiers and `file:line` stay as-is.

## Index page (`notes/index.html`)

Same skeleton minus sections; a `.toc-cards` grid of `.toc-card` links
(`.no` = date, `.t` = title, `.d` = one-line lede), newest first. Regenerate
from `~/.understand/catalog.json` after every note change; it is a derived
artifact, never hand-edited.
