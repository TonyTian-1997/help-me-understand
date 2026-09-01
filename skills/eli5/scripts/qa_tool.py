#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────
#  qa_tool.py — Claude-side Q&A helper (pairs with server.py)
#
#    python3 qa_tool.py [--qa PATH] pending [--context]
#        list questions that still need an answer as JSON — a
#        question counts as done once it has an answer OR the
#        reader resolved it in the browser (prints nothing
#        when there are none). --context embeds each question's
#        note context (title, lede, the section containing the
#        quote, glossary terms hit by the question) so answers
#        can be written immediately, grounded — even in a
#        compacted or freshly restarted session.
#
#    echo "answer text" | python3 qa_tool.py [--qa PATH] answer <qid> -
#    python3 qa_tool.py [--qa PATH] answer <qid> answer.txt
#
#    python3 qa_tool.py [--qa PATH] watch [--context] [--interval 2] [--max-wait 7200]
#        watchman for the skill's background task: poll pending
#        questions; the moment any exist, print them (with
#        context, if requested) as one JSON line and exit 0 —
#        the exit nudges the session to wake up and answer.
#        Exits 1 quietly on timeout.
#
#  Cross-platform: Python 3.9+ standard library only.
# ─────────────────────────────────────────────────────────
import argparse
import json
import os
import re
import signal
import sys
import time
from pathlib import Path

DEFAULT_QA = Path.home() / ".understand" / "notes" / "qa.jsonl"

