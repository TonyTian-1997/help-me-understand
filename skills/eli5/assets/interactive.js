/* ============================================================
   Help Me Understand · interactive layer — inline document comments
   (select-to-ask → Claude answers → comment threads in the page)
   ------------------------------------------------------------
   How it works:
   · The 💬 bubble at the bottom-left toggles the comment sidebar;
     the ask box lives at the top of the sidebar, and selecting
     text loads the quote into it
   · The question is POSTed to the local notes server and appended
     to qa.jsonl; the quoted passage gets a persistent amber
     highlight (across element boundaries) with a badge
   · Claude-side a watcher monitors qa.jsonl; answers are written
     back as replies in the same thread
   · Right sidebar: comment threads; clicking a highlight or badge
     opens it at that thread
   · With no server reachable, the whole layer hides itself
   ============================================================ */
(function () {
  "use strict";

  // ── i18n (English default; zh auto-detected from the browser) ──
  var L10N = {
    en: {
      fab: "Comments",
      tip: "📖 Select any text, then ask via the 💬 button",
      panelTitle: "Comments",
      panelSub: "select text in the document to ask",
      empty: "No comments yet. Select any passage and ask in the composer.",
      allDone: "All threads resolved 🎉",
      you: "You",
      claude: "Claude",
      waiting: "waiting for Claude…",
      reply: "Ask a question",
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
      composerPlaceholder: "Ask about the selected passage, or anything on this page…",
      composerEmpty: "Ask anything about this note…",
      clearQuote: "drop quoted passage",
      collapse: "Collapse",
      writing: "✍️ Writing — this page updates itself"
    },
    "zh-CN": {
      fab: "评论",
      tip: "📖 划选任意文字，点 💬 提问",
      panelTitle: "评论",
      panelSub: "划选正文任意文字即可提问",
      empty: "还没有评论。划选正文，点 💬 提问。",
      allDone: "全部已解决 🎉",
      you: "你",
      claude: "Claude",
      waiting: "等待 Claude 回答…",
      reply: "继续提问",
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
      composerPlaceholder: "就选中的这段提问，或问本页任何问题…",
      composerEmpty: "关于这篇笔记，随便问…",
      clearQuote: "取消引用",
      collapse: "收起",
      writing: "✍️ 正在书写——本页会自动更新"
    }
  };
  var T = (function () {
    // explicit override first (data-lang="en|zh" on the script tag),
    // then browser language, English default
    var forced = document.currentScript && document.currentScript.getAttribute("data-lang");
    if (forced) return String(forced).toLowerCase().indexOf("zh") === 0 ? L10N["zh-CN"] : L10N.en;
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
  function collapseWS(s) { return s.replace(/\s+/g, " "); }

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
    if (!on) { // offline = invisible layer
      bubble.style.display = "none";
    } else {
      renderBubble();
    }
    if (on && !setOnline.tipped) {
      setOnline.tipped = true;
      toast(T.tip);
    }
  }

  // ── in-text anchors: persistent comment highlight ──
  // The quote is matched against the whole main column with whitespace
  // collapsed, spanning text-node boundaries: a passage that crosses
  // inline tags still gets highlighted (one mark per text segment).
  function buildFullMap() {
    // concatenate per-node whitespace-collapsed text with NO separator:
    // a quote crossing an inline tag (<code>, <strong>, toys spans) is
    // contiguous in the selection string, so it must be contiguous here
    var main = document.querySelector("main") || document.body;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
    var full = "";
    var map = []; // map[i] = { node, off }
    var node;
    while ((node = walker.nextNode())) {
      var data = node.data;
      var prev = "";
      for (var i = 0; i < data.length; i++) {
        if (/\s/.test(data[i])) {
          if (prev === " ") continue;
          full += " "; map.push({ node: node, off: i });
          prev = " ";
        } else {
          full += data[i]; map.push({ node: node, off: i });
          prev = data[i];
        }
      }
    }
    return { text: full, map: map };
  }

  function tryAnchor(entry) {
    if (entry.anchored || entry.resolved) return;
    var quote = collapseWS(entry.q.quote || "").trim();
    if (quote.length < 4) { entry.anchored = true; return; }
    var fm = buildFullMap();
    var at = fm.text.indexOf(quote);
    if (at === -1) { entry.anchored = true; return; } // not on this page (yet)
    var end = at + quote.length - 1;
    // group the matched character range into per-node segments
    var segs = [];
    var seg = null;
    for (var i = at; i <= end; i++) {
      var m = fm.map[i];
      if (!m) continue; // inter-node space
      if (seg && seg.node === m.node && m.off === seg.end) {
        seg.end = m.off + 1;
      } else {
        if (seg) segs.push(seg);
        seg = { node: m.node, start: m.off, end: m.off + 1 };
      }
    }
    if (seg) segs.push(seg);

    var marks = [];
    segs.forEach(function (s, idx) {
      try {
        var range = document.createRange();
        range.setStart(s.node, s.start);
        range.setEnd(s.node, s.end);
        var mark = el("mark", "qa-anchor" + (entry.a ? " answered" : ""));
        range.surroundContents(mark);
        mark.addEventListener("click", function () { openPanel(entry.q.id, false); });
        marks.push(mark);
        if (idx === 0) {
          var ref = el("sup", "qa-ref" + (entry.a ? " answered" : ""), (entry.a ? "✓" : "?") + entry.no);
          ref.title = entry.q.text;
          ref.addEventListener("click", function () { openPanel(entry.q.id, false); });
          mark.after(ref);
          marks.push(ref);
        }
      } catch (err) { /* boundary quirk on one segment: the rest still mark */ }
    });
    entry.refs = marks;
    entry.anchored = true;
  }

  // ── UI: sidebar / bubble / threads ──────────────────
  var bubble = el("button", "qa-bubble");
  var bubbleIco = el("span", "qa-bubble-ico", "💬");
  var bubbleCnt = el("span", "qa-bubble-cnt");
  var bubbleDot = el("span", "qa-bubble-dot");
  bubble.appendChild(bubbleIco);
  bubble.appendChild(bubbleCnt);
  bubble.appendChild(bubbleDot);
  var panel = el("aside", "qa-panel");
  var panelOpen = false;

  function renderBubble() {
    if (!state.online) {
      bubble.style.display = "none"; // offline = the whole layer is invisible
      return;
    }
    bubble.style.display = "";
    bubble.title = T.fab;
    var pending = state.order.filter(function (id) { return !state.byQid[id].a && !state.byQid[id].resolved; }).length;
    if (pending > 0) {
      bubbleCnt.textContent = String(pending);
      bubbleCnt.style.display = "";
    } else {
      bubbleCnt.style.display = "none";
    }
  }

  function openPanel(focusQid, scrollList) {
    panelOpen = true;
    panel.classList.add("open");
    document.body.classList.add("qa-panel-open");
    var wb = document.querySelector(".hmu-writing-badge");
    if (wb) wb.style.display = "none";
    render();
    if (currentQuote && typeof compTa !== "undefined") compTa.focus();
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
    document.body.classList.remove("qa-panel-open");
    var wb = document.querySelector(".hmu-writing-badge");
    if (wb) wb.style.display = "";
    renderBubble();
  }

  function threadCard(entry) {
    var e = entry; // resolved threads are never rendered (resolve deletes)
    var card = el("div", "qa-thread");
    card.setAttribute("data-qid", e.q.id);

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

    if (e.q.quote) {
      var bq = el("div", "qa-quote");
      bq.textContent = e.q.quote.length > 140 ? e.q.quote.slice(0, 140) + "…" : e.q.quote;
      card.appendChild(bq);
    }

    card.appendChild(el("div", "qa-text", e.q.text));

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

    // hover-link + click-to-locate (card ↔ highlighted passage)
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
      void a.offsetWidth;
      a.classList.add("flash");
    });

    return card;
  }

  function toggleReplyBox(card, entry) {
    var existing = card.querySelector(".qa-replybox");
    if (existing) { existing.remove(); return; }
    // release any leftover page selection
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
    renderBubble();
    state.order.forEach(function (id) {
      tryAnchor(state.byQid[id]);
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
    panel.appendChild(composer); // ask box at the top of the sidebar

    var list = el("div", "qa-list");
    var open = state.order.filter(function (id) { return !state.byQid[id].resolved; });
    if (state.order.length === 0) {
      list.appendChild(el("p", "qa-empty", T.empty));
    } else if (open.length === 0) {
      list.appendChild(el("p", "qa-empty", T.allDone));
    }
    open.forEach(function (id) { list.appendChild(threadCard(state.byQid[id])); });
    panel.appendChild(list);
  }

  // ── composer: the ask box at the top of the sidebar ──
  var composer = el("div", "qa-composer");
  var compQuote = el("div", "qa-comp-quote");
  compQuote.style.display = "none";
  var compTa = document.createElement("textarea");
  compTa.placeholder = T.composerEmpty;
  var compRow = el("div", "qa-comp-row");
  var compDrop = el("button", "qa-comp-drop", "✕ " + T.clearQuote);
  compDrop.title = T.clearQuote;
  compDrop.style.display = "none";
  var compSend = el("button", "send", T.send);
  compRow.appendChild(compDrop);
  compRow.appendChild(compSend);
  composer.appendChild(compQuote);
  composer.appendChild(compTa);
  composer.appendChild(compRow);

  bubble.addEventListener("click", function () { panelOpen ? closePanel() : openPanel(); });

  var currentQuote = "";
  function setQuote(q) {
    currentQuote = q;
    bubble.classList.toggle("has-quote", !!q);
    if (q) {
      compQuote.textContent = "“" + (q.length > 140 ? q.slice(0, 140) + "…" : q) + "”";
      compQuote.style.display = "";
      compDrop.style.display = "";
      compTa.placeholder = T.composerPlaceholder;
      bubble.classList.remove("pulse");
      void bubble.offsetWidth;
      bubble.classList.add("pulse");
    } else {
      compQuote.style.display = "none";
      compDrop.style.display = "none";
      compTa.placeholder = T.composerEmpty;
    }
  }
  compDrop.addEventListener("click", function () {
    try { window.getSelection().removeAllRanges(); } catch (err) {}
    setQuote("");
  });

  // selections land in the sidebar's ask box — no floating button anywhere
  var selTimer = null;
  document.addEventListener("selectionchange", function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      if (composer.contains(sel.anchorNode) || panel.contains(sel.anchorNode)) return;
      var text = sel.toString().trim();
      if (text.length >= 2) setQuote(text);
    }, 250);
  });

  function composerSubmit() {
    var text = compTa.value.trim();
    if (!text) return;
    compSend.disabled = true;
    compSend.textContent = T.sending;
    fetch(API + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: PAGE, quote: currentQuote, question: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (entry) {
        if (entry && entry.id) {
          ingest([entry]);
          // release the page selection: the anchor highlight takes over
          try { window.getSelection().removeAllRanges(); } catch (err) {}
          compTa.value = "";
          setQuote("");
          openPanel(entry.id, true);
          toast(T.sent);
        } else {
          throw new Error("bad response");
        }
      })
      .catch(function () {
        compSend.disabled = false;
        compSend.textContent = T.retry;
        toast(T.sendFail);
      });
  }
  compSend.addEventListener("click", composerSubmit);
  compTa.addEventListener("keydown", function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") composerSubmit();
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

  // ── draft pages grow while being written ────────────
  if (document.querySelector('meta[name="hmu-draft"]')) {
    var badge = el("div", "hmu-writing-badge", T.writing);
    document.body.appendChild(badge);
    var prevLen = null;
    setInterval(function () {
      fetch(location.href, { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          var finished = txt.indexOf('name="hmu-draft"') === -1;
          // never reload out from under an open sidebar or an in-flight
          // question — recheck on the next tick instead
          if (prevLen !== null && (finished || Math.abs(txt.length - prevLen) > 40)) {
            if (!panelOpen && document.activeElement !== compTa && !compTa.value) location.reload();
            return;
          }
          prevLen = txt.length;
        })
        .catch(function () {});
    }, 5000);
  }

  // ── start ───────────────────────────────────────────
  document.body.appendChild(bubble);
  document.body.appendChild(panel);
  renderBubble();
  poll();
  setInterval(poll, POLL_MS);
})();
