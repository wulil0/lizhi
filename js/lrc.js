// LRC 歌词解析。浏览器里挂在 window.LizhiLRC，Node 里可 require（供 tests/lrc.test.js 使用）。
(function (root) {
  // 支持 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx]、[mm:ss:xx]、一行多个时间标签、[offset:±毫秒]。
  // 忽略 [ti:] [ar:] 等信息标签。返回按时间排序的 [{ t: 秒, text }]。
  function parseLRC(text) {
    let offset = 0;
    const out = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const off = raw.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/i);
      if (off) { offset = +off[1] / 1000; continue; }
      const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
      if (!tags.length) continue;
      const line = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const m of tags) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(":", ".")), text: line });
    }
    // LRC 规范：offset 为正表示歌词整体提前显示
    return out.map((l) => ({ t: Math.max(0, +(l.t - offset).toFixed(3)), text: l.text })).sort((a, b) => a.t - b.t);
  }

  // 当前时间对应的歌词行下标：最后一个 t <= time 的行；还没到第一行时返回 -1
  function lineAt(lines, time) {
    let lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t <= time + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  const api = { parseLRC, lineAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LizhiLRC = api;
})(this);
