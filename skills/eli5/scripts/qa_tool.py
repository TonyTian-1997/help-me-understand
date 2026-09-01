#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────
#  qa_tool.py — Claude-side Q&A helper (pairs with server.py)
#
#    python3 qa_tool.py [--qa PATH] pending
#        list questions that still need an answer as JSON — a
#        question counts as done once it has an answer OR the
#        reader resolved it in the browser (prints nothing
#        when there are none)
#
#    echo "answer text" | python3 qa_tool.py [--qa PATH] answer <qid> -
#    python3 qa_tool.py [--qa PATH] answer <qid> answer.txt
#
#    python3 qa_tool.py [--qa PATH] watch [--interval 5] [--max-wait 7200]
#        watchman for the skill's background task: poll pending
#        questions; the moment any exist, print them as one JSON
#        line and exit 0 (the exit nudges the session to wake up
#        and answer). Exits 1 quietly on timeout.
#
#  Cross-platform: Python 3.9+ standard library only.
# ─────────────────────────────────────────────────────────
import argparse
import json
import sys
import time
from pathlib import Path

DEFAULT_QA = Path.home() / ".understand" / "notes" / "qa.jsonl"


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
    sub.add_parser("pending", help="list unanswered questions")
    a = sub.add_parser("answer", help="answer a question by id")
    a.add_argument("qid")
    a.add_argument("src", help="'-' to read the answer from stdin, or a file path")
    w = sub.add_parser("watch", help="poll until a question arrives, then print and exit")
    w.add_argument("--interval", type=float, default=5, help="polling seconds (default: 5)")
    w.add_argument("--max-wait", type=float, default=7200, help="give up after this many seconds (default: 7200)")
    args = ap.parse_args()

    qa = Path(args.qa).expanduser()
    qa.parent.mkdir(parents=True, exist_ok=True)

    if args.cmd == "pending":
        pending = pending_of(load(qa))
        if pending:
            emit(pending)

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

    elif args.cmd == "watch":
        deadline = time.time() + args.max_wait
        while time.time() < deadline:
            pending = pending_of(load(qa))
            if pending:
                emit({"type": "watch", "questions": pending})
                sys.exit(0)
            time.sleep(args.interval)
        sys.exit(1)


if __name__ == "__main__":
    main()
