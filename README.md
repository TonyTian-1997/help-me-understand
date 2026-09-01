# Help Me Understand

**ELI5 explanations you can keep, interrogate, and re-read** — a [Claude Code](https://code.claude.com) plugin that turns any topic or selected code into a beautifully annotated, textbook-style HTML note (everyday analogy first, engineering reality second), and lets you ask follow-up questions by simply **selecting text in the browser**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue) [中文文档](README.zh-CN.md)

```text
you: /help-me-understand:eli5 how does HTTP caching work?

claude:  📖 note saved → http://127.0.0.1:8899/http-caching.html
         (the note IS the answer — no chat wall-of-text)

browser: a full annotated-textbook page: analogy boxes, SVG diagrams,
         tree-shaped traces, evidence-chain footnotes, glossary…
         select "ETag" → "why can it break caching?"
         → the answer appears as a comment thread on that sentence
```

## Install

```shell
# in Claude Code (v2.1+):
/plugin marketplace add TonyTian-1997/help-me-understand
/plugin install help-me-understand@help-me-understand
```

Then use it:

- explicitly: `/help-me-understand:eli5 <topic>` (or just `/eli5` — the picker fuzzy-matches)
- naturally: *"eli5 the event loop"*, *"help me understand this"* with code selected in your editor
- follow-ups: pick one of the numbered deep-dive threads, or select any sentence in the note and ask in the browser

## What you get

1. **A note worth keeping, fast** — the explanation lands directly as a self-contained HTML page in the annotated-textbook style: analogy boxes, highlighter over the must-not-miss sentences, margin notes, SVG diagrams, an evidence chain of `file:line` citations when the subject is code, a closing glossary. All notes accumulate under `~/.understand/notes/` with an index page; they work offline, print cleanly, and never expire.
2. **Select-to-ask follow-ups** — open the note in your browser, highlight any sentence, ask anything. Claude answers into the page as a comment thread (persistent highlights, a right sidebar, inline reply, resolve) — and equally answers follow-ups typed back in the terminal.

## Requirements

| | |
|---|---|
| Claude Code | v2.1 or newer |
| Interactive Q&A | Python **3.9+** on PATH (`python3` / `python` / `py -3` are all auto-detected) — macOS and most dev boxes have it |
| Without Python | everything still works **except** browser follow-ups: notes are generated and readable offline; the interactive layer hides itself gracefully |

Everything runs on `127.0.0.1` only — nothing leaves your machine. Uninstalling the plugin never touches your notes (`~/.understand/` is yours).

## How it works

```text
┌─ terminal ─────────────┐      ┌─ ~/.understand/ ──────────────────┐
│ /eli5 <topic>          │      │ src/<slug>.html     body (written) │
│ → body → build → lint  │─────▶│ notes/<slug>.html   built page     │
│ → 2-line reply w/ URL  │      │ notes/index.html    auto catalog   │
└────────────────────────┘      │ notes/qa.jsonl      Q&A log        │
                                │ notes/assets/…      styles & JS    │
                                └──────────────┬─────────────────────┘
┌─ browser ──────────────┐                     │ 127.0.0.1:<port>
│ select text → ask      │──POST /ask─────────▶│ (server.py, stdlib) │
│ Q&A drawer ← answers   │◀─GET /qa?since=N───┘                     │
└────────────────────────┘   Claude answers via qa_tool.py, watching qa.jsonl
```

The plugin ships one skill (`eli5`), two zero-dependency Python scripts, and the note design system (CSS + interactive layer). See [examples/http-caching.html](examples/http-caching.html) for a real generated note.

## FAQ

**Is my data sent anywhere?** No. The server binds to localhost, the Q&A log is a local `qa.jsonl`, notes are local files. Uninstall with `claude plugin uninstall help-me-understand@help-me-understand` — your notes survive.

**Where do notes live?** `~/.understand/notes/` (Windows: `%USERPROFILE%\.understand\notes\`). Delete the folder to reset everything.

**Port conflict?** Auto-falls-forward from 8899; the working port is cached in `~/.understand/config.json`.

**The note URL stopped working after a break?** The server releases its port after an hour with nobody reading (open tabs keep it alive; the trade-off for not holding the port forever). Revive it without Claude: double-click **`~/.understand/Start Notes.command`** (macOS) or **`Start Notes.bat`** (Windows) — it restarts the server and opens your notes. Already-open tabs keep rendering; only commenting pauses until revival.

**Windows support?** Yes — scripts are pure-stdlib, the skill auto-detects `python`/`py -3`, and answers are written via temp files to dodge console codepage issues.

**Does the browser Q&A need Claude Code open?** Yes — Claude answers while your session runs (a watcher nudges it when a question arrives). Notes themselves are static and readable forever.

**UI language?** The comment layer follows the browser language (English by default, Chinese for zh locales). To force one, add `data-lang="en"` or `data-lang="zh"` to the `interactive.js` script tag in a note.

## Development

```shell
git clone https://github.com/TonyTian-1997/help-me-understand
claude plugin validate ./help-me-understand --strict   # manifest + frontmatter checks
claude --plugin-dir ./help-me-understand               # live-test without installing
```

Skill definition: [skills/eli5/SKILL.md](skills/eli5/SKILL.md) · note design: [skills/eli5/references/html-style.md](skills/eli5/references/html-style.md) · ops: [skills/eli5/references/qa-ops.md](skills/eli5/references/qa-ops.md)

## License

[MIT](LICENSE)
