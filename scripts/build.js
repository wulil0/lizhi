// 构建：把站点生成到 dist/，部署的是 dist/。不需要安装任何依赖（只用 Node 自带模块）。
// 用法：node scripts/build.js
//
// 做的事：
// 1. 预渲染：用浏览器里同一份模板（js/render.js）把页眉、唱片墙、地图、年表等直接写进 HTML，
//    容器加上 data-ssr，main.js 看到它就只绑定交互、不再重新渲染。没开 JS 和搜索引擎也能看到完整内容。
// 2. 版本号：CSS、JS、字体的地址加上 ?v=<内容哈希>，服务器可以让它们长期缓存，改了内容地址就变。
// 3. 生成 sitemap.xml、robots.txt，预渲染 404.html。
// 4. 检查页面上的字是否都在字体子集（fonts/chars.txt）里，缺字时提示重跑 scripts/subset-font.mjs。
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");
const SITE = "https://lizhi.wulill.bond/";
const PAGES = ["index.html", "albums.html", "places.html", "timeline.html", "404.html"];
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);

// data.js 里是顶层 const，不会挂到全局对象上，所以在末尾补一个表达式把它们取出来
const D = vm.runInNewContext(read("js/data.js") + "\n;({ ALBUMS, PLACES, TIMELINE });", {});
const R = require(path.join(ROOT, "js/render.js")).create(D);

// ---------- 复制静态文件 ----------
fs.rmSync(OUT, { recursive: true, force: true });
const copy = (rel, filter = () => true) => fs.cpSync(path.join(ROOT, rel), path.join(OUT, rel), {
  recursive: true,
  filter: (src) => !path.basename(src).startsWith(".") && filter(src),
});
copy("assets");
copy("fonts", (src) => !src.endsWith("chars.txt"));
copy("js");

// ---------- 带版本号的地址 ----------
const versioned = {};
for (const f of fs.readdirSync(path.join(ROOT, "fonts")).filter((f) => f.endsWith(".woff2"))) {
  versioned[`fonts/${f}`] = `fonts/${f}?v=${hash(fs.readFileSync(path.join(ROOT, "fonts", f)))}`;
}
let css = read("css/style.css").replace(/url\("\.\.\/(fonts\/[^"?]+)"\)/g, (m, f) => `url("../${versioned[f] || f}")`);
fs.mkdirSync(path.join(OUT, "css"));
fs.writeFileSync(path.join(OUT, "css/style.css"), css);
versioned["css/style.css"] = `css/style.css?v=${hash(css)}`;
for (const f of fs.readdirSync(path.join(ROOT, "js"))) versioned[`js/${f}`] = `js/${f}?v=${hash(read(`js/${f}`))}`;

// ---------- 预渲染 ----------
const COMMON = { masthead: (page) => R.masthead(page), footer: () => R.footer() };
const BY_PAGE = {
  index: {
    "hero-stack": () => R.heroStack() + '<span class="stamp">逼哥</span>',
    "hero-caption": () => `《${R.byId(R.HERO_PICKS[R.HERO_PICKS.length - 1]).title}》`,
    ticker: () => R.ticker(),
    "home-grid": () => R.homeGrid(),
    "n-albums": () => String(D.ALBUMS.length),
    "n-live": () => String(D.ALBUMS.filter((a) => a.type === "现场专辑").length),
  },
  albums: { filters: () => R.filters(), grid: () => R.albumsGrid() },
  places: { map: () => R.map(), chips: () => R.chips(0), place: () => R.placeCard(0) },
  timeline: { timeline: () => R.timeline() },
};

const pageText = [];
for (const file of PAGES) {
  let html = read(file);
  const page = html.match(/<body data-page="([^"]+)"/)[1];
  const fills = { ...COMMON, ...(BY_PAGE[page] || {}) };
  for (const [id, render] of Object.entries(fills)) {
    // 只替换空容器（或者只有占位符“—”的），并标上 data-ssr
    const re = new RegExp(`<(\\w+)([^>]*\\bid="${id}"[^>]*)>(—|\\s*)</\\1>`);
    if (!re.test(html)) throw new Error(`${file}：找不到空容器 #${id}`);
    html = html.replace(re, (m, tag, attrs) => `<${tag}${attrs} data-ssr>${render(page)}</${tag}>`);
  }
  html = html.replace(/(href|src)="((?:css|js|fonts)\/[^"?]+)"/g, (m, attr, url) => `${attr}="${versioned[url] || url}"`);
  fs.writeFileSync(path.join(OUT, file), html);
  pageText.push(html);
}

// ---------- sitemap / robots ----------
const today = new Date().toISOString().slice(0, 10);
const urls = PAGES.filter((f) => f !== "404.html").map((f) => `  <url><loc>${SITE}${f === "index.html" ? "" : f}</loc><lastmod>${today}</lastmod></url>`);
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);

// ---------- 缺字检查 ----------
// 页面上的字 + 数据里的字（弹层简介、曲目在运行时才显示），去掉标签后检查
const have = new Set(fs.readFileSync(path.join(ROOT, "fonts/chars.txt"), "utf8"));
const text = pageText.join("").replace(/<[^>]+>/g, "") + JSON.stringify(D) + read("js/main.js") + read("js/player.js");
const ICONS = new Set("⏮⏭▶❚♪✕←→×︎️");
const missing = [...new Set(text)].filter((c) => c.codePointAt(0) > 127 && !/\s/.test(c) && !ICONS.has(c) && !have.has(c));
if (missing.length) console.warn(`⚠ 字体子集缺 ${missing.length} 个字：${missing.join("")}\n  请运行 node scripts/subset-font.mjs 重新生成字体。`);

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`✓ 已生成 dist/（${PAGES.length} 个页面，${(size(OUT) / 1048576).toFixed(1)} MB）`);
