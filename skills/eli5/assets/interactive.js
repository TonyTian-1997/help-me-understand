/* ============================================================
   Help Me Understand · interactive layer — inline document comments
   (select-to-ask → Claude answers → comment threads in the page)
   ------------------------------------------------------------
   How it works:
   · Select any text → a comment bubble appears → type a question
   · The question is POSTed to the local notes server and
     appended to qa.jsonl; the quoted text gets a persistent
     amber highlight with a badge
   · Claude-side a watcher monitors qa.jsonl; answers are written
     back as replies in the same thread
   · Right sidebar: comment threads with avatars, hover-linking
     to the highlighted text, inline reply box, and resolve
   · With no server reachable, the whole layer hides itself
   ============================================================ */
(function () {
  "use strict";

  // ── i18n (English default; zh auto-detected from the browser) ──
  var L10N = {
    en: {
      askBtn: "Comment",
      fab: "Comments",
      fabOffline: "Comments (offline)",
      tip: "📖 Select any text to ask a question",
      panelTitle: "Comments",
      panelSub: "select text in the document to ask",
      empty: "No comments yet. Select any passage and click “Comment”.",
      allDone: "All threads resolved 🎉",
      you: "You",
      claude: "Claude",
      waiting: "waiting for Claude…",
      reply: "Reply",
      resolve: "Resolve",
      replyPlaceholder: "Reply with another question…",
      send: "Send",
      cancel: "Cancel",
      sending: "Sending…",
      retry: "Retry",
      sent: "✅ Sent — the answer will appear here",
      waitNote: "⏳ Sent to Claude — the answer will appear here…",
      sendFail: "Send failed — is the notes server running?",
      resolveFail: "Could not mark as resolved",
      offlineHint: "The notes server is not running. Restart it from your Claude Code session.",
      placeholder: "What would you like to ask about this passage? (⌘/Ctrl+Enter to send)"
    },
    "zh-CN": {
      askBtn: "评论",
      fab: "评论",
      fabOffline: "评论（离线）",
      tip: "📖 划选任意文字即可提问",
      panelTitle: "评论",
      panelSub: "划选正文任意文字即可提问",
      empty: "还没有评论。划选正文里的任意一段文字，点「评论」。",
      allDone: "全部已解决 🎉",
      you: "你",
      claude: "Claude",
      waiting: "等待 Claude 回答…",
      reply: "回复",
      resolve: "解决",
      replyPlaceholder: "继续追问…",
      send: "发送",
      cancel: "取消",
      sending: "发送中…",
      retry: "重试",
      sent: "✅ 已发送，回答稍后出现在这里",
      waitNote: "⏳ 已发给 Claude，回答稍后出现在这里…",
      sendFail: "发送失败：本地服务器没有在跑？",
      resolveFail: "标记解决失败",
      offlineHint: "笔记服务器没在跑：回到 Claude Code 会话重新生成即可。",
      placeholder: "关于这段话想问什么？（⌘/Ctrl+Enter 发送）"
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
  var PORT = (document.currentScript && document.currentScript.getAttribute("data-port")) || "8899";
  var API =
    location.protocol === "http:" || location.protocol === "https:"
      ? ""
      : "http://127.0.0.1:" + PORT;
  var POLL_MS = 8000;
  var AVATAR = { you: { color: "#FF8800", letter: "U" }, claude: { color: "#3370FF", letter: "C" } };
  // this page's own file name — the comment sidebar is per-document:
  // threads asked on other pages stay on those pages
  var PAGE = decodeURIComponent(location.pathname.split("/").pop() || "");

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
  function avatar(kind, small) {
    var a = AVATAR[kind] || AVATAR.you;
    var n = el("span", "qa-av" + (small ? " sm" : ""), a.letter);
    n.style.background = a.color;
    return n;
  }
  function timeOf(ts) { return (ts || "").split(" ").slice(-1)[0] || ts || ""; }

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
        if (e.page && e.page !== PAGE) return; // other pages' threads stay there
        if (!state.byQid[e.id]) {
          state.counter += 1;
          state.byQid[e.id] = { q: e, a: null, no: state.counter, anchored: false, resolved: false, refs: [] };
          state.order.push(e.id);
        }
      } else if (e.type === "answer") {
        // answers carry only a qid; unknown qids belong to other pages
        var hit = state.byQid[e.qid];
        if (hit) hit.a = e;
      } else if (e.type === "resolve") {
        var t = state.byQid[e.qid];
        if (t) t.resolved = true;
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

  // ── in-text anchors: persistent comment highlight ──
  function tryAnchor(entry) {
    if (entry.anchored || entry.resolved) return;
    var quote = (entry.q.quote || "").replace(/\s+/g, " ").trim();
    if (quote.length < 4) { entry.anchored = true; return; }
    var main = document.querySelector("main") || document.body;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var map = buildMap(node.data);
      if (map.text.indexOf(quote) === -1) continue;
      var start = map.idx[map.text.indexOf(quote)];
      var endPos = map.text.indexOf(quote) + quote.length - 1;
      var end = (map.idx[endPos] != null ? map.idx[endPos] : node.data.length - 1) + 1;
      try {
        var range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        var mark = el("mark", "qa-anchor" + (entry.a ? " answered" : ""));
        range.surroundContents(mark);
        var ref = el("sup", "qa-ref" + (entry.a ? " answered" : ""), (entry.a ? "✓" : "?") + entry.no);
        ref.title = entry.q.text;
        ref.addEventListener("click", function () { openPanel(entry.q.id, false); });
        mark.addEventListener("click", function () { openPanel(entry.q.id, false); });
        entry.refs = [mark, ref];
        mark.after(ref);
        entry.anchored = true;
      } catch (err) { /* crossing element boundaries: skip the anchor,
                        the sidebar still shows the thread */ }
      return;
    }
  }
  function buildMap(data) {
    var text = "", idx = [];
    for (var i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) {
        if (text.slice(-1) === " ") continue;
        text += " "; idx.push(i);
      } else {
        text += data[i]; idx.push(i);
      }
    }
    return { text: text, idx: idx };
  }

  // hover-link + click-to-locate (card ↔ highlighted text)
  function linkCardToAnchor(entry, card) {
    card.addEventListener("mouseenter", function () {
      entry.refs.forEach(function (n) { n.classList.add("hot"); });
    });
    card.addEventListener("mouseleave", function () {
      entry.refs.forEach(function (n) { n.classList.remove("hot"); });
    });
    card.addEventListener("click", function (ev) {
      if (ev.target.closest("button, textarea, a")) return;
      var a = entry.refs[0];
      if (!a) return;
      a.scrollIntoView({ block: "center", behavior: "smooth" });
      a.classList.remove("flash");
      void a.offsetWidth; // restart the animation
      a.classList.add("flash");
    });
  }

  // ── UI: sidebar / FAB / threads ─────────────────────
  var fab = el("button", "qa-fab");
  var fabIcon = el("span", "qa-fab-ico", "💬");
  var fabCnt = el("span", "qa-fab-cnt");
  fab.appendChild(fabIcon);
  fab.appendChild(fabCnt);
  var panel = el("aside", "qa-panel");
  var panelOpen = false;

  function renderFab() {
    fabCnt.textContent = "";
    if (!state.online) {
      fab.classList.add("offline");
      fab.title = T.fabOffline;
      return;
    }
    fab.classList.remove("offline");
    fab.title = T.fab;
    var pending = state.order.filter(function (id) { return !state.byQid[id].a && !state.byQid[id].resolved; }).length;
    if (pending > 0) {
      fabCnt.textContent = String(pending);
      fabCnt.style.display = "";
    } else {
      fabCnt.style.display = "none";
    }
  }

  function openPanel(focusQid, scrollList) {
    panelOpen = true;
    panel.classList.add("open");
    hideAskBtn();
    fab.style.display = "none"; // the round button overlaps the sidebar — step aside
    render();
    if (focusQid) {
      var card = panel.querySelector('[data-qid="' + focusQid + '"]');
      if (card) {
        card.scrollIntoView({ block: "center" });
        card.style.transition = "background .3s";
        card.classList.add("focus");
        setTimeout(function () { card.classList.remove("focus"); }, 1200);
      }
    }
  }
  function closePanel() {
    panelOpen = false;
    panel.classList.remove("open");
    fab.style.display = ""; // bring the round button back
    setTimeout(positionAsk, 30); // a live selection re-summons the button at once
  }

  function threadCard(entry) {
    var e = entry; // resolved threads are never rendered (resolve deletes)
    var card = el("div", "qa-thread");
    card.setAttribute("data-qid", e.q.id);

    // head: avatar + name + time
    var head = el("div", "qa-th-head");
    head.appendChild(avatar("you"));
    var meta = el("div", "qa-th-meta");
    var nameRow = el("div", "qa-th-namerow");
    nameRow.appendChild(el("b", null, T.you));
    nameRow.appendChild(el("span", "qa-th-time", timeOf(e.q.ts)));
    if (e.a) {
      nameRow.appendChild(el("span", "qa-th-donetag ok", "✓"));
    }
    meta.appendChild(nameRow);
    head.appendChild(meta);
    card.appendChild(head);

    // quoted passage (the sentence the reader selected)
    if (e.q.quote) {
      var bq = el("div", "qa-quote");
      bq.textContent = e.q.quote.length > 140 ? e.q.quote.slice(0, 140) + "…" : e.q.quote;
      card.appendChild(bq);
    }

    // the question
    card.appendChild(el("div", "qa-text", e.q.text));

    // the answer (indented reply)
    if (e.a) {
      var rep = el("div", "qa-reply");
      var rhead = el("div", "qa-th-head");
      rhead.appendChild(avatar("claude", true));
      var rmeta = el("div", "qa-th-meta");
      var rname = el("div", "qa-th-namerow");
      rname.appendChild(el("b", null, T.claude));
      rname.appendChild(el("span", "qa-th-time", timeOf(e.a.ts)));
      rmeta.appendChild(rname);
      rhead.appendChild(rmeta);
      rep.appendChild(rhead);
      var ans = el("div", "qa-text");
      ans.innerHTML = mdLite(e.a.text);
      rep.appendChild(ans);
      card.appendChild(rep);
    } else {
      card.appendChild(el("div", "qa-waiting", "⏳ " + T.waiting));
    }

    // actions: reply / resolve (resolve deletes the whole thread)
    var acts = el("div", "qa-th-actions");
    var btnReply = el("button", "qa-act", T.reply);
    btnReply.addEventListener("click", function () { toggleReplyBox(card, e); });
    var btnResolve = el("button", "qa-act", T.resolve);
    btnResolve.addEventListener("click", function () { resolveThread(e); });
    acts.appendChild(btnReply);
    acts.appendChild(btnResolve);
    card.appendChild(acts);

    linkCardToAnchor(e, card);
    return card;
  }

  // inline reply composer (under the thread)
  function toggleReplyBox(card, entry) {
    closePopover(); // following up in a thread → collapse the ask bubble
    var existing = card.querySelector(".qa-replybox");
    if (existing) { existing.remove(); return; }
    // release any leftover page selection so the floating button can't
    // resurrect while composing
    try { window.getSelection().removeAllRanges(); } catch (err) {}
    var box = el("div", "qa-replybox");
    var ta = document.createElement("textarea");
    ta.placeholder = T.replyPlaceholder;
    var row = el("div", "qa-rb-row");
    var cancel = el("button", null, T.cancel);
    var send = el("button", "send", T.send);
    row.appendChild(cancel);
    row.appendChild(send);
    box.appendChild(ta);
    box.appendChild(row);
    card.appendChild(box);
    ta.focus();
    cancel.addEventListener("click", function () { box.remove(); });
    function submit() {
      var text = ta.value.trim();
      if (!text) return;
      send.disabled = true;
      send.textContent = T.sending;
      fetch(API + "/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: PAGE, quote: entry.q.quote || "", question: text })
      })
        .then(function (r) { return r.json(); })
        .then(function (e2) {
          if (e2 && e2.id) {
            ingest([e2]);
            toast(T.sent);
          } else throw new Error("bad response");
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

  function resolveThread(entry) {
    fetch(API + "/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qid: entry.q.id })
    })
      .then(function (r) { return r.json(); })
      .then(function (e) {
        if (e && e.type === "resolve") ingest([e]);
        else throw new Error("bad response");
      })
      .catch(function () { toast(T.resolveFail); });
  }

  function render() {
    renderFab();
    state.order.forEach(function (id) { tryAnchor(state.byQid[id]); });
    // resolved threads release their in-text highlight
    state.order.forEach(function (id) {
      var t = state.byQid[id];
      if (t.resolved && t.refs.length) {
        t.refs.forEach(function (n) { n.classList.add("resolved"); });
      }
    });

    panel.innerHTML = "";
    var head = el("div", "qa-panel-head");
    var ht = el("div", "qa-panel-title");
    ht.appendChild(el("b", null, T.panelTitle));
    var n = state.order.filter(function (id) { return !state.byQid[id].resolved; }).length;
    ht.appendChild(el("span", "qa-panel-count", n ? String(n) : ""));
    head.appendChild(ht);
    head.appendChild(el("div", "qa-panel-sub", T.panelSub));
    var closeBtn = el("button", "qa-panel-close", "✕");
    closeBtn.addEventListener("click", closePanel);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    var list = el("div", "qa-list");
    var open = state.order.filter(function (id) { return !state.byQid[id].resolved; });
    if (state.order.length === 0) {
      list.appendChild(el("p", "qa-empty", T.empty));
    } else if (open.length === 0) {
      list.appendChild(el("p", "qa-empty", T.allDone));
    }
    // resolved threads are removed outright — resolve deletes the thread
    open.forEach(function (id) { list.appendChild(threadCard(state.byQid[id])); });
    panel.appendChild(list);
  }

  fab.addEventListener("click", function () {
    if (!state.online) { toast(T.offlineHint); return; }
    panelOpen ? closePanel() : openPanel();
  });

  // ── selection → comment popover ─────────────────────
  var askBtn = el("button", "qa-askbtn", T.askBtn);
  askBtn.style.display = "none";
  var pop = null;

  document.addEventListener("mouseup", function () {
    setTimeout(positionAsk, 30);
  });
  document.addEventListener("touchend", function () {
    setTimeout(positionAsk, 60);
  });
  function hideAskBtn() { askBtn.style.display = "none"; }

  function positionAsk() {
    if (!state.online) return;
    // sidebar open → no floating button at all, wherever the selection is
    if (panelOpen) { hideAskBtn(); return; }
    if (pop) { hideAskBtn(); return; } // bubble open — never stack the button
    if (panel.querySelector(".qa-replybox")) { hideAskBtn(); return; } // composing
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : "";
    if (!sel || sel.isCollapsed || text.length < 2) {
      hideAskBtn();
      return;
    }
    // selections inside the sidebar (copying an answer, composing) don't count
    if (sel.rangeCount && panel.contains(sel.anchorNode)) { hideAskBtn(); return; }
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { hideAskBtn(); return; }
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
    if (!quote || !sel.rangeCount) return;
    hideAskBtn();
    openPopover(quote, sel.getRangeAt(0).getBoundingClientRect());
  });

  function closePopover() {
    if (pop) { pop.remove(); pop = null; }
    hideAskBtn();
  }

  function openPopover(quote, rect) {
    closePopover();
    pop = el("div", "qa-pop");
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
    // place above the selection when there's room, else below — never on
    // top of the quoted text itself
    var h = pop.offsetHeight || 200;
    var left = Math.max(10, Math.min(rect.left + rect.width / 2 - 170, window.innerWidth - 352));
    var top = rect.top - h - 14;
    if (top < 10) top = Math.min(rect.bottom + 12, window.innerHeight - h - 10);
    pop.style.left = left + "px";
    pop.style.top = Math.max(10, top) + "px";
    ta.focus();

    cancel.addEventListener("click", closePopover);
    function submit() {
      var text = ta.value.trim();
      if (!text) return;
      send.disabled = true;
      send.textContent = T.sending;
      fetch(API + "/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: PAGE, quote: quote, question: text })
      })
        .then(function (r) { return r.json(); })
        .then(function (entry) {
          if (entry && entry.id) {
            ingest([entry]);
            closePopover();
            // release the page selection so the floating button doesn't
            // resurrect over the freshly anchored highlight
            try { window.getSelection().removeAllRanges(); } catch (err) {}
            openPanel(entry.id, true);
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
  document.body.appendChild(askBtn);
  renderFab();
  poll();
  setInterval(poll, POLL_MS);
})();
