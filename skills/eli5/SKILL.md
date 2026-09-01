---
name: eli5
description: Explain any concept, system, or selected code the ELI5 way (everyday analogy first, engineering reality second), then save a self-contained interactive HTML note and stand by for follow-up questions asked by selecting text in the browser. Use when the user says "eli5", "explain like I'm five", "help me understand", asks for a plain-language explanation of a topic or an editor selection, or asks a follow-up about a note this skill already produced.
---

# ELI5 — Help Me Understand

Every invocation runs the full pipeline: a fast two-layer answer in the
conversation, an annotated HTML note on disk, a local notes server, and a
watcher that catches questions the reader asks by selecting text in the
browser. Work through the steps in order; never make the user wait on the
note before they get their answer.

Home directory for everything this skill creates: `~/.understand/`
(Windows: `%USERPROFILE%\.understand\` — always resolve via the OS home).

```
~/.understand/
├── notes/              # <slug>.html notes + index.html + qa.jsonl
│   └── assets/         # style.css, qa.css, interactive.js, note-template.html
└── config.json         # {"interpreter": "...", "port": 8899}
```

Plugin files (read-only, referenced as `${CLAUDE_PLUGIN_ROOT}`):
`skills/eli5/assets/` and `skills/eli5/scripts/` under the plugin root.

## Step 1 — Identify the target and language

Determine what to explain, in this priority order:

1. **Editor selection** — if the message contains an IDE selection
   (`ide_selection` context), that code is the subject. Read surrounding
   files as needed to explain it in context.
2. **Explicit topic** — the slash-command argument or the user's message.
3. **Follow-up on an existing note** — if the user references a previous
   note ("go deeper on 2", "what about X from the docker note"), load
   `~/.understand/notes/<slug>.html` and continue from it.

Always answer **in the language the user asked in** (Chinese question →
Chinese note, English → English).

## Step 2 — Answer in the conversation first

Before touching any file, give the complete answer in the chat, structured
in two layers (see rubric below). End with 2–4 numbered **deep-dive
threads** the user can pick by number. The chat answer must stand fully on
its own — the note is a keepsake, not a prerequisite.

## Step 3 — Write the note

1. **First run only**: copy the four files from
   `${CLAUDE_PLUGIN_ROOT}/skills/eli5/assets/` to
   `~/.understand/notes/assets/` — assets MUST live **inside** the served
   notes directory: pages reference them as `assets/style.css`, and the
   server cannot resolve anything outside its root (never modify the
   plugin's copies; local copies keep old notes working across plugin
   updates).
2. Slugify the topic (`http-caching`, `docker-namespaces`,
   `recoil-vs-redux`). If `~/.understand/notes/<slug>.html` exists, **update
   it in place** — merge new sections, don't duplicate the note.
3. Write the note from `~/.understand/notes/assets/note-template.html`,
   following the design vocabulary **and the element quotas** in
   [references/html-style.md](references/html-style.md): left rail with
   section anchors, eli5 analogy boxes, ≥1 SVG diagram, ≥2 tables (closing
   glossary always), ≥1 tree-shaped trace block, 2–3 deep dives, callouts
   with specific tag text. A thin note (a yellow box + two paragraphs per
   section) is a **bug** — the reader should see a richly annotated
   textbook page, not an essay. Cite real `file:line` evidence whenever the
   subject is code; link docs otherwise. Set `data-port` on the interactive
   `<script>` to the port from Step 4.
4. Update the catalog `~/.understand/notes/index.html`: keep a
   `catalog.json` inside `~/.understand/` mapping slug →
   `{title, lede, date, lang}` and regenerate `index.html` from it after
   every change (use the `.toc-cards` classes).

## Step 4 — Ensure the notes server

Read `~/.understand/config.json` (create on first run). Probe with a 1s
timeout before starting anything — a running server must be reused:

```
curl -m 1 http://127.0.0.1:<port>/health
```

If not up, resolve the Python interpreter (probe in order, cache the result
in `config.json` under `interpreter`): `python3 --version` → `python
--version` → `py -3 --version`. Then start in the background:

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/server.py" --root <home>/.understand/notes --port <port>
```

If the port is taken by something else, try port+1 (up to +5) and persist
the working port in `config.json`. If **no interpreter exists at all**:
skip this step and the next, keep the note (it still reads fine from
`file://`), and tell the user plainly: interactive Q&A needs Python 3.9+.

Give the user the URL: `http://127.0.0.1:<port>/<slug>.html`.

## Step 5 — Watch for browser questions

Run as a **background task** (it must not block the conversation):

```
"<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/qa_tool.py" --qa <home>/.understand/notes/qa.jsonl watch --interval 5
```

When the watcher exits and reports questions: for each pending question,
write an answer that meets the same rubric as Step 2 (analogy first, plain
language, `file:line` evidence when code is involved) and submit it:

```
echo "<answer text>" | "<interpreter>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/qa_tool.py" --qa <home>/.understand/notes/qa.jsonl answer <qid> -
```

On Windows, write the answer to a temp file and pass the path instead of
piping. Summarize what you answered in one line in the chat. **After
answering, always restart the watcher** — a watcher that isn't restarted
means every later browser question goes unanswered.

At the start of any session where the user mentions a note, check once for
unanswered questions (`qa_tool.py ... pending`) before anything else.

## Answer quality rubric

- **Layer 1 — the analogy.** One coherent everyday metaphor system for the
  whole topic (a kitchen, a post office, a school — pick one and stay in
  it). It must cover the topic's moving parts and how they interact, not
  just decorate the intro. Wrap the metaphor's key nouns in
  `<span class="toys">` in the note.
- **Layer 2 — the engineering reality.** Map every metaphor element back to
  the real mechanism. Every term is explained in plain words at first use —
  assume the reader knows no jargon.
- **Evidence.** Code subjects cite `file:line` (`.fileline` chips +
  evidence-chain footnotes). Non-code subjects cite authoritative docs.
- **Deep-dive threads.** 2–4 numbered questions the reader is likely to ask
  next; they double as the browser Q&A starters.
- **Length discipline.** Complete but tight; the note is a reference, not a
  transcript. Cut anything that doesn't survive the metaphor→mechanism
  mapping.

## Conversation follow-ups

When the user picks a deep-dive thread or asks a follow-up in chat: answer
in the conversation (same rubric), then append the exchange as a new
section at the end of the note and refresh the catalog lede if the scope
grew. Do not regenerate the whole note.

## Degradation rules

- Server down mid-session → note still works; retry Step 4 once per turn,
  don't loop.
- Watcher died → restart it (Step 5); never run two watchers.
- `qa.jsonl` corrupt lines → scripts skip them automatically; proceed.
- Plugin assets missing locally → re-run the Step 3 copy.
