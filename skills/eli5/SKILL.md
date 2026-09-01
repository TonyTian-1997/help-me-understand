---
name: eli5
description: Explain any concept, system, or selected code the ELI5 way (everyday analogy first, engineering reality second) as a self-contained interactive HTML note, and stand by for follow-up questions asked by selecting text in the browser. Use when the user says "eli5", "explain like I'm five", "help me understand", asks for a plain-language explanation of a topic or an editor selection, or asks a follow-up about a note this skill already produced.
---

# ELI5 — Help Me Understand

Every invocation runs the full pipeline: environment → note → watcher.
**The note is the answer** — do not write the explanation in the chat.
Keep the chat to a two-line confirmation (topic + note URL).

**The body/build split is the core discipline**: you write ONLY the note
body (sections + evidence chain) into `~/.understand/src/<slug>.html`;
`note_tool.py build` assembles the page — skeleton, rail (derived from
your section titles), related notes, catalog, and index are generated,
never hand-written. `note_tool.py lint` is the quality gate; a note that
hasn't passed lint is not done.

Home directory for everything: `~/.understand/` (Windows:
`%USERPROFILE%\.understand\` — always resolve via the OS home).

```
~/.understand/
├── notes/              # built pages + index.html + qa.jsonl
│   └── assets/         # style.css, qa.css, interactive.js, body-template.html
├── src/                # note BODIES (what you write): <slug>.html
├── catalog.json        # maintained by note_tool.py build
└── config.json         # {"interpreter": "...", "port": 8899}
```

Plugin files (read-only, referenced as `${CLAUDE_PLUGIN_ROOT}`):
`skills/eli5/assets/`, `skills/eli5/scripts/` under the plugin root.

## Step 1 — Identify the target and language

In priority order:

1. **Editor selection** — an IDE selection (`ide_selection` context) is
   the subject; read surrounding files as needed.
2. **Explicit topic** — the slash-command argument or the user's message.
3. **Follow-up on an existing note** — load the note and continue from it
   (see Follow-ups below). Resolve vague references ("the networking
   note") via `~/.understand/catalog.json`, never by guessing.

Write in the language the user asked in (Chinese → Chinese note).

## Step 2 — Ensure the environment (fast path: one probe)

Read `~/.understand/config.json`. If it has an `interpreter` and a `port`,
the fast path is a single liveness probe — a running server is reused:

```
curl -m 1 http://127.0.0.1:<port>/health
```

On the first run (or if the probe fails) do, in order:

1. Copy the four files from `${CLAUDE_PLUGIN_ROOT}/skills/eli5/assets/`
   to `~/.understand/notes/assets/` (assets MUST live inside the served
   directory; never modify the plugin's copies).
2. Resolve the Python interpreter, probing `python3 --version` →
   `python --version` → `py -3 --version`; cache it in `config.json`.
3. Start the server in the background (port 8899, or +1…+5 if taken;
   persist the working port):

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/server.py" --root <home>/.understand/notes --port <port>
```

4. Start the watcher as a background task (it must not block; see
   Step 4 for the context-injecting form):

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/qa_tool.py" --qa <home>/.understand/notes/qa.jsonl watch --context --interval 2
```

Steps 3–4 start independent processes: launch them in one parallel tool
block. If **no interpreter exists**: keep the note (it reads fine from
`file://`), skip server/watcher, and say plainly that interactive Q&A
needs Python 3.9+.

5. Regenerate the reader launchers (idempotent, run whenever the
   interpreter or port changes) — the no-Claude recovery path for when
   the idle-timeout has released the port:

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/note_tool.py" launchers --interpreter "<interpreter>" --port <port> --scripts "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts"
```

   This installs `<home>/.understand/bin/` (stable script copies) and
   `Start Notes.command` / `Start Notes.bat` — double-click to revive
   the server and open the index. Tell the user about them once, on the
   very first setup only.

## Step 3 — Write the note body, build, lint

1. Slugify the topic (`http-caching`, `recoil-vs-redux`). An existing
   body in `src/<slug>.html` means an update — edit it, don't start over.
2. Write the body to `~/.understand/src/<slug>.html` following
   [references/html-style.md](references/html-style.md): sections +
   evidence chain ONLY (no html/head/body/rail/hero/index — the tool
   owns all of that), meeting every element quota. Cite real `file:line`
   evidence for code subjects; authoritative docs otherwise.
3. Build (title uses `|` for the two hero lines; the lede carries one
   `<mark class="hl">` clause; the port comes from config.json):

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/note_tool.py" build <slug> --title "Line one|Line two" --lede "…<mark class=\"hl\">…</mark>…" --lang <lang>
```

4. **Progressive writing for long notes**: after writing the first 2–3
   sections, build once and give the user the URL immediately (the page
   grows on refresh as you append), then write the remaining sections
   into the body and rebuild.
5. Run the gate and fix every ✘ until it passes — never waive a failure:

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/note_tool.py" lint <slug>
```

6. Reply in two lines maximum: note title (user's language) + URL from
   the build output. Nothing else — the note carries the explanation.

## Step 4 — Watch for browser questions

Launch the watcher with context injection (2s polling):

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/qa_tool.py" --qa <home>/.understand/notes/qa.jsonl watch --context --interval 2
```

When it exits, each printed question carries its `context`: the note's
title + lede, the **section containing the quoted passage**, and the
glossary terms the question mentions. Answer from that — **never answer
a browser question without the note's context in hand**; if `context`
says no body file was found (legacy note), Read the built page first.
This keeps answers inside the note's metaphor system even after context
compaction or a session restart, and needs zero extra tool calls.

Answering discipline (the drawer renders paragraphs, `**bold**`,
`` `code` ``, and `- ` lists ONLY — no headers, tables, or links):

- Reuse the note's metaphor nouns (the `toys`) — stay in its world.
- Answer the question first; keep it ≤150 words unless depth is truly
  needed; gloss any new term inline.
- Cite `file:line` when the note did.

Submit each answer (on Windows, write to a temp UTF-8 file and pass the
path instead of piping):

```
echo "<answer text>" | "<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/qa_tool.py" --qa <home>/.understand/notes/qa.jsonl answer <qid> -
```

Summarize in one line in the chat. **After answering, always restart the
watcher.**

**Session-start hygiene**: the first time a session touches anything
note-related, run `qa_tool.py --qa … pending --context` and clear any
backlog immediately. For vague references ("the networking note"),
resolve them via `~/.understand/catalog.json`, never by guessing.

## Answer quality rubric

Applies to note bodies and browser answers alike.

- **Layer 1 — the analogy.** One coherent everyday metaphor system for
  the whole topic; it must cover the moving parts and their
  interactions, not decorate the intro. Wrap its key nouns in
  `<span class="toys">`.
- **Layer 2 — the engineering reality.** Map every metaphor element back
  to the real mechanism; every term gets a plain-words gloss at first
  use.
- **Evidence.** Code cites `file:line` (`.fileline` + evidence chain);
  docs cite authoritative sources.
- **Deep-dive threads.** The closing NEXT callout offers 2–4 numbered
  follow-ups; they double as browser Q&A starters.
- **Length discipline.** Complete but tight; the note is a reference the
  reader returns to, not a transcript.

## Conversation follow-ups

Answer briefly in the conversation, then give the exchange the full ELI5
treatment: append a section to the body in `src/<slug>.html`, rebuild,
re-lint. For legacy notes with no body file, edit the built page in
place (and say so). The note stays canonical.

## Degradation rules

- Server down mid-session → note still works; retry Step 2's probe once
  per turn, don't loop.
- Watcher died → restart it; never run two watchers.
- `qa.jsonl` corrupt lines → scripts skip them; proceed.
- Lint failures → fix the body and re-run; never hand-edit the built
  page to satisfy lint (it's regenerated).
