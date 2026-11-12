// 生成站内用到的字的思源宋体（Noto Serif SC，SIL OFL 1.1）子集，存到 fonts/，网站运行时不依赖 Google。
// 用法：node scripts/subset-font.mjs
// 什么时候要重跑：改了页面文字、data.js 等，出现了新的汉字时（build.js 会检查并提示缺字）。
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  ...readdirSync(root).filter((f) => f.endsWith(".html")),
  "js/data.js", "js/render.js", "js/main.js", "js/player.js", "js/search.js",
];
const WEIGHTS = [400, 900];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// 收集字符：所有非 ASCII 字符 + 全部可打印 ASCII
const chars = new Set();
for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
for (const f of SOURCES) for (const ch of readFileSync(join(root, f), "utf8")) if (ch.codePointAt(0) > 127 && !/\s/.test(ch)) chars.add(ch);
// 排除不该用宋体渲染的符号（播放控件图标、变体选择符）
for (const ch of "⏮⏭▶❚♪✕←→×︎️") chars.delete(ch);
const text = [...chars].sort().join("");

mkdirSync(join(root, "fonts"), { recursive: true });
const files = {};
for (const w of WEIGHTS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@${w}&display=swap&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": UA } })).text();
  const m = css.match(/url\((https:[^)]+)\)\s*format\('woff2'\)/);
  if (!m) throw new Error(`没拿到 ${w} 字重的 woff2：\n${css.slice(0, 300)}`);
  const buf = Buffer.from(await (await fetch(m[1], { headers: { "User-Agent": UA } })).arrayBuffer());
  const name = `noto-serif-sc-${w}.woff2`;
  writeFileSync(join(root, "fonts", name), buf);
  files[w] = { name, bytes: buf.length, sha1: createHash("sha1").update(buf).digest("hex").slice(0, 8) };
  console.log(`✓ ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
}
writeFileSync(join(root, "fonts", "chars.txt"), text);
console.log(`共 ${chars.size} 个字符，已写入 fonts/chars.txt`);
