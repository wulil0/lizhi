// 页面渲染：共用页眉页脚 + 按 <body data-page> 渲染各页内容。数据见 data.js。
(function () {
  const page = document.body.dataset.page;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cover = (a) => `assets/covers/${a.id}.jpg`;

  // ---------- 页眉 / 页脚 ----------
  const NAV = [["index", "首页", "index.html"], ["albums", "唱片", "albums.html"], ["places", "歌里的地方", "places.html"], ["timeline", "年表", "timeline.html"]];
  $("#masthead").innerHTML = `
    <div class="masthead"><div class="wrap">
      <a class="logo" href="index.html">李志<small>LI ZHI · 南京</small></a>
      <nav class="nav">${NAV.map(([k, t, h]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
    </div></div>
    <div class="dateline"><div class="wrap"><span>非官方乐迷站 · 第 ${ALBUMS.length} 张唱片仍在播放</span><span>N 32°03′ E 118°47′</span></div></div>`;
  $("#footer").innerHTML = `
    <div class="wrap">
      <span>非官方乐迷整理，与李志本人及其团队无关。封面版权归原作者所有。</span>
      <span>资料来源：维基百科、乐迷整理的专辑表。发现错误？改 <code>js/data.js</code>。</span>
    </div>`;

  // ---------- 专辑详情弹层 ----------
  // list：可翻页的专辑 id 顺序（当前页面上卡片的顺序）
  let sheetList = [], sheetIdx = 0;
  const useHash = page === "albums";
  function openAlbum(a, list) {
    if (list) sheetList = list;
    if (!sheetList.includes(a.id)) sheetList = [a.id];
    sheetIdx = sheetList.indexOf(a.id);
    let dlg = $("#sheet");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "sheet"; dlg.className = "sheet";
      dlg.setAttribute("aria-labelledby", "sheet-title");
      dlg.addEventListener("click", (e) => { if (e.target === dlg) closeSheet(); });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(); });
      dlg.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
      });

      document.body.appendChild(dlg);
    }
    const tracks = a.tracks.length
      ? `<div class="tl-label">收录曲目 · ${a.tracks.length} · 按文件整理，非原专辑曲序</div><ul class="tracks">${a.tracks.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
      : `<p class="tbd">曲目待补充。</p>`;
    const many = sheetList.length > 1;
    dlg.innerHTML = `
      <div class="sheet-bar">
        <span class="sheet-count">${many ? `${String(sheetIdx + 1).padStart(2, "0")} / ${String(sheetList.length).padStart(2, "0")}` : ""}</span>
        <span>
          ${many ? `<button class="nav-btn" data-step="-1" aria-label="上一张">←</button><button class="nav-btn" data-step="1" aria-label="下一张">→</button>` : ""}
          <button class="nav-btn close" aria-label="关闭">×</button>
        </span>
      </div>
      <div class="sheet-in">
        <div class="sheet-cover"><img src="${cover(a)}" alt="《${esc(a.title)}》封面"><span class="stamp">${a.year}</span></div>
        <div class="sheet-body">
          <div class="kicker">${esc(a.type)}${a.count ? " · " + esc(a.count) + " 首" : ""}</div>
          <h2 id="sheet-title" tabindex="-1">${esc(a.title)}</h2>
          ${a.en && a.en !== a.title ? `<div class="t">${esc(a.en)}</div>` : ""}
          ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}
          ${tracks}
        </div>
      </div>`;
    $(".close", dlg).onclick = closeSheet;
    dlg.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => step(+b.dataset.step)));
    if (useHash) history.replaceState(null, "", "#" + a.id);
    if (!dlg.open) { dlg.showModal(); $("#sheet-title", dlg).focus(); }
    $(".sheet-body", dlg).scrollTop = 0;
  }
  function closeSheet() {
    const dlg = $("#sheet");
    if (!dlg || !dlg.open) return;
    dlg.close();
    if (useHash && location.hash) history.replaceState(null, "", location.pathname + location.search);
    const back = document.querySelector(`.album[data-id="${sheetList[sheetIdx]}"]`);
    if (back) back.focus({ preventScroll: true });
  }
  function step(d) {
    if (sheetList.length < 2) return;
    const id = sheetList[(sheetIdx + d + sheetList.length) % sheetList.length];
    openAlbum(ALBUMS.find((a) => a.id === id));
    const btn = document.querySelector(`#sheet [data-step="${d}"]`);
    if (btn) btn.focus();
  }

  const card = (a) => `
    <button class="album reveal" data-id="${a.id}">
      <div class="cover"><img loading="lazy" src="${cover(a)}" alt="《${esc(a.title)}》封面"><span class="yr">${a.year}</span></div>
      <h3>${esc(a.title)}</h3>
      <div class="t">${esc(a.type)}</div>
    </button>`;

  function bindCards(root) {
    const ids = [...root.querySelectorAll(".album")].map((el) => el.dataset.id);
    root.querySelectorAll(".album").forEach((el) => {
      el.onclick = () => openAlbum(ALBUMS.find((a) => a.id === el.dataset.id), ids);
    });
  }

  // ---------- 首页 ----------
  if (page === "index") {
    const picks = ["2006-shijie", "2005-fangao", "2004-jinji"].map((id) => ALBUMS.find((a) => a.id === id)).filter(Boolean);
    // 封面叠放：点一下，最上面那张抽到最底下，换下一张
    const pool = ["2004-jinji", "2005-fangao", "2006-shijie", "2009-nanjing", "2010-zhengzhou", "2011-f", "2014-1701", "2016-8", "2016-yingtian"];
    const stack = $("#hero-stack");
    let next = 3;
    stack.insertAdjacentHTML("afterbegin", picks.map((a) => `<img src="${cover(a)}" alt="《${esc(a.title)}》封面">`).join(""));
    const caption = $("#hero-caption");
    const setCaption = () => { const top = stack.querySelectorAll("img")[2]; caption.textContent = top.alt.replace("封面", ""); };
    setCaption();
    stack.addEventListener("click", () => {
      const imgs = stack.querySelectorAll("img");
      const id = pool[next++ % pool.length];
      const a = ALBUMS.find((x) => x.id === id);
      imgs[0].remove();
      const img = document.createElement("img");
      img.src = cover(a); img.alt = `《${a.title}》封面`;
      stack.insertBefore(img, stack.querySelector(".stamp"));
      setCaption();
    });
    stack.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stack.click(); } });
    const words = ALBUMS.map((a) => `<a href="albums.html#${a.id}">${esc(a.title)}</a>`);
    $("#ticker").innerHTML = `<div>${[...words, ...words].join("")}</div>`;
    const studio = ALBUMS.filter((a) => a.type === "录音室专辑");
    $("#home-grid").innerHTML = studio.map(card).join("");
    bindCards($("#home-grid"));
    $("#n-albums").textContent = ALBUMS.length;
    $("#n-live").textContent = ALBUMS.filter((a) => a.type === "现场专辑").length;
  }

  // ---------- 唱片页 ----------
  if (page === "albums") {
    const order = ["录音室专辑", "现场专辑", "精选集", "电影配乐单曲"];
    const types = ["全部", ...order.filter((t) => ALBUMS.some((a) => a.type === t))];
    const grid = $("#grid");
    const byYear = (list) => [...list].sort((a, b) => a.year - b.year);
    const render = (t) => {
      const groups = t === "全部" ? order : [t];
      grid.innerHTML = groups.map((g) => {
        const list = byYear(ALBUMS.filter((a) => a.type === g));
        if (!list.length) return "";
        return `<div class="group-head"><h2>${g}</h2><span>${list.length} 张 · ${list[0].year}${list.length > 1 ? "—" + list[list.length - 1].year : ""}</span></div>` + list.map(card).join("");
      }).join("");
      bindCards(grid); observe();
    };
    $("#filters").innerHTML = types.map((t, i) => `<button aria-pressed="${i === 0}" data-t="${t}">${t}<small>${t === "全部" ? ALBUMS.length : ALBUMS.filter((a) => a.type === t).length}</small></button>`).join("");
    $("#filters").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $("#filters").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      render(b.dataset.t);
    };
    const hash = decodeURIComponent(location.hash.slice(1));
    const start = hash === "live" ? "现场专辑" : "全部";
    $("#filters").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.t === start));
    render(start);
    const openFromHash = () => {
      const hit = ALBUMS.find((a) => a.id === decodeURIComponent(location.hash.slice(1)));
      if (hit) openAlbum(hit, [...grid.querySelectorAll(".album")].map((el) => el.dataset.id));
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  }

  // ---------- 歌里的地方 ----------
  if (page === "places") {
    const W = 800, H = 640, box = { lng: [84, 124], lat: [27, 50] };
    const x = (lng) => ((lng - box.lng[0]) / (box.lng[1] - box.lng[0])) * W;
    const y = (lat) => H - ((lat - box.lat[0]) / (box.lat[1] - box.lat[0])) * H;
    // 华东放大插图：南京、金坛、杭州、义乌挤在一起，单独放大
    const zoom = { lng: [117.4, 121.4], lat: [28.8, 32.8] }, ib = { x: 40, y: 340, w: 280, h: 280 };
    const inZoom = (p) => p.lng > zoom.lng[0] && p.lng < zoom.lng[1] && p.lat > zoom.lat[0] && p.lat < zoom.lat[1];
    const zx = (lng) => ib.x + ((lng - zoom.lng[0]) / (zoom.lng[1] - zoom.lng[0])) * ib.w;
    const zy = (lat) => ib.y + ib.h - ((lat - zoom.lat[0]) / (zoom.lat[1] - zoom.lat[0])) * ib.h;
    const home = PLACES[0];
    const routes = PLACES.slice(1).filter((p) => !inZoom(p)).map((p) => {
      const x1 = x(home.lng), y1 = y(home.lat), x2 = x(p.lng), y2 = y(p.lat);
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 40;
      return `<path class="route" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}"/>`;
    }).join("");
    const pin = (p, i, px, py, label, left) => `<g class="pin${i === 0 ? " home" : ""}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(p.city)}">
        <circle class="hit" cx="${px}" cy="${py}" r="16"/>
        <circle class="dot" cx="${px}" cy="${py}" r="${i === 0 ? 7 : 5}"/>
        ${label ? `<text x="${px + (left ? -12 : 12)}" y="${py + 5}" text-anchor="${left ? "end" : "start"}">${esc(p.city)}</text>` : ""}</g>`;
    const pins = PLACES.map((p, i) => inZoom(p)
      ? `<circle class="mini" cx="${x(p.lng)}" cy="${y(p.lat)}" r="3"/>`
      : pin(p, i, x(p.lng), y(p.lat), true, p.side ? p.side === "l" : p.lng > 120)).join("");
    const zr = { x: x(zoom.lng[0]), y: y(zoom.lat[1]), w: x(zoom.lng[1]) - x(zoom.lng[0]), h: y(zoom.lat[0]) - y(zoom.lat[1]) };
    const inset = `
      <rect class="zoom-box" x="${zr.x}" y="${zr.y}" width="${zr.w}" height="${zr.h}"/>
      <path class="zoom-link" d="M${zr.x},${zr.y + zr.h} L${ib.x + ib.w},${ib.y + ib.h}"/>
      <rect class="inset" x="${ib.x}" y="${ib.y}" width="${ib.w}" height="${ib.h}"/>
      <text class="inset-label" x="${ib.x + ib.w - 10}" y="${ib.y + ib.h - 12}" text-anchor="end">华东 · 放大</text>
      ${PLACES.filter((p, i) => i > 0 && inZoom(p)).map((p) => `<path class="route" d="M${zx(home.lng)},${zy(home.lat)} L${zx(p.lng)},${zy(p.lat)}"/>`).join("")}
      ${PLACES.filter(inZoom).map((p) => pin(p, PLACES.indexOf(p), zx(p.lng), zy(p.lat), true, p.side ? p.side === "l" : false)).join("")}`;
    $("#map").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="李志歌中出现的地点">${routes}${inset}${pins}</svg>
      <div class="legend">示意图 · 经纬度等距投影 · 虚线自南京出发</div>`;
    $("#map").insertAdjacentHTML("afterend", `<div class="chips">${PLACES.map((p, i) => `<button data-i="${i}">${esc(p.city)}</button>`).join("")}</div>`);
    const show = (i) => {
      const p = PLACES[i];
      $("#place").innerHTML = `<div class="kicker">${p.lat.toFixed(2)}°N · ${p.lng.toFixed(2)}°E</div>
        <h2>${esc(p.city)}</h2>${p.text ? `<p>${esc(p.text)}</p>` : ""}
        <ul>${p.items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
      document.querySelectorAll(".pin").forEach((g) => g.classList.toggle("on", +g.dataset.i === i));
      document.querySelectorAll(".chips button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.i === i));
    };
    document.querySelectorAll(".pin").forEach((g) => {
      const i = +g.dataset.i;
      g.addEventListener("click", () => show(i));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(i); } });
    });
    document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => show(+b.dataset.i)));
    show(0);
  }

  // ---------- 年表 ----------
  if (page === "timeline") {
    $("#timeline").innerHTML = TIMELINE.map((t) => `
      <div class="tl-row reveal${t.redact ? " redact" : ""}">
        <div class="y">${esc(t.year)}</div>
        <div><p>${t.redact ? `<span>${esc(t.text)}</span>` : esc(t.text)}</p>${t.redact ? `<div class="hint">（指上来或点一下）</div>` : ""}</div>
        <div class="tl-covers">${ALBUMS.filter((a) => String(a.year) === t.year).map((a) => `<button class="album thumb" data-id="${a.id}" title="${esc(a.title)}"><img loading="lazy" src="${cover(a)}" alt="《${esc(a.title)}》封面"></button>`).join("")}</div>
      </div>`).join("");
    bindCards($("#timeline"));
    document.querySelectorAll(".tl-row.redact").forEach((r) => {
      r.tabIndex = 0;
      r.addEventListener("click", () => r.classList.toggle("open"));
    });
  }

  // ---------- 进场动画 ----------
  function observe() {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.1 });
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
  }
  observe();
})();
