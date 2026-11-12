// 页面模板：纯函数，输入数据、输出 HTML 字符串。
// 浏览器里由 main.js 调用（window.LizhiRender），构建时由 scripts/build.js 在 Node 里调用来预渲染静态 HTML，
// 两边用同一份模板，保证预渲染结果和浏览器渲染完全一致。
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad2 = (n) => String(n).padStart(2, "0");
  const TYPE_ORDER = ["录音室专辑", "现场专辑", "精选集", "电影配乐单曲"];

  // 响应式封面：AVIF → WebP → JPG。sizes 按使用场景传入。
  function picture(a, { sizes, cls = "", lazy = true, alt } = {}) {
    const set = (fmt) => `assets/covers/400/${a.id}.${fmt} 400w, assets/covers/800/${a.id}.${fmt} 800w`;
    return `<picture${cls ? ` class="${cls}"` : ""}><source type="image/avif" srcset="${set("avif")}" sizes="${sizes}"><source type="image/webp" srcset="${set("webp")}" sizes="${sizes}"><img src="assets/covers/${a.id}.jpg" width="800" height="800"${lazy ? ' loading="lazy"' : ""} decoding="async" alt="${esc(alt === undefined ? `《${a.title}》封面` : alt)}"></picture>`;
  }

  function create(D) {
    const { ALBUMS, PLACES, TIMELINE } = D;
    const byId = (id) => ALBUMS.find((a) => a.id === id);
    const byYear = (list) => [...list].sort((a, b) => a.year - b.year);

    const NAV = [["index", "首页", "index.html"], ["albums", "唱片", "albums.html"], ["places", "歌里的地方", "places.html"], ["timeline", "年表", "timeline.html"]];
    const masthead = (page) => `
    <div class="masthead"><div class="wrap">
      <a class="logo" href="index.html">李志<small>LI ZHI · 南京</small></a>
      <nav class="nav" aria-label="主导航">${NAV.map(([k, t, h]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
    </div></div>
    <div class="dateline"><div class="wrap"><span>非官方乐迷站 · 第 ${ALBUMS.length} 张唱片仍在播放</span><span>N 32°03′ E 118°47′</span></div></div>
    <div class="searchbar"><div class="wrap">
      <div class="search-box">
        <span class="kicker">搜歌</span>
        <input id="search-input" type="search" placeholder="歌名，或者一句歌词…" aria-label="搜索歌曲或歌词" autocomplete="off" spellcheck="false" enterkeyhint="search">
        <button id="search-clear" class="search-clear" aria-label="清空搜索" hidden>×</button>
      </div>
      <div id="search-results" class="search-results" hidden></div>
    </div></div>`;

    const footer = () => `
    <div class="wrap">
      <span>非官方乐迷整理，与李志本人及其团队无关。封面版权归原作者所有。</span>
      <span>资料来源：维基百科、乐迷整理的专辑表。字体：思源宋体（SIL OFL 1.1）。</span>
    </div>`;

    // 专辑卡片。i：在所在列表中的序号，用来错开出现时间；sizes：封面显示宽度
    const card = (a, i = 0, sizes = "(max-width: 860px) 46vw, 230px") => `
    <button class="album reveal" data-id="${a.id}" style="--d:${(i % 10) * 45}ms" aria-label="${esc(`《${a.title}》${a.year} ${a.type}`)}">
      <span class="cover">${picture(a, { sizes, alt: "" })}<span class="yr">${a.year}</span></span>
      <span class="album-title">${esc(a.title)}</span>
      <span class="t">${esc(a.type)}</span>
    </button>`;

    // 首页
    const HERO_PICKS = ["2006-shijie", "2005-fangao", "2004-jinji"];
    const heroCover = (a) => picture(a, { sizes: "(max-width: 860px) 72vw, 380px", cls: "hs", lazy: false }).replace('<picture class="hs">', `<picture class="hs" data-id="${a.id}">`);
    const heroStack = () => HERO_PICKS.map((id) => heroCover(byId(id))).join("");
    const studio = () => ALBUMS.filter((a) => a.type === "录音室专辑");
    const homeGrid = () => studio().map((a, i) => card(a, i, "(max-width: 860px) 46vw, 260px")).join("");
    // 跑马灯是装饰：整体 aria-hidden，链接不进入 Tab 顺序
    const ticker = () => {
      const words = ALBUMS.map((a) => `<a href="albums.html#${a.id}" tabindex="-1">${esc(a.title)}</a>`);
      return `<div>${[...words, ...words].join("")}</div>`;
    };

    // 唱片页
    const typesPresent = () => TYPE_ORDER.filter((t) => ALBUMS.some((a) => a.type === t));
    const filters = (start = "全部") => ["全部", ...typesPresent()].map((t) => `<button aria-pressed="${t === start}" data-t="${t}">${t}<small>${t === "全部" ? ALBUMS.length : ALBUMS.filter((a) => a.type === t).length}</small></button>`).join("");
    const albumsGrid = (t = "全部") => (t === "全部" ? TYPE_ORDER : [t]).map((g) => {
      const list = byYear(ALBUMS.filter((a) => a.type === g));
      if (!list.length) return "";
      return `<div class="group-head"><h2>${g}</h2><span>${list.length} 张 · ${list[0].year}${list.length > 1 ? "—" + list[list.length - 1].year : ""}</span></div>` + list.map((a, i) => card(a, i)).join("");
    }).join("");

    // 歌里的地方
    function map() {
      const W = 800, H = 640, box = { lng: [84, 124], lat: [27, 50] };
      const x = (lng) => +(((lng - box.lng[0]) / (box.lng[1] - box.lng[0])) * W).toFixed(1);
      const y = (lat) => +(H - ((lat - box.lat[0]) / (box.lat[1] - box.lat[0])) * H).toFixed(1);
      // 华东放大插图：南京、金坛、杭州、义乌挤在一起，单独放大
      const zoom = { lng: [117.4, 121.4], lat: [28.8, 32.8] }, ib = { x: 40, y: 340, w: 280, h: 280 };
      const inZoom = (p) => p.lng > zoom.lng[0] && p.lng < zoom.lng[1] && p.lat > zoom.lat[0] && p.lat < zoom.lat[1];
      const zx = (lng) => +(ib.x + ((lng - zoom.lng[0]) / (zoom.lng[1] - zoom.lng[0])) * ib.w).toFixed(1);
      const zy = (lat) => +(ib.y + ib.h - ((lat - zoom.lat[0]) / (zoom.lat[1] - zoom.lat[0])) * ib.h).toFixed(1);
      const home = PLACES[0];
      let k = 0;
      // 路线：可见的虚线被一条逐渐描出的遮罩路径“画”出来
      const route = (i, d) => `<mask id="rm${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path class="draw" d="${d}" pathLength="1" style="--d:${200 + k++ * 90}ms"/></mask><path class="route" data-i="${i}" d="${d}" mask="url(#rm${i})"/>`;
      const routes = PLACES.map((p, i) => [p, i]).filter(([p, i]) => i > 0 && !inZoom(p)).map(([p, i]) => {
        const x1 = x(home.lng), y1 = y(home.lat), x2 = x(p.lng), y2 = y(p.lat);
        return route(i, `M${x1},${y1} Q${+((x1 + x2) / 2).toFixed(1)},${Math.min(y1, y2) - 40} ${x2},${y2}`);
      }).join("");
      const pin = (p, i, px, py, left) => `<g class="pin${i === 0 ? " home on" : ""}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(p.city)}" style="--d:${i === 0 ? 0 : 300 + i * 70}ms">
        <circle class="hit" cx="${px}" cy="${py}" r="18"/>
        <circle class="dot" cx="${px}" cy="${py}" r="${i === 0 ? 7 : 5}"/>
        <text x="${px + (left ? -12 : 12)}" y="${py + 5}" text-anchor="${left ? "end" : "start"}">${esc(p.city)}</text></g>`;
      const pins = PLACES.map((p, i) => (inZoom(p)
        ? `<circle class="mini" cx="${x(p.lng)}" cy="${y(p.lat)}" r="3"/>`
        : pin(p, i, x(p.lng), y(p.lat), p.side ? p.side === "l" : p.lng > 120))).join("");
      const zr = { x: x(zoom.lng[0]), y: y(zoom.lat[1]), w: +(x(zoom.lng[1]) - x(zoom.lng[0])).toFixed(1), h: +(y(zoom.lat[0]) - y(zoom.lat[1])).toFixed(1) };
      const inset = `
      <rect class="zoom-box" x="${zr.x}" y="${zr.y}" width="${zr.w}" height="${zr.h}"/>
      <path class="zoom-link" d="M${zr.x},${+(zr.y + zr.h).toFixed(1)} L${ib.x + ib.w},${ib.y + ib.h}"/>
      <rect class="inset" x="${ib.x}" y="${ib.y}" width="${ib.w}" height="${ib.h}"/>
      <text class="inset-label" x="${ib.x + ib.w - 10}" y="${ib.y + ib.h - 12}" text-anchor="end">华东 · 放大</text>
      ${PLACES.map((p, i) => [p, i]).filter(([p, i]) => i > 0 && inZoom(p)).map(([p, i]) => route(i, `M${zx(home.lng)},${zy(home.lat)} L${zx(p.lng)},${zy(p.lat)}`)).join("")}
      ${PLACES.filter(inZoom).map((p) => pin(p, PLACES.indexOf(p), zx(p.lng), zy(p.lat), p.side ? p.side === "l" : false)).join("")}`;
      return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="李志歌中出现的地点">${routes}${inset}${pins}</svg>
      <div class="legend">示意图 · 经纬度等距投影 · 虚线自南京出发</div>`;
    }
    const chips = (on = 0) => PLACES.map((p, i) => `<button data-i="${i}" aria-pressed="${i === on}">${esc(p.city)}</button>`).join("");
    const placeCard = (i) => {
      const p = PLACES[i];
      return `<div class="kicker">${p.lat.toFixed(2)}°N · ${p.lng.toFixed(2)}°E</div>
        <h2>${esc(p.city)}</h2>${p.text ? `<p>${esc(p.text)}</p>` : ""}
        <ul>${p.items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
    };

    // 年表
    const timeline = () => TIMELINE.map((t) => `
      <div class="tl-row reveal${t.redact ? " redact" : ""}"${t.redact ? ' tabindex="0" role="button" aria-label="展开被遮住的一条"' : ""}>
        <div class="y">${esc(t.year)}</div>
        <div><p>${t.redact ? `<span>${esc(t.text)}</span>` : esc(t.text)}</p>${t.redact ? `<div class="hint">（指上来或点一下）</div>` : ""}</div>
        <div class="tl-covers">${ALBUMS.filter((a) => String(a.year) === t.year).map((a) => `<button class="album thumb" data-id="${a.id}" title="${esc(a.title)}" aria-label="${esc(`《${a.title}》`)}">${picture(a, { sizes: "64px", alt: "" })}</button>`).join("")}</div>
      </div>`).join("");

    return { esc, pad2, picture, byId, masthead, footer, card, heroCover, heroStack, homeGrid, ticker, filters, albumsGrid, map, chips, placeCard, timeline, TYPE_ORDER, HERO_PICKS };
  }

  const api = { create, esc, picture };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LizhiRender = api;
})(this);
