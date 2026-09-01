/* ============================================================
   Help Me Understand · interactive layer
   (select-to-ask → Claude answers → in-page display)
   ------------------------------------------------------------
   How it works:
   · Select any text → an "Ask" button appears → type a question
   · The question is POSTed to the local notes server and
     appended to qa.jsonl
   · Claude-side a watcher monitors qa.jsonl; answers are written
     back to the same file
   · This page polls GET /qa?since= every 8s and reveals answers
   · Quoted text gets a blue dotted anchor + a ❓N badge that
     jumps to the matching Q&A card
   · With no server reachable, the whole layer hides itself
   ============================================================ */
(function () {
  "use strict";

  // ── i18n (English default; zh auto-detected from the browser) ──
  var L10N = {
    en: {
      askBtn: "❓ Ask",
      fab: "Questions",
      fabOffline: "Questions (offline)",
      tip: "📖 Interactive mode: select any text → ask a question",
      drawerTitle: "My Questions",
      drawerHint: "select text · answers appear automatically",
      empty: "No questions yet. Select any passage in the text and click “Ask”.",
      asked: "answered",
      waiting: "waiting",
      placeholder: "What would you like to ask about this passage? (⌘/Ctrl+Enter to send)",
      cancel: "Cancel",
      send: "Send",
      sending: "Sending…",
      retry: "Retry",
      sent: "✅ Sent — the answer will appear shortly",
      waitNote: "⏳ Sent to Claude — the answer will appear here…",
      sendFail: "Send failed — is the notes server running?",
      offlineHint: "The notes server is not running. Start it from your Claude Code session."
    },
    "zh-CN": {
      askBtn: "❓ 提问",
      fab: "问答",
      fabOffline: "问答（离线）",
      tip: "📖 互动模式：划选任意文字 → 提问",
      drawerTitle: "我的提问",
      drawerHint: "划词提问 · 回答自动出现",
      empty: "还没有提问。划选正文里的任意一段文字，点「提问」。",
      asked: "已回答",
      waiting: "等待中",
      placeholder: "关于这段话想问什么？（⌘/Ctrl+Enter 发送）",
      cancel: "取消",
      send: "发送",
      sending: "发送中…",
      retry: "重试",
      sent: "✅ 已发送，回答稍后出现在这里",
      waitNote: "⏳ 已发给 Claude，回答稍后出现在这里…",
      sendFail: "发送失败：本地服务器没有在跑？",
      offlineHint: "笔记服务器没在跑：回到 Claude Code 会话重新生成即可。"
    }
  };
  var T = (function () {
    var langs = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || "en"];
    for (var i = 0; i < langs.length; i++) {
      var tag = String(langs[i] || "").toLowerCase();
      if (tag.indexOf("zh") === 0) return L10N["zh-CN"];
    }
    return L10N.en;
  })();

  // ── base config ─────────────────────────────────────
  // Pages opened over http(s) talk same-origin; file:// pages
  // fall back to the local server, whose port the note generator
  // writes into the data-port attribute of this script tag.
  var PORT = (document.currentScript && document.currentScript.getAttribute("data-port")) || "8899";
  var API =
    location.protocol === "http:" || location.protocol === "https:"
      ? ""
      : "http://127.0.0.1:" + PORT;
  var POLL_MS = 8000;

  var state = { lastSeq: 0, byQid: {}, order: [], counter: 0, online: false };

  // ── helpers ─────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // minimal markdown for answers: paragraphs / **bold** / `code` / - lists
  function mdLite(text) {
    var out = "";
    text.split(/\n{2,}/).forEach(function (para) {
      var lines = para.split("\n");
      var bullets = lines.filter(function (l) { return /^[-•]\s+/.test(l); });
      var html = lines
        .map(function (l) {
          return esc(l)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+)`/g, "<code>$1</code>");
        })
        .join("<br>");
      if (bullets.length === lines.length) {
        out += "<ul>" + bullets.map(function (l) {
          return "<li>" + esc(l.replace(/^[-•]\s+/, "")) + "</li>";
        }).join("") + "</ul>";
      } else {
        out += "<p>" + html + "</p>";
      }
    });
    return out;
  }

  // ── data plane: poll + merge ────────────────────────
  function poll() {
    fetch(API + "/qa?since=" + state.lastSeq)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        setOnline(true);
        if (j.items && j.items.length) ingest(j.items);
      })
      .catch(function () { setOnline(false); });
  }

  function ingest(items) {
    items.forEach(function (e) {
      if (e.seq > state.lastSeq) state.lastSeq = e.seq;
      if (e.type === "question") {
        if (!state.byQid[e.id]) {
          state.counter += 1;
          state.byQid[e.id] = { q: e, a: null, no: state.counter, anchored: false };
          state.order.push(e.id);
        }
      } else if (e.type === "answer") {
        // an answer may arrive before its question object (e.g. after a
        // refresh) — keep it as an orphan and match it up later
        var hit = state.byQid[e.qid];
        if (hit) hit.a = e;
        else state["orphan_" + e.qid] = e;
      }
      // late question meets early answer
      var orphan = state["orphan_" + e.qid];
      if (e.type === "question" && orphan) {
        state.byQid[e.id].a = orphan;
        delete state["orphan_" + e.qid];
      }
    });
    render();
  }

  function setOnline(on) {
    if (on === state.online) return;
    state.online = on;
    renderFab();
    if (on && !setOnline.tipped) {
      setOnline.tipped = true;
      toast(T.tip);
    }
  }

  // ── in-page anchors: mark text that was asked about ──
  function tryAnchor(entry) {
    if (entry.anchored) return;
    var quote = (entry.q.quote || "").replace(/\s+/g, " ").trim();
    if (quote.length < 4) { entry.anchored = true; return; }
    var main = document.querySelector("main") || document.body;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      // collapse this text node to single spaces, keeping a
      // collapsed-position → original-index map
      var map = buildMap(node.data);
      if (map.text.indexOf(quote) === -1) continue;
      var start = map.idx[map.text.indexOf(quote)];
      var endPos = map.text.indexOf(quote) + quote.length - 1;
      var end = (map.idx[endPos] != null ? map.idx[endPos] : node.data.length - 1) + 1;
      try {
        var range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        var mark = el("mark", "qa-anchor");
        range.surroundContents(mark);
        var ref = el("sup", "qa-ref" + (entry.a ? " answered" : ""), "❓" + entry.no);
        ref.title = entry.q.text;
        ref.addEventListener("click", function () { openPanel(entry.q.id); });
        mark.after(ref);
        entry.anchored = true;
      } catch (err) { /* crossing element boundaries: skip the anchor,
                        the drawer still shows the Q&A */ }
      return;
    }
  }
  // "aab  c" → collapsed to "aab c", remembering each collapsed
  // character's original index
  function buildMap(data) {
    var text = "", idx = [];
    for (var i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) {
        if (text.slice(-1) === " ") continue; // collapse runs of whitespace
        text += " "; idx.push(i);
      } else {
        text += data[i]; idx.push(i);
      }
    }
    return { text: text, idx: idx };
  }

  // ── UI: drawer / FAB / cards ────────────────────────
  var fab = el("button", "qa-fab", T.fab);
  var panel = el("div", "qa-panel");
  var panelOpen = false;

  function renderFab() {
    if (!state.online) {
      fab.classList.add("offline");
      fab.textContent = T.fabOffline;
      return;
    }
    fab.classList.remove("offline");
    var pending = state.order.filter(function (id) { return !state.byQid[id].a; }).length;
    fab.textContent = T.fab;
    if (pending > 0) {
      var cnt = el("span", "cnt", String(pending));
      fab.appendChild(cnt);
    }
  }

  function openPanel(focusQid) {
    panelOpen = true;
    panel.style.display = "flex";
    render();
    if (focusQid) {
      var card = panel.querySelector('[data-qid="' + focusQid + '"]');
      if (card) {
        card.scrollIntoView({ block: "center" });
        card.style.transition = "background .3s";
        card.style.background = "#FBEDAF";
        setTimeout(function () { card.style.background = ""; }, 1200);
      }
    }
  }

  function render() {
    renderFab();
    // anchors
    state.order.forEach(function (id) { tryAnchor(state.byQid[id]); });
    // drawer
    panel.innerHTML = "";
    var head = el("div", "head");
    head.appendChild(el("b", null, T.drawerTitle));
    head.appendChild(el("span", "hint", T.drawerHint));
    panel.appendChild(head);
    var list = el("div", "list");
    if (state.order.length === 0) {
      list.appendChild(el("p", null, T.empty));
    }
    state.order.forEach(function (id) {
      var e = state.byQid[id];
      var card = el("div", "qa-card");
      card.setAttribute("data-qid", id);
      var meta = el("div", "meta");
      meta.appendChild(el("span", null, "❓" + e.no + " · " + (e.q.ts || "")));
      var st = el("span", "st " + (e.a ? "ok" : "wait"), e.a ? T.asked : T.waiting);
      meta.appendChild(st);
      card.appendChild(meta);
      if (e.q.quote) {
        var bq = el("blockquote", null);
        bq.textContent = "“" + e.q.quote + "”";
        card.appendChild(bq);
      }
      card.appendChild(el("p", "q", e.q.text));
      if (e.a) {
        var ans = el("div", "a");
        ans.innerHTML = mdLite(e.a.text);
        card.appendChild(ans);
      } else {
        card.appendChild(el("div", "wait-note", T.waitNote));
      }
      list.appendChild(card);
    });
    panel.appendChild(list);
  }

  fab.addEventListener("click", function () {
    if (!state.online) { toast(T.offlineHint); return; }
    panelOpen ? (panel.style.display = "none") : openPanel();
    panelOpen = !panelOpen;
  });

  // ── selection → ask popover ─────────────────────────
  var askBtn = el("button", "qa-askbtn", T.askBtn);
  askBtn.style.display = "none";
  var pop = null;

  document.addEventListener("mouseup", function () {
    setTimeout(positionAsk, 30);
  });
  document.addEventListener("touchend", function () {
    setTimeout(positionAsk, 60);
  });
  function positionAsk() {
    if (!state.online) return;
    if (pop) return; // don't move the button while the popover is open
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : "";
    if (!sel || sel.isCollapsed || text.length < 2) {
      askBtn.style.display = "none";
      return;
    }
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { askBtn.style.display = "none"; return; }
    askBtn.style.display = "block";
    var x = Math.min(rect.left + rect.width / 2 - 55, window.innerWidth - 120);
    var y = rect.top - 40 < 12 ? rect.bottom + 10 : rect.top - 40;
    askBtn.style.left = Math.max(10, x) + "px";
    askBtn.style.top = y + "px";
  }

  askBtn.addEventListener("mousedown", function (ev) {
    ev.preventDefault(); // keep the selection alive
  });
  askBtn.addEventListener("click", function () {
    var sel = window.getSelection();
    var quote = sel ? sel.toString().trim() : "";
    if (!quote) return;
    askBtn.style.display = "none";
    openPopover(quote, askBtn.style.left, askBtn.style.top);
  });

  function closePopover() { if (pop) { pop.remove(); pop = null; } }

  function openPopover(quote, x, y) {
    closePopover();
    pop = el("div", "qa-pop");
    pop.style.left = Math.max(10, Math.min(parseFloat(x), window.innerWidth - 360)) + "px";
    pop.style.top = Math.max(10, parseFloat(y)) + "px";
    if (quote) {
      var q = el("p", "quote", "“" + (quote.length > 90 ? quote.slice(0, 90) + "…" : quote) + "”");
      pop.appendChild(q);
    }
    var ta = document.createElement("textarea");
    ta.placeholder = T.placeholder;
    pop.appendChild(ta);
    var row = el("div", "row");
    var cancel = el("button", null, T.cancel);
    var send = el("button", "send", T.send);
    row.appendChild(cancel);
    row.appendChild(send);
    pop.appendChild(row);
    document.body.appendChild(pop);
    ta.focus();

    cancel.addEventListener("click", closePopover);
    function submit() {
      var text = ta.value.trim();
      if (!text) return;
      send.disabled = true;
      send.textContent = T.sending;
      var page = decodeURIComponent(location.pathname.split("/").pop() || "");
      fetch(API + "/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: page, quote: quote, question: text })
      })
        .then(function (r) { return r.json(); })
        .then(function (entry) {
          if (entry && entry.id) {
            ingest([entry]);
            closePopover();
            openPanel(entry.id);
            toast(T.sent);
          } else {
            throw new Error("bad response");
          }
        })
        .catch(function () {
          send.disabled = false;
          send.textContent = T.retry;
          toast(T.sendFail);
        });
    }
    send.addEventListener("click", submit);
    ta.addEventListener("keydown", function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") submit();
    });
  }

  document.addEventListener("mousedown", function (ev) {
    if (pop && !pop.contains(ev.target) && ev.target !== askBtn) closePopover();
  });

  // ── toast ───────────────────────────────────────────
  var toastTimer = null;
  function toast(msg) {
    var t = el("div", "qa-toast", msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.opacity = "0"; }, 3800);
    setTimeout(function () { t.remove(); }, 4300);
  }

  // ── start ───────────────────────────────────────────
  document.body.appendChild(fab);
  document.body.appendChild(panel);
  panel.style.display = "none";
  document.body.appendChild(askBtn);
  renderFab();
  poll();
  setInterval(poll, POLL_MS);
})();
