// 播放器：对象存储音源 + LRC 歌词 + 播放条界面。配置见 config.js，接口文档见 docs/player.md。
// 对外暴露 window.LizhiPlayer；准备就绪后在 document 上派发 "lizhi:player-ready"，
// 切换曲目时派发 "lizhi:track"（detail: { albumId, n }）。
(function () {
  const CFG = window.LIZHI_PLAYER || {};
  if (!CFG.enabled || !CFG.baseUrl) return;

  const MIME = { flac: "audio/flac", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg; codecs=opus", wav: "audio/wav" };
  const STATE_KEY = "lizhi.player.state";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtTime = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");

  // ======================= 音源：对象存储 =======================
  // 任何音源只要实现这三个方法就能替换（例如换成自建接口）。
  const source = {
    // 对象路径 → 可访问的地址
    async url(key) {
      if (/^https?:\/\//.test(key)) return key;
      if (typeof CFG.sign === "function") return CFG.sign(key);
      return CFG.baseUrl + key.split("/").map(encodeURIComponent).join("/");
    },
    async json(key) {
      const r = await fetch(await this.url(key), { cache: "no-cache" });
      if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
      return r.json();
    },
    async text(key) {
      const r = await fetch(await this.url(key));
      if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
      return r.text();
    },
  };

  const { parseLRC, lineAt } = window.LizhiLRC;

  // ======================= 播放核心 =======================
  let manifest = null;
  let queue = [];        // [{ albumId, track }]
  let idx = -1;
  let lyrics = [];       // 当前曲目的歌词
  let lyricIdx = -1;
  let tried = [];        // 当前曲目已尝试失败的格式
  let pendingSeek = 0;
  const audio = new Audio();
  audio.preload = "metadata";

  const album = (id) => (typeof ALBUMS !== "undefined" ? ALBUMS : []).find((a) => a.id === id) || { id, title: id };
  const cur = () => queue[idx];

  // 选出浏览器能播、且没失败过的格式
  function pickFormat(audioField) {
    const files = typeof audioField === "string" ? { [audioField.split(".").pop().toLowerCase()]: audioField } : audioField || {};
    const order = [...(CFG.prefer || []), ...Object.keys(files)];
    for (const f of order) {
      if (!files[f] || tried.includes(f)) continue;
      if (!MIME[f] || audio.canPlayType(MIME[f])) return { fmt: f, key: files[f] };
    }
    return null;
  }

  async function load(i, { autoplay = true, at = 0 } = {}) {
    if (!queue[i]) return;
    idx = i; tried = []; lyrics = []; lyricIdx = -1; pendingSeek = at;
    const { albumId, track } = cur();
    ui.show(); ui.setTrack(album(albumId), track); ui.setLyrics(null);
    await loadAudio(autoplay);
    document.dispatchEvent(new CustomEvent("lizhi:track", { detail: { albumId, n: track.n } }));
    mediaSession();
    saveState();
    if (track.lyrics) {
      source.text(track.lyrics)
        .then((t) => { if (cur() && cur().track === track) { lyrics = parseLRC(t); ui.setLyrics(lyrics); } })
        .catch((e) => { console.warn("[player] 歌词加载失败", e); ui.setLyrics([]); });
    } else ui.setLyrics([]);
  }

  async function loadAudio(autoplay) {
    const pick = pickFormat(cur().track.audio);
    if (!pick) { ui.error("这首歌没有当前浏览器能播放的格式"); return; }
    ui.setFormat(pick.fmt);
    audio.dataset.fmt = pick.fmt;
    audio.src = await source.url(pick.key);
    if (autoplay) audio.play().catch(() => ui.setPlaying(false));
  }

  audio.addEventListener("loadedmetadata", () => {
    if (pendingSeek) { audio.currentTime = Math.min(pendingSeek, audio.duration || pendingSeek); pendingSeek = 0; }
    ui.setTime(audio.currentTime, audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    ui.setTime(audio.currentTime, audio.duration);
    const li = lineAt(lyrics, audio.currentTime);
    if (li !== lyricIdx) { lyricIdx = li; ui.setLyricLine(li); }
    if (Math.floor(audio.currentTime) % 5 === 0) saveState();
  });
  audio.addEventListener("play", () => ui.setPlaying(true));
  audio.addEventListener("pause", () => { ui.setPlaying(false); saveState(); });
  audio.addEventListener("ended", () => { if (idx < queue.length - 1) load(idx + 1); else ui.setPlaying(false); });
  audio.addEventListener("error", () => {
    if (!cur()) return;
    // 当前格式失败（例如 FLAC 解码不了、文件缺失），换下一个格式重试
    tried.push(audio.dataset.fmt);
    if (pickFormat(cur().track.audio)) { console.warn(`[player] ${audio.dataset.fmt} 加载失败，改用其他格式`); loadAudio(true); }
    else ui.error("音频加载失败");
  });

  function saveState() {
    const c = cur();
    if (!c) return;
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ albumId: c.albumId, n: c.track.n, time: audio.currentTime || 0 })); } catch (e) { /* 隐私模式等情况下不保存 */ }
  }

  function mediaSession() {
    if (!("mediaSession" in navigator) || !cur()) return;
    const a = album(cur().albumId);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cur().track.title, artist: "李志", album: a.title,
      artwork: [{ src: new URL(`assets/covers/${a.id}.jpg`, location.href).href, sizes: "800x800", type: "image/jpeg" }],
    });
  }
  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("previoustrack", () => api.prev());
    ms.setActionHandler("nexttrack", () => api.next());
    try { ms.setActionHandler("seekto", (d) => { audio.currentTime = d.seekTime; }); } catch (e) { /* 旧浏览器不支持 seekto */ }
  }

  // ======================= 界面：播放条 + 歌词面板 =======================
  const ui = (function () {
    const root = document.createElement("div");
    root.className = "player"; root.hidden = true;
    root.setAttribute("role", "region"); root.setAttribute("aria-label", "播放器");
    root.innerHTML = `
      <section class="lyrics-panel" hidden aria-label="歌词"><div class="lp-head"><span class="kicker">歌词</span><span class="lp-title"></span></div><ol class="lp-lines"></ol></section>
      <div class="player-bar">
        <img class="p-cover" alt="">
        <div class="p-meta"><div class="p-title"></div><div class="p-sub"><span class="p-album"></span><span class="p-fmt"></span></div></div>
        <div class="p-ctrl">
          <button class="p-btn" data-act="prev" aria-label="上一首">⏮&#xFE0E;</button>
          <button class="p-btn p-play" data-act="toggle" aria-label="播放">▶&#xFE0E;</button>
          <button class="p-btn" data-act="next" aria-label="下一首">⏭&#xFE0E;</button>
        </div>
        <div class="p-progress"><span class="p-time">0:00</span><input class="p-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="播放进度"><span class="p-dur">0:00</span></div>
        <button class="p-btn p-lyr" data-act="lyrics" aria-pressed="false" aria-label="歌词">词</button>
        <button class="p-btn p-x" data-act="close" aria-label="关闭播放器">×</button>
      </div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const seek = $(".p-seek"), panel = $(".lyrics-panel"), lines = $(".lp-lines");
    let dragging = false;

    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b) ({ prev: api.prev, next: api.next, toggle: api.toggle, lyrics: toggleLyrics, close: api.stop })[b.dataset.act]();
      const li = e.target.closest(".lp-lines li[data-t]");
      if (li) { audio.currentTime = +li.dataset.t; if (audio.paused) audio.play(); }
    });
    seek.addEventListener("input", () => { dragging = true; $(".p-time").textContent = fmtTime((seek.value / 1000) * (audio.duration || 0)); });
    seek.addEventListener("change", () => { dragging = false; if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; });

    function toggleLyrics(force) {
      const open = typeof force === "boolean" ? force : panel.hidden;
      panel.hidden = !open;
      $(".p-lyr").setAttribute("aria-pressed", open);
      if (open) setLyricLine(lyricIdx, true);
    }
    function setLyricLine(i, instant) {
      lines.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
      const el = lines.children[i];
      if (!el) return;
      el.classList.add("on");
      if (!panel.hidden) lines.scrollTo({ top: el.offsetTop - lines.clientHeight / 2 + el.clientHeight / 2, behavior: instant ? "auto" : "smooth" });
    }
    return {
      show() { if (root.hidden) { root.hidden = false; document.body.classList.add("has-player"); } },
      hide() { root.hidden = true; document.body.classList.remove("has-player"); toggleLyrics(false); },
      setTrack(a, t) {
        $(".p-cover").src = `assets/covers/${a.id}.jpg`;
        $(".p-title").textContent = t.title;
        $(".p-album").textContent = `《${a.title}》`;
        $(".lp-title").textContent = t.title;
        $(".p-sub").classList.remove("err");
        root.classList.remove("swap"); void root.offsetWidth; root.classList.add("swap");
      },
      setFormat(f) { $(".p-fmt").textContent = f.toUpperCase(); $(".p-fmt").classList.toggle("lossless", f === "flac" || f === "wav"); },
      setPlaying(on) { const b = $(".p-play"); b.innerHTML = on ? "❚❚" : "▶&#xFE0E;"; b.setAttribute("aria-label", on ? "暂停" : "播放"); root.classList.toggle("playing", on); },
      setTime(t, d) {
        if (!dragging) { seek.value = d ? Math.round((t / d) * 1000) : 0; $(".p-time").textContent = fmtTime(t); }
        $(".p-dur").textContent = fmtTime(d);
        seek.style.setProperty("--p", `${d ? (t / d) * 100 : 0}%`);
      },
      setLyrics(ls) {
        if (ls === null) { lines.innerHTML = `<li class="lp-empty">歌词加载中……</li>`; return; }
        lines.innerHTML = ls.length
          ? ls.map((l) => (l.text ? `<li data-t="${l.t}">${esc(l.text)}</li>` : `<li data-t="${l.t}" class="gap">· · ·</li>`)).join("")
          : `<li class="lp-empty">这首没有歌词文件。</li>`;
        lines.scrollTop = 0;
      },
      setLyricLine,
      error(msg) { $(".p-sub").classList.add("err"); $(".p-fmt").textContent = msg; ui.setPlaying(false); },
    };
  })();

  // ======================= 对外接口 =======================
  const api = {
    ready: false,
    parseLRC,
    source,
    hasAlbum: (id) => !!(manifest && manifest.albums && manifest.albums[id] && manifest.albums[id].tracks && manifest.albums[id].tracks.length),
    tracks: (id) => (api.hasAlbum(id) ? manifest.albums[id].tracks : []),
    current: () => (cur() ? { albumId: cur().albumId, n: cur().track.n, playing: !audio.paused } : null),
    // 播放某张专辑，n 为曲目序号（manifest 里的 n），缺省从第一首开始
    playAlbum(id, n) {
      const ts = api.tracks(id);
      if (!ts.length) return;
      const c = cur();
      if (c && c.albumId === id && (n === undefined || c.track.n === n)) { api.toggle(); return; }
      queue = ts.map((track) => ({ albumId: id, track }));
      load(Math.max(0, n === undefined ? 0 : ts.findIndex((t) => t.n === n)));
    },
    toggle() { if (!cur()) return; audio.paused ? audio.play() : audio.pause(); },
    next() { if (idx < queue.length - 1) load(idx + 1); },
    prev() { if (audio.currentTime > 3 || idx === 0) audio.currentTime = 0; else load(idx - 1); },
    seek(sec) { audio.currentTime = sec; },
    stop() { audio.pause(); audio.removeAttribute("src"); audio.load(); queue = []; idx = -1; ui.hide(); try { sessionStorage.removeItem(STATE_KEY); } catch (e) { /* 忽略 */ } document.dispatchEvent(new CustomEvent("lizhi:track", { detail: null })); },
  };
  window.LizhiPlayer = api;

  // 读取曲目清单；失败时播放器保持隐藏，不影响页面其他功能
  source.json(CFG.manifest || "manifest.json")
    .then((m) => {
      manifest = m;
      api.ready = true;
      document.body.classList.add("player-ready");
      document.dispatchEvent(new CustomEvent("lizhi:player-ready"));
      // 跨页面接着播：恢复上一页的曲目和进度（浏览器通常不允许自动播放，先停在暂停状态）
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
      if (s && api.hasAlbum(s.albumId)) {
        const ts = api.tracks(s.albumId);
        queue = ts.map((track) => ({ albumId: s.albumId, track }));
        const i = ts.findIndex((t) => t.n === s.n);
        if (i >= 0) load(i, { autoplay: false, at: s.time });
      }
    })
    .catch((e) => console.warn("[player] 曲目清单加载失败，播放器不启用：", e.message));
})();
