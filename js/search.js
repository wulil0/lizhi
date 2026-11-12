// 搜索：歌名 + 歌词内容。索引是 search-index.json（build_search_index.py 生成，
// 同源 fetch，不走 OBS 签名）。输入即搜（防抖），点结果直接播放对应歌曲。
// 歌词命中时显示命中行及其前后行；歌名命中排在前面。
(function () {
  const input = document.getElementById("search-input");
  const box = document.getElementById("search-results");
  const clearBtn = document.getElementById("search-clear");
  if (!input || !box) return;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // 归一化：小写、去掉空白与标点——歌名里的“，”和用户输入里的空格都不影响匹配
  const norm = (s) => String(s || "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  const MAX_SHOW = 30;
  const DEBOUNCE_MS = 180;

  let indexPromise = null; // -> 索引数据（每首预先算好归一化后的歌名/歌词行）
  let current = [];        // 当前展示的结果 [{ t, kind, line }]
  let activeIdx = -1;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("search-index.json", { cache: "no-cache" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((d) => {
          for (const t of d.tracks) {
            t._tn = norm(t.t);
            t._an = norm(t.al);
            t._lines = t.l ? t.l.split("\n") : [];
            t._ln = t._lines.map(norm);
          }
          return d;
        })
        .catch((e) => { indexPromise = null; throw e; });
    }
    return indexPromise;
  }

  // 尽量按用户原输入高亮；归一化后才命中的（例如去掉了标点）则不强行标红
  function highlight(raw, qRaw) {
    const q = qRaw.trim();
    if (!q) return esc(raw);
    const i = raw.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(raw);
    return esc(raw.slice(0, i)) + "<mark>" + esc(raw.slice(i, i + q.length)) + "</mark>" + esc(raw.slice(i + q.length));
  }

  function search(qRaw) {
    const q = norm(qRaw);
    if (!q) { hide(); return; }
    showStatus("正在搜…");
    loadIndex().then((d) => {
      if (norm(input.value) !== q) return; // 用户已改了输入：只响应最新一次查询
      const hits = [];
      for (const t of d.tracks) {
        if (t._tn.includes(q)) { hits.push({ t, kind: "title", line: -1, rank: 0 }); continue; }
        let li = -1;
        for (let i = 0; i < t._ln.length; i++) { if (t._ln[i].includes(q)) { li = i; break; } }
        if (li >= 0) { hits.push({ t, kind: "lyric", line: li, rank: 1 }); continue; }
        if (t._an.includes(q)) hits.push({ t, kind: "album", line: -1, rank: 2 });
      }
      const yearOf = (a) => { const hit = (typeof ALBUMS !== "undefined" ? ALBUMS : []).find((x) => x.id === a); return hit ? hit.year : 9999; };
      hits.sort((x, y) => (x.rank - y.rank) || (yearOf(x.t.a) - yearOf(y.t.a)) || (x.t.n - y.t.n));
      render(qRaw, hits);
    }).catch(() => {
      if (norm(input.value) !== q) return;
      showStatus("歌词索引加载失败，刷新页面再试。");
    });
  }

  function render(qRaw, hits) {
    current = hits.slice(0, MAX_SHOW);
    activeIdx = -1;
    if (!hits.length) {
      box.innerHTML = `<div class="sr-empty">没找到“${esc(qRaw.trim())}”——换个词试试？可以搜歌名，也可以搜一句歌词。</div>`;
      box.hidden = false;
      return;
    }
    const kindLabel = { title: "歌名", lyric: "歌词", album: "专辑" };
    box.innerHTML =
      `<div class="sr-count">找到 ${hits.length} 首</div>` +
      current.map((h, i) => {
        const t = h.t;
        let snip = "";
        if (h.kind === "lyric") {
          const lines = t._lines;
          const ctx = [];
          if (h.line > 0) ctx.push(esc(lines[h.line - 1]));
          ctx.push(highlight(lines[h.line], qRaw));
          if (h.line < lines.length - 1) ctx.push(esc(lines[h.line + 1]));
          snip = `<div class="sr-snippet">${ctx.join("<br>")}</div>`;
        }
        return `<button type="button" class="sr-item" data-i="${i}">
          <span class="sr-kind">${kindLabel[h.kind]}</span>
          <span class="sr-title">${highlight(t.t, qRaw)}</span>
          <span class="sr-album">《${esc(t.al)}》 · 第 ${String(t.n).padStart(2, "0")} 首</span>
          ${snip}</button>`;
      }).join("") +
      (hits.length > MAX_SHOW ? `<div class="sr-more">共 ${hits.length} 条，只显示前 ${MAX_SHOW} 条——可以把搜索词再写具体一点</div>` : "");
    box.hidden = false;
  }

  function showStatus(msg) {
    box.innerHTML = `<div class="sr-status">${esc(msg)}</div>`;
    box.hidden = false;
  }
  function hide() { box.hidden = true; activeIdx = -1; current = []; }

  function play(albumId, n) {
    const P = window.LizhiPlayer;
    hide();
    input.blur();
    if (P && P.ready) { P.playAlbum(albumId, n); return; }
    // 播放器清单还在加载：等它就绪再播
    const once = () => {
      document.removeEventListener("lizhi:player-ready", once);
      if (window.LizhiPlayer) window.LizhiPlayer.playAlbum(albumId, n);
    };
    document.addEventListener("lizhi:player-ready", once);
  }

  function markActive() {
    box.querySelectorAll(".sr-item").forEach((el, i) => el.classList.toggle("active", i === activeIdx));
    const el = box.querySelectorAll(".sr-item")[activeIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }

  let timer = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    if (clearBtn) clearBtn.hidden = !input.value;
    timer = setTimeout(() => search(input.value), DEBOUNCE_MS);
  });
  input.addEventListener("focus", () => {
    loadIndex().catch(() => {}); // 预热：第一次点进搜索框就开始拉索引
    if (input.value.trim()) search(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hide(); input.blur(); return; }
    if (box.hidden || !current.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = e.key === "ArrowDown"
        ? (activeIdx + 1) % current.length
        : (activeIdx - 1 + current.length) % current.length;
      markActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const h = current[activeIdx >= 0 ? activeIdx : 0];
      if (h) play(h.t.a, h.t.n);
    }
  });
  if (clearBtn) clearBtn.addEventListener("click", () => {
    input.value = ""; clearBtn.hidden = true; hide(); input.focus();
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest(".sr-item");
    if (!b) return;
    const h = current[+b.dataset.i];
    if (h) play(h.t.a, h.t.n);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".searchbar")) hide();
  });
})();
