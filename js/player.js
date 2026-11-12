// 播放器：对象存储音源 + LRC 歌词 + 播放条界面。配置见 config.js，接口文档见 docs/player.md。
// 对外暴露 window.LizhiPlayer；准备就绪后在 document 上派发 "lizhi:player-ready"，
// 切换曲目时派发 "lizhi:track"（detail: { albumId, n }）。
(function () {
  const CFG = window.LIZHI_PLAYER || {};
  if (!CFG.enabled || !CFG.baseUrl) return;

  const MIME = { flac: "audio/flac", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg; codecs=opus", wav: "audio/wav" };
  const STATE_KEY = "lizhi.player.state";
  const PREFER_KEY = "lizhi.player.prefer";   // 用户在播放条上选的音质（flac / mp3）
  const VOLUME_KEY = "lizhi.player.volume";
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式 */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtTime = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");

  // ======================= 音源：对象存储 =======================
  // 任何音源只要实现这三个方法就能替换（例如换成自建接口）。
  // 签名地址缓存：签名服务每次都要现算（约 1 秒），同一首歌只签一次；失败不缓存，下次重签
  const signedCache = new Map();
  const source = {
    // 对象路径 → 可访问的地址
    async url(key) {
      if (/^https?:\/\//.test(key)) return key;
      if (typeof CFG.sign === "function") {
        if (signedCache.has(key)) return signedCache.get(key);
        const signed = await CFG.sign(key);
        signedCache.set(key, signed);
        return signed;
      }
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
  let lastSaved = -1;
  const audio = new Audio();
  audio.preload = "metadata";
  const vol = parseFloat(store.get(VOLUME_KEY));
  if (vol >= 0 && vol <= 1) audio.volume = vol;

  const album = (id) => (typeof ALBUMS !== "undefined" ? ALBUMS : []).find((a) => a.id === id) || { id, title: id };
  const cur = () => queue[idx];

  const filesOf = (audioField) => (typeof audioField === "string" ? { [audioField.split(".").pop().toLowerCase()]: audioField } : audioField || {});
  const playable = (f) => !MIME[f] || !!audio.canPlayType(MIME[f]);
  // 这首歌里浏览器能播的格式，按优先顺序排列（用户手动选过的音质排最前）
  function formatsOf(audioField) {
    const files = filesOf(audioField);
    const user = store.get(PREFER_KEY);
    const order = [...new Set([...(user ? [user] : []), ...(CFG.prefer || []), ...Object.keys(files)])];
    return order.filter((f) => files[f] && playable(f));
  }
  // 选出浏览器能播、且没失败过的格式
  function pickFormat(audioField) {
    const f = formatsOf(audioField).find((x) => !tried.includes(x));
    return f ? { fmt: f, key: filesOf(audioField)[f] } : null;
  }

  async function load(i, { autoplay = true, at = 0 } = {}) {
    if (!queue[i]) return;
    idx = i; tried = []; lyrics = []; lyricIdx = -1; pendingSeek = at;
    const { albumId, track } = cur();
    ui.show(); ui.setTrack(album(albumId), track); ui.setLyrics(null);
    await loadAudio(autoplay);
    prefetchNext();
    document.dispatchEvent(new CustomEvent("lizhi:track", { detail: { albumId, n: track.n } }));
    mediaSession();
    saveState();
    if (track.lyrics) {
      source.text(track.lyrics)
        .then((t) => { if (cur() && cur().track === track) { lyrics = parseLRC(t); ui.setLyrics(lyrics); } })
        .catch((e) => { console.warn("[player] 歌词加载失败", e); ui.setLyrics([]); });
    } else if (track.note) ui.setLyrics([], track.note);
    else ui.setLyrics([]);
  }

  async function loadAudio(autoplay) {
    const pick = pickFormat(cur().track.audio);
    if (!pick) { ui.error("这首歌没有当前浏览器能播放的格式"); return; }
    ui.setFormat(pick.fmt, formatsOf(cur().track.audio).filter((f) => !tried.includes(f)).length > 1);
    audio.dataset.fmt = pick.fmt;
    audio.src = await source.url(pick.key);
    if (autoplay) audio.play().catch(() => { ui.setPlaying(false); armGestureResume(); });
  }

  // 自动播放被浏览器拦下后，之后任意点按/按键都尝试恢复，直到真正播起来或用户手动接管；
  // 点在播放条/输入框/弹层上时不抢，让控件自己的处理接管，避免和播放键打架；其余内容点击都可恢复
  let gestureResumeArmed = false;
  function resumeOnGesture(e) {
    if (e && e.target && e.target.closest && e.target.closest(".player, input, select, textarea, dialog")) return;
    if (cur() && audio.paused && audio.src) audio.play().catch(() => {});
  }
  function armGestureResume() {
    if (gestureResumeArmed) return;
    gestureResumeArmed = true;
    document.addEventListener("pointerdown", resumeOnGesture);
    document.addEventListener("click", resumeOnGesture);
    document.addEventListener("keydown", resumeOnGesture);
  }
  function disarmGestureResume() {
    if (!gestureResumeArmed) return;
    gestureResumeArmed = false;
    document.removeEventListener("pointerdown", resumeOnGesture);
    document.removeEventListener("click", resumeOnGesture);
    document.removeEventListener("keydown", resumeOnGesture);
  }

  // 后台预签下一首：只换签名、不下载音频，切歌时直接用缓存里的地址
  function prefetchNext() {
    const nx = queue[idx + 1];
    if (!nx) return;
    const fs = formatsOf(nx.track.audio);
    if (!fs.length) return;
    const key = filesOf(nx.track.audio)[fs[0]];
    if (key) source.url(key).catch(() => {});
  }
  audio.addEventListener("loadedmetadata", () => {
    if (pendingSeek) { audio.currentTime = Math.min(pendingSeek, audio.duration || pendingSeek); pendingSeek = 0; }
    ui.setTime(audio.currentTime, audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    ui.setTime(audio.currentTime, audio.duration);
    const li = lineAt(lyrics, audio.currentTime);
    if (li !== lyricIdx) { lyricIdx = li; ui.setLyricLine(li); }
    const sec = Math.floor(audio.currentTime);
    if (sec !== lastSaved) { lastSaved = sec; saveState(); }
  });
  audio.addEventListener("play", () => ui.setPlaying(true));
  audio.addEventListener("playing", disarmGestureResume);
  audio.addEventListener("pause", () => { ui.setPlaying(false); ui.setBuffering(false); saveState(); });
  // 缓冲提示：FLAC 文件大，开始播放或拖动后可能要等一会儿
  audio.addEventListener("waiting", () => ui.setBuffering(true));
  audio.addEventListener("seeking", () => { if (!audio.paused) ui.setBuffering(true); });
  ["playing", "canplay", "seeked", "error", "emptied"].forEach((ev) => audio.addEventListener(ev, () => ui.setBuffering(false)));
  audio.addEventListener("volumechange", () => { store.set(VOLUME_KEY, String(audio.volume)); ui.setVolume(audio.volume); });
  audio.addEventListener("ended", () => { if (idx < queue.length - 1) load(idx + 1); else ui.setPlaying(false); });
  audio.addEventListener("error", () => {
    if (!cur()) return;
    // 当前格式失败（例如 FLAC 解码不了、文件缺失），换下一个格式重试
    tried.push(audio.dataset.fmt);
    if (pickFormat(cur().track.audio)) { console.warn(`[player] ${audio.dataset.fmt} 加载失败，改用其他格式`); pendingSeek = audio.currentTime || 0; loadAudio(true); }
    else ui.error("音频加载失败");
  });

  // 切页/刷新前立刻存一次进度，避免刚好卡在两次 timeupdate 之间丢几秒
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveState(); });

  // 从往返缓存（bfcache）恢复时脚本不重跑：若停在暂停态，试播一次，被拦则布下点按恢复
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted || !cur() || !audio.paused || !audio.src) return;
    audio.play().catch(() => armGestureResume());
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
      artwork: [
        { src: new URL(`assets/covers/400/${a.id}.webp`, location.href).href, sizes: "400x400", type: "image/webp" },
        { src: new URL(`assets/covers/${a.id}.jpg`, location.href).href, sizes: "800x800", type: "image/jpeg" },
      ],
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
        <div class="p-meta"><div class="p-title"></div><div class="p-sub"><span class="p-album"></span><button class="p-fmt" data-act="quality" disabled></button><span class="p-buf" aria-live="polite"></span></div></div>
        <div class="p-ctrl">
          <button class="p-btn" data-act="prev" aria-label="上一首">⏮&#xFE0E;</button>
          <button class="p-btn p-play" data-act="toggle" aria-label="播放">▶&#xFE0E;</button>
          <button class="p-btn" data-act="next" aria-label="下一首">⏭&#xFE0E;</button>
        </div>
        <div class="p-progress"><span class="p-time">0:00</span><input class="p-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="播放进度"><span class="p-dur">0:00</span></div>
        <label class="p-vol" title="音量"><span aria-hidden="true">音量</span><input type="range" min="0" max="100" step="1" aria-label="音量"></label>
        <button class="p-btn p-lyr" data-act="lyrics" aria-pressed="false" aria-label="歌词（快捷键 L）">词</button>
        <button class="p-btn p-x" data-act="close" aria-label="关闭播放器">×</button>
      </div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const seek = $(".p-seek"), panel = $(".lyrics-panel"), lines = $(".lp-lines"), volume = $(".p-vol input");
    volume.value = Math.round(audio.volume * 100);
    volume.addEventListener("input", () => { audio.volume = volume.value / 100; });
    let dragging = false;

    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (b) ({ prev: api.prev, next: api.next, toggle: api.toggle, lyrics: toggleLyrics, close: api.stop, quality: api.switchQuality })[b.dataset.act]();
      const line = e.target.closest(".lp-lines [data-t]");
      if (line) { audio.currentTime = +line.dataset.t; if (audio.paused) audio.play(); }
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
      if (el) {
        el.classList.add("on");
        if (!panel.hidden) lines.scrollTo({ top: el.offsetTop - lines.clientHeight * 0.30 + el.clientHeight / 2, behavior: instant ? "auto" : "smooth" });
      }
      markNext();
    }
    // 当前没有真实歌词行激活时（前奏、间奏），给下一行真实歌词加 .next，前面显示跳动的 ♪
    function markNext() {
      lines.querySelectorAll(".next").forEach((el) => el.classList.remove("next"));
      const active = lines.children[lyricIdx];
      if (active && !active.classList.contains("gap") && !active.classList.contains("lp-empty") && !active.classList.contains("lp-note")) return;
      const start = lyricIdx < 0 ? 0 : lyricIdx + 1;
      for (let j = start; j < lines.children.length; j++) {
        const el = lines.children[j];
        if (el.classList.contains("gap") || el.classList.contains("lp-empty") || el.classList.contains("lp-note")) continue;
        el.classList.add("next");
        return;
      }
    }
    return {
      show() { if (root.hidden) { root.hidden = false; document.body.classList.add("has-player"); } },
      hide() { root.hidden = true; document.body.classList.remove("has-player"); toggleLyrics(false); },
      setTrack(a, t) {
        $(".p-cover").src = `assets/covers/400/${a.id}.webp`;
        $(".p-title").textContent = t.title;
        $(".p-album").textContent = `《${a.title}》`;
        $(".lp-title").textContent = t.title;
        $(".p-sub").classList.remove("err");
        root.classList.remove("swap"); void root.offsetWidth; root.classList.add("swap");
      },
      // canSwitch：这首有不止一种能播的格式时，标签可以点击切换音质
      setFormat(f, canSwitch) {
        const b = $(".p-fmt");
        b.textContent = f.toUpperCase();
        b.classList.toggle("lossless", f === "flac" || f === "wav");
        b.disabled = !canSwitch;
        b.title = canSwitch ? "点击切换音质" : "";
        b.setAttribute("aria-label", `当前音质 ${f.toUpperCase()}${canSwitch ? "，点击切换" : ""}`);
      },
      setBuffering(on) { root.classList.toggle("buffering", on); $(".p-buf").textContent = on ? "缓冲中" : ""; },
      setVolume(v) { volume.value = Math.round(v * 100); },
      setPlaying(on) { const b = $(".p-play"); b.innerHTML = on ? "❚❚" : "▶&#xFE0E;"; b.setAttribute("aria-label", on ? "暂停" : "播放"); root.classList.toggle("playing", on); },
      setTime(t, d) {
        if (!dragging) { seek.value = d ? Math.round((t / d) * 1000) : 0; $(".p-time").textContent = fmtTime(t); }
        $(".p-dur").textContent = fmtTime(d);
        seek.style.setProperty("--p", `${d ? (t / d) * 100 : 0}%`);
      },
      setLyrics(ls, note) {
        if (ls === null) { lines.innerHTML = `<li class="lp-empty">歌词加载中……</li>`; return; }
        lines.innerHTML = ls.length
          ? ls.map((l) => (l.text ? `<li><button data-t="${l.t}">${esc(l.text)}</button></li>` : `<li class="gap"><button data-t="${l.t}" aria-label="间奏">· · ·</button></li>`)).join("")
          : note ? `<li class="lp-note">${esc(note)}</li>`
          : `<li class="lp-empty">这首没有歌词文件。</li>`;
        lines.scrollTop = 0;
        markNext();
      },
      setLyricLine,
      error(msg) { $(".p-sub").classList.add("err"); $(".p-buf").textContent = msg; ui.setPlaying(false); ui.setBuffering(false); },
      toggleLyrics,
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
      // 清单还在加载时先等就绪再播，避免硬刷新后首点静默失败
      if (!api.ready) {
        document.addEventListener("lizhi:player-ready", function once() {
          document.removeEventListener("lizhi:player-ready", once);
          api.playAlbum(id, n);
        });
        return;
      }
      const ts = api.tracks(id);
      if (!ts.length) return;
      const c = cur();
      // 点具体曲目且已在播该曲时按一下算暂停/继续；不带 n 的“播放整张”永远从第一首开始
      if (c && c.albumId === id && n !== undefined && c.track.n === n) { api.toggle(); return; }
      queue = ts.map((track) => ({ albumId: id, track }));
      load(Math.max(0, n === undefined ? 0 : ts.findIndex((t) => t.n === n)));
    },
    toggle() { if (!cur()) return; disarmGestureResume(); audio.paused ? audio.play() : audio.pause(); },
    next() { if (idx < queue.length - 1) load(idx + 1); },
    prev() { if (audio.currentTime > 3 || idx === 0) audio.currentTime = 0; else load(idx - 1); },
    seek(sec) { audio.currentTime = Math.max(0, Math.min(sec, audio.duration || sec)); },
    // 在这首歌的可用格式之间切换（如 FLAC ⇄ MP3），保留进度和播放状态，并记住选择
    switchQuality() {
      if (!cur()) return;
      const fs = formatsOf(cur().track.audio).filter((f) => f === audio.dataset.fmt || !tried.includes(f));
      if (fs.length < 2) return;
      const nextFmt = fs[(fs.indexOf(audio.dataset.fmt) + 1) % fs.length];
      store.set(PREFER_KEY, nextFmt);
      pendingSeek = audio.currentTime;
      loadAudio(!audio.paused);
    },
    stop() { disarmGestureResume(); audio.pause(); audio.removeAttribute("src"); audio.load(); queue = []; idx = -1; ui.hide(); try { sessionStorage.removeItem(STATE_KEY); } catch (e) { /* 忽略 */ } document.dispatchEvent(new CustomEvent("lizhi:track", { detail: null })); },
  };
  window.LizhiPlayer = api;

  // 键盘快捷键（播放条出现后生效；焦点在输入框、按钮上或弹层打开时不抢按键）
  document.addEventListener("keydown", (e) => {
    if (!cur() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, button, a, [role=button], dialog[open]") || document.querySelector("dialog[open]")) return;
    const k = e.key;
    if (k === " " || k === "k" || k === "K") { e.preventDefault(); api.toggle(); }
    else if (k === "ArrowLeft") { e.preventDefault(); e.shiftKey ? api.prev() : api.seek(audio.currentTime - 5); }
    else if (k === "ArrowRight") { e.preventDefault(); e.shiftKey ? api.next() : api.seek(audio.currentTime + 5); }
    else if (k === "l" || k === "L") ui.toggleLyrics();
  });

  // 读取曲目清单；失败时播放器保持隐藏，不影响页面其他功能
  source.json(CFG.manifest || "manifest.json")
    .then((m) => {
      manifest = m;
      api.ready = true;
      document.body.classList.add("player-ready");
      document.dispatchEvent(new CustomEvent("lizhi:player-ready"));
      // 跨页面接着播：恢复上一页的曲目和进度，定位完成后接着播（浏览器不允许自动播放时静默失败，停在暂停状态）
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
      if (s && api.hasAlbum(s.albumId)) {
        const ts = api.tracks(s.albumId);
        queue = ts.map((track) => ({ albumId: s.albumId, track }));
        const i = ts.findIndex((t) => t.n === s.n);
        if (i >= 0) load(i, { autoplay: true, at: s.time });
      }
    })
    .catch((e) => console.warn("[player] 曲目清单加载失败，播放器不启用：", e.message));
})();
