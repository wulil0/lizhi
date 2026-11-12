// 页面交互：按 <body data-page> 渲染 / 绑定各页内容。模板在 render.js，数据在 data.js。
// 构建后的页面已经预渲染好（容器带 data-ssr），这里只补交互；直接打开源文件时则在浏览器里渲染。
(function () {
  const page = document.body.dataset.page;
  const R = LizhiRender.create({ ALBUMS, PLACES, TIMELINE });
  const { esc, pad2 } = R;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fill = (sel, html) => {
    const el = $(sel);
    if (el && !el.hasAttribute("data-ssr")) el.innerHTML = html;
    return el;
  };
  const byId = (id) => ALBUMS.find((a) => a.id === id);
  const touch = matchMedia("(hover: none)").matches;

  fill("#masthead", R.masthead(page));
  fill("#footer", R.footer());

  // ---------- 进场动画与触屏显色：全站共用两个观察器 ----------
  const revealIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
  }), { threshold: 0.1 });
  // 触屏没有悬停：封面滚到屏幕中间那一段时自动显出原色
  const vividIO = touch ? new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("vivid", e.isIntersecting)), { rootMargin: "-38% 0px -38% 0px" }) : null;
  function observe(root = document) {
    $$(".reveal:not(.in)", root).forEach((el) => revealIO.observe(el));
    if (vividIO) $$(".album:not(.thumb)", root).forEach((el) => vividIO.observe(el));
  }

  // ---------- 专辑详情弹层 ----------
  let sheetList = [], sheetIdx = 0;
  const useHash = page === "albums";
  function openAlbum(a, list) {
    if (!a) return;
    if (list) sheetList = list;
    if (!sheetList.includes(a.id)) sheetList = [a.id];
    sheetIdx = sheetList.indexOf(a.id);
    const dlg = $("#sheet") || createSheet();
    // 播放器启用且曲目清单里有这张专辑时，用清单里的曲目（有序、可播放）
    const P = window.LizhiPlayer;
    const playable = P && P.hasAlbum(a.id) ? P.tracks(a.id) : null;
    const tracks = playable
      ? `<button class="play-all">▶&#xFE0E; 播放整张</button>
         <div class="tl-label">曲目 · ${playable.length}</div>
         <ol class="tracks playable">${playable.map((t) => `<li><button class="trk" data-n="${t.n}"><span class="n">${pad2(t.n)}</span><span class="tt">${esc(t.title)}</span>${t.duration ? `<span class="du">${Math.floor(t.duration / 60)}:${pad2(t.duration % 60)}</span>` : ""}</button></li>`).join("")}</ol>`
      : a.tracks.length
        ? `<div class="tl-label">收录曲目 · ${a.tracks.length} · 按文件整理，非原专辑曲序</div><ul class="tracks">${a.tracks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
        : `<p class="tbd">曲目待补充。</p>`;
    const many = sheetList.length > 1;
    dlg.innerHTML = `
      <div class="sheet-bar">
        <span class="sheet-count">${many ? `${pad2(sheetIdx + 1)} / ${pad2(sheetList.length)}` : ""}</span>
        <span>
          ${many ? `<button class="nav-btn" data-step="-1" aria-label="上一张">←</button><button class="nav-btn" data-step="1" aria-label="下一张">→</button>` : ""}
          <button class="nav-btn close" aria-label="关闭">×</button>
        </span>
      </div>
      <div class="sheet-in">
        <div class="sheet-cover">${R.picture(a, { sizes: "(max-width: 860px) 100vw, 490px", lazy: false })}<span class="stamp">${a.year}</span></div>
        <div class="sheet-body">
          <div class="kicker">${esc(a.type)}${a.count ? " · " + esc(a.count) + " 首" : ""}</div>
          <h2 id="sheet-title" tabindex="-1">${esc(a.title)}</h2>
          ${a.en && a.en !== a.title ? `<div class="t">${esc(a.en)}</div>` : ""}
          ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
          ${tracks}
        </div>
      </div>`;
    $(".close", dlg).onclick = closeSheet;
    $$("[data-step]", dlg).forEach((b) => (b.onclick = () => step(+b.dataset.step)));
    if (playable) {
      $(".play-all", dlg).onclick = () => P.playAlbum(a.id);
      $$(".trk", dlg).forEach((b) => (b.onclick = () => P.playAlbum(a.id, +b.dataset.n)));
    }
    dlg.dataset.album = a.id;
    markPlaying();
    if (useHash) history.replaceState(null, "", "#" + a.id);
    if (!dlg.open) { dlg.showModal(); $("#sheet-title", dlg).focus(); }
    dlg.scrollTop = 0;
    $(".sheet-body", dlg).scrollTop = 0;
  }
  function createSheet() {
    const dlg = document.createElement("dialog");
    dlg.id = "sheet"; dlg.className = "sheet";
    dlg.setAttribute("aria-labelledby", "sheet-title");
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    });
    // 手机上左右滑动翻专辑（竖向滚动不触发）
    let sx = 0, sy = 0;
    dlg.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    dlg.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.body.appendChild(dlg);
    return dlg;
  }
  // 弹层里标出正在播放的那首
  function markPlaying() {
    const c = window.LizhiPlayer && window.LizhiPlayer.current();
    const dlg = $("#sheet");
    if (!dlg) return;
    $$(".trk", dlg).forEach((b) => b.classList.toggle("playing", !!c && dlg.dataset.album === c.albumId && +b.dataset.n === c.n));
  }
  document.addEventListener("lizhi:track", markPlaying);
  // 清单晚于弹层加载完成时，刷新已打开的弹层
  document.addEventListener("lizhi:player-ready", () => {
    const dlg = $("#sheet");
    if (dlg && dlg.open) openAlbum(byId(dlg.dataset.album));
  });
  function closeSheet() {
    const dlg = $("#sheet");
    if (!dlg || !dlg.open || dlg.classList.contains("closing")) return;
    dlg.classList.add("closing");
    setTimeout(() => { dlg.close(); dlg.classList.remove("closing"); }, 170);
    if (useHash && location.hash) history.replaceState(null, "", location.pathname + location.search);
    const back = $(`.album[data-id="${sheetList[sheetIdx]}"]`);
    if (back) back.focus({ preventScroll: true });
  }
  function step(d) {
    if (sheetList.length < 2) return;
    openAlbum(byId(sheetList[(sheetIdx + d + sheetList.length) % sheetList.length]));
    const btn = $(`#sheet [data-step="${d}"]`);
    if (btn) btn.focus();
  }
  // 卡片点击用事件委托，重新渲染后不用重新绑定
  function bindCards(root) {
    root.addEventListener("click", (e) => {
      const el = e.target.closest(".album");
      if (el && root.contains(el)) openAlbum(byId(el.dataset.id), $$(".album", root).map((x) => x.dataset.id));
    });
  }

  // ---------- 首页 ----------
  if (page === "index") {
    const stack = fill("#hero-stack", R.heroStack() + '<span class="stamp">逼哥</span>');
    const caption = $("#hero-caption");
    const top = () => $$(".hs", stack).pop();
    const setCaption = () => { caption.textContent = `《${byId(top().dataset.id).title}》`; };
    setCaption();
    // 入场动画每次会话只播一次（boot.js 读取这个标记）
    try {
      if (!sessionStorage.getItem("lizhi.intro")) {
        stack.classList.add("intro");
        setTimeout(() => stack.classList.remove("intro"), 1400);
        sessionStorage.setItem("lizhi.intro", "1");
      }
    } catch (e) { /* 隐私模式下照常播放 */ }
    // 封面叠放：点一下，最底下那张抽走，换一张当前没露出来的放到最上面
    const pool = ALBUMS.filter((a) => a.type === "录音室专辑").map((a) => a.id);
    let next = pool.indexOf(R.HERO_PICKS[R.HERO_PICKS.length - 1]) + 1;
    stack.addEventListener("click", () => {
      const showing = $$(".hs", stack).map((p) => p.dataset.id);
      let id;
      do { id = pool[next++ % pool.length]; } while (showing.includes(id));
      $(".hs", stack).remove();
      stack.querySelector(".stamp").insertAdjacentHTML("beforebegin", R.heroCover(byId(id)));
      setCaption();
    });
    stack.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stack.click(); } });
    fill("#ticker", R.ticker());
    bindCards(fill("#home-grid", R.homeGrid()));
    $("#n-albums").textContent = ALBUMS.length;
    $("#n-live").textContent = ALBUMS.filter((a) => a.type === "现场专辑").length;
  }

  // ---------- 唱片页 ----------
  if (page === "albums") {
    const start = decodeURIComponent(location.hash.slice(1)) === "live" ? "现场专辑" : "全部";
    const bar = fill("#filters", R.filters(start));
    const grid = fill("#grid", R.albumsGrid(start));
    // 预渲染的是“全部”，从 #live 进来时要换成现场专辑
    if (start !== "全部" && grid.hasAttribute("data-ssr")) {
      grid.innerHTML = R.albumsGrid(start);
      $$("button", bar).forEach((x) => x.setAttribute("aria-pressed", x.dataset.t === start));
    }
    bindCards(grid);
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", bar).forEach((x) => x.setAttribute("aria-pressed", x === b));
      grid.innerHTML = R.albumsGrid(b.dataset.t);
      observe(grid);
    });
    const openFromHash = () => openAlbum(byId(decodeURIComponent(location.hash.slice(1))), $$(".album", grid).map((el) => el.dataset.id));
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  }

  // ---------- 歌里的地方 ----------
  if (page === "places") {
    fill("#map", R.map());
    fill("#chips", R.chips(0));
    fill("#place", R.placeCard(0));
    const show = (i) => {
      $("#place").innerHTML = R.placeCard(i);
      $$(".pin").forEach((g) => g.classList.toggle("on", +g.dataset.i === i));
      $$(".route").forEach((r) => r.classList.toggle("on", +r.dataset.i === i));
      $$("#chips button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.i === i));
    };
    $("#map").addEventListener("click", (e) => { const g = e.target.closest(".pin"); if (g) show(+g.dataset.i); });
    $("#map").addEventListener("keydown", (e) => {
      const g = e.target.closest(".pin");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(+g.dataset.i); }
    });
    $("#chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(+b.dataset.i); });
  }

  // ---------- 年表 ----------
  if (page === "timeline") {
    const tl = fill("#timeline", R.timeline());
    bindCards(tl);
    $$(".tl-row.redact", tl).forEach((r) => {
      const toggle = (e) => { if (!e.target.closest(".album")) r.classList.toggle("open"); };
      r.addEventListener("click", toggle);
      r.addEventListener("keydown", (e) => { if (e.target === r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(e); } });
    });
  }

  observe();
})();
