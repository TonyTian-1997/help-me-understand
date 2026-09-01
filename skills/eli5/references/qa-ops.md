# Q&A server & watcher operations

The interactive layer is three cooperating pieces, all keyed off one file:

```
browser page ──POST /ask | /resolve──▶ server.py ──append──▶ notes/qa.jsonl
                                                                 ▲   │
Claude ◀──background task exits on new questions── qa_tool.py watch
   │                                                   │
   └──qa_tool.py answer <qid>──append──────────────────┘
browser page ◀──GET /qa?since=N (8s poll)──────────────┘
```

`qa.jsonl` is the single source of truth. Questions, answers, and resolve
marks are all append-only lines with a monotonic `seq`; pages pull
increments by `seq`. A question is **done** once it has an answer **or**
the reader resolved it in the browser (`pending` respects both). Corrupt
lines are skipped everywhere — never hand-repair the file.

The browser presents threads the way modern document editors do: the quoted passage
stays amber-highlighted in the text, a right sidebar lists threads with
inline reply and resolve; hover a card to light up its passage, click a
card to jump-and-flash to it.

## Commands (cross-platform)

All commands go through the interpreter cached in `~/.understand/config.json`
(`python3` / `python` / `py -3` — probe once, reuse forever).

| Purpose | Command |
|---|---|
| Liveness probe | `curl -m 1 http://127.0.0.1:<port>/health` |
| Install double-click launchers | `"<py>" …/note_tool.py launchers --interpreter "<py>" --port <port> --scripts <plugin scripts dir>` (writes `~/.understand/bin/` + `Start Notes.command` / `.bat`) |
| Start server (background) | `"<py>" "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/server.py" --root <home>/.understand/notes --port <port>` |
| Build a note from its body | `"<py>" …/note_tool.py build <slug> --title "one\|two" --lede "…" --lang <lg>` (also updates catalog + index; safe to re-run as the body grows) |
| Quality gate | `"<py>" …/note_tool.py lint <slug>` (exit 1 + ✘ report on any unmet quota or structural break) |
| Questions still needing an answer | `"<py>" …/qa_tool.py --qa <qa> pending --context` (embeds each question's note context: title, lede, the section containing the quote, glossary terms the question hits) |
| Submit an answer (unix) | `echo "<text>" \| "<py>" …/qa_tool.py --qa <qa> answer <qid> -` |
| Submit an answer (windows-safe) | write `<text>` to a temp UTF-8 file, then `"<py>" …/qa_tool.py --qa <qa> answer <qid> <tempfile>` |
| Watcher (background task) | `"<py>" …/qa_tool.py --qa <qa> watch --context --interval 2` |

## Answering rules

The watcher's `--context` payload is the ground truth for an answer:
work from the embedded section and terms, reuse the note's metaphor
nouns, and keep answers in the drawer-safe subset (paragraphs,
`**bold**`, `` `code` ``, `- ` lists — no headers/tables/links). Never
answer without context; for legacy notes without a body file, read the
built page first. ~150 words is the default budget.

## Port lifecycle

The server exits on its own after **1h with no requests** (open note
pages keep it alive via the 8s poll; `--idle-timeout 0` = hold forever).
When the port is cold: the skill's probe restarts it in ~1s, the
double-click launcher revives it without Claude, and already-loaded
pages stay readable (comments just show offline). If the reader hits a
dead URL with no launcher, any note also opens directly from
`~/.understand/notes/` via file://.

## Watcher lifecycle — the one rule

`watch` polls `pending` every 5s and **exits 0, printing the questions as
one JSON line, the moment any exist**. That exit is the wake-up signal: the
session gets a background-task notification and can answer.

- Run exactly **one** watcher. Before starting one, note whether another is
  already running; if in doubt, start fresh — the old one exits when it
  sees the same questions, which is harmless.
- After answering everything, **restart the watcher**. An unrestarted
  watcher is the #1 cause of "the browser stopped answering".
- `--max-wait` (default 2h) makes orphaned watchers exit quietly, so a
  closed session never leaks an infinite loop.

## Windows notes

- Paths: resolve the home directory from the OS (`%USERPROFILE%`), never a
  hardcoded `~`. The scripts themselves use `pathlib` + `expanduser`, so
  passing a plain absolute path to `--root`/`--qa` is enough.
- Never pipe answer text through `echo` on Windows (codepage mangling):
  always use the temp-file form for non-ASCII answers.
- The server binds `127.0.0.1` only. If a firewall prompt appears the
  first time, it is safe to allow — nothing is exposed beyond localhost.
- Port 8899 busy → try 8899+i (i ≤ 5), persist the winner in
  `config.json`, and regenerate nothing — pages read the port from
  `data-port` at generation time, so only future notes carry it; tell the
  user to reopen old notes via the server URL.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Page shows "offline" FAB | server not running | Step 4 of the skill; check probe URL |
| Question sent, nothing happens | watcher dead | restart `watch`; verify with `pending` |
| Answer written but page blank | answer text empty | `qa_tool.py` refuses empty answers by design — rewrite with content |
| `bad request` on POST | empty question text | client-side guard normally prevents; ignore |
| Two answers to one qid | duplicate answer run | harmless — drawer shows the last by `seq` |
