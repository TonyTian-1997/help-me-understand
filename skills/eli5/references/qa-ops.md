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
| Stop the server (explicit port release) | `"<py>" …/qa_tool.py --qa <qa> stop` (reads the pidfile, SIGTERMs, cleans up) |
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

The server is **resident by default** — like a language server, it holds
`127.0.0.1:<port>` until the machine reboots or it is stopped
explicitly, so readers never meet a dead URL. Release paths:
`qa_tool.py stop` (explicit, via the pidfile), reboot, or run the
server with `--idle-timeout <sec>` to auto-exit when nobody has polled
for that long (open pages heartbeat it via the 8s poll). If the port is
ever cold, the skill's probe restarts it in ~1s and the double-click
launcher revives it without Claude. Should the server ever be down
while a page is open, offline is invisible by design: the comment layer
hides itself and reappears when the server answers again; notes also
open directly from `~/.understand/notes/` via file://.

## Watcher lifecycle — the one rule

`watch` polls `pending` every 2s (default) and **exits 0, printing the
questions as one JSON line, the moment any exist**. That exit is the
wake-up signal: the session gets a background-task notification and can
answer.

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
| Comment UI missing entirely | server not running (offline is invisible by design) | Step 2 probe of the skill; check the URL with `curl -m 1 …/health` |
| Question sent, nothing happens | watcher dead | restart `watch`; verify with `pending` |
| Answer written but page blank | answer text empty | `qa_tool.py` refuses empty answers by design — rewrite with content |
| `bad request` on POST | empty question text | client-side guard normally prevents; ignore |
| Two answers to one qid | duplicate answer run | harmless — drawer shows the last by `seq` |