SECTION_BLOCK_RE = re.compile(r"<section\b.*?</section>", re.S)
TERM_ROW_RE = re.compile(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", re.S)
TAG_RE = re.compile(r"<[^>]+>")


def load(qa_path):
    items = []
    p = Path(qa_path)
    if p.exists():
        try:
            raw = p.read_text(encoding="utf-8")
        except OSError:
            return items
        for line in raw.splitlines():
            line = line.strip()
            if line:
                try:
                    items.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return items


def pending_of(items):
    """Questions with neither an answer nor a resolve mark."""
    done = {i["qid"] for i in items if i.get("type") in ("answer", "resolve")}
    return [i for i in items if i.get("type") == "question" and i["id"] not in done]


def append(qa_path, entry):
    items = load(qa_path)
    entry["seq"] = max([i.get("seq", 0) for i in items] or [0]) + 1
    with Path(qa_path).open("a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def squash(s):
    """tags out, ALL whitespace out — substring matching that survives
    both HTML tagging and CJK/Latin spacing differences."""
    return re.sub(r"\s+", "", TAG_RE.sub("", s))


# ── note-context extraction ─────────────────────────────
def context_for(question, qa_path):
    """Ground an answer in the note it was asked on: title, lede,
    the section containing the quoted passage, and glossary terms
    the question mentions. Returns None when no body exists
    (legacy notes) — the caller should then read the note itself."""
    home = Path(qa_path).resolve().parent.parent
    page = question.get("page", "")
    slug = page[:-5] if page.endswith(".html") else page
    if not slug:
        return None
    body_path = home / "src" / (slug + ".html")
    if not body_path.exists():
        return None
    try:
        body = body_path.read_text(encoding="utf-8")
    except OSError:
        return None

    ctx = {"slug": slug, "body": str(body_path)}

    try:
        catalog = json.loads((home / "catalog.json").read_text(encoding="utf-8"))
        entry = catalog.get(slug, {})
        ctx["title"] = entry.get("title", slug)
        ctx["lede"] = entry.get("lede", "")
    except (OSError, json.JSONDecodeError):
        pass

    sections = SECTION_BLOCK_RE.findall(body)
    quote = squash(question.get("quote", ""))
    hit = None
    if quote:
        for sec in sections:
            if quote in squash(sec):
                hit = sec
                break
    ctx["section_html"] = hit or (sections[0] if sections else "")

    # glossary rows (term, definition) across all tables; match on the
    # term's head word (parenthetical aliases stripped) so "DNS 解析
    # (resolution)" matches a question that says "DNS 解析过程"
    qtext = squash(question.get("text", "")).lower()
    hits = []
    for m in TERM_ROW_RE.findall(body):
        term = TAG_RE.sub("", m[0]).strip()
        head = term
        for sep in ("（", "(", " / ", "/"):
            i = head.find(sep)
            if i > 0:
                head = head[:i]
        head = squash(head).lower()
        if head and head in qtext:
            hits.append([term, TAG_RE.sub("", m[1]).strip()])
        if len(hits) >= 5:
            break
    ctx["terms"] = hits
    return ctx


def with_context(pending, qa_path):
    out = []
    for q in pending:
        q = dict(q)
        ctx = context_for(q, qa_path)
        if ctx:
            q["context"] = ctx
        else:
            q["context"] = {"note": "no body file found — read the built page before answering"}
        out.append(q)
    return out


def emit(obj):
    # force UTF-8 so Chinese answers survive Windows consoles
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description="Help Me Understand Q&A helper")
    ap.add_argument("--qa", default=str(DEFAULT_QA), help="path to qa.jsonl (default: ~/.understand/notes/qa.jsonl)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pending", help="list questions that still need an answer")
    p.add_argument("--context", action="store_true", help="embed each question's note context")
    a = sub.add_parser("answer", help="answer a question by id")
    a.add_argument("qid")
    a.add_argument("src", help="'-' to read the answer from stdin, or a file path")
    w = sub.add_parser("watch", help="poll until a question arrives, then print and exit")
    w.add_argument("--context", action="store_true", help="embed each question's note context")
    w.add_argument("--interval", type=float, default=2, help="polling seconds (default: 2)")
    w.add_argument("--max-wait", type=float, default=7200, help="give up after this many seconds (default: 7200)")
    sub.add_parser("stop", help="stop the notes server (explicit port release)")
    args = ap.parse_args()

    qa = Path(args.qa).expanduser()
    qa.parent.mkdir(parents=True, exist_ok=True)

    if args.cmd == "pending":
        pending = pending_of(load(qa))
        if pending:
            emit(with_context(pending, qa) if args.context else pending)

    elif args.cmd == "answer":
        if args.src == "-":
            text = sys.stdin.read().strip()
        else:
            try:
                text = Path(args.src).read_text(encoding="utf-8").strip()
            except OSError as e:
                print("cannot read answer source: %s" % e, file=sys.stderr)
                sys.exit(1)
        if not text:
            print("empty answer, nothing written", file=sys.stderr)
            sys.exit(1)
        append(
            qa,
            {
                "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
                "type": "answer",
                "qid": args.qid,
                "text": text,
            },
        )
        emit({"ok": True, "qid": args.qid})

    elif args.cmd == "stop":
        pid_file = qa.parent.parent / "server.pid"
        if not pid_file.exists():
            emit({"stopped": False, "reason": "no pidfile — server not running"})
            sys.exit(1)
        try:
            pid = int(pid_file.read_text(encoding="ascii").strip())
        except (OSError, ValueError):
            pid_file.unlink(missing_ok=True)
            emit({"stopped": False, "reason": "corrupt pidfile (removed)"})
            sys.exit(1)
        try:
            os.kill(pid, 0)  # liveness probe; raises if dead
        except OSError:
            pid_file.unlink(missing_ok=True)
            emit({"stopped": False, "reason": "pid %d already dead (stale pidfile removed)" % pid})
            sys.exit(0)
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError as e:
            emit({"stopped": False, "reason": str(e)})
            sys.exit(1)
        pid_file.unlink(missing_ok=True)
        emit({"stopped": True, "pid": pid})

    elif args.cmd == "watch":
        deadline = time.time() + args.max_wait
        while time.time() < deadline:
            pending = pending_of(load(qa))
            if pending:
                questions = with_context(pending, qa) if args.context else pending
                emit({"type": "watch", "questions": questions})
                sys.exit(0)
            time.sleep(args.interval)
        sys.exit(1)


if __name__ == "__main__":
    main()
