// 播放器配置。已接入 OBS 私有桶：曲目清单与音频都经 /api/sign 换签名地址后播放。
// 接口说明、曲目清单格式和对象存储（OBS）设置见 docs/player.md。
window.LIZHI_PLAYER = {
  enabled: true,

  // 对象存储的访问地址，以 / 结尾。华为云 OBS 的格式：
  //   https://<桶名>.obs.<区域>.myhuaweicloud.com/
  // 也可以是绑定到桶上的自定义域名，或同站的相对路径（如 "media/"）。
  baseUrl: "https://wulill26.obs.cn-north-4.myhuaweicloud.com/",

  // 曲目清单在桶里的路径（相对 baseUrl）
  manifest: "manifest.json",

  // 同一首歌有多种格式时的优先顺序；浏览器播不了的格式会自动跳过
  prefer: ["flac", "mp3"],

  // 私有桶：把对象路径换成带签名的临时地址（签名服务只签李志/ 前缀与曲目清单）。
  sign: async (key) => key === "manifest.json" ? "/api/manifest" : (await fetch("/api/sign?key=" + encodeURIComponent(key))).text(),
};

// 本地调试：在浏览器控制台执行
//   localStorage.setItem("lizhi.player", JSON.stringify({ enabled: true, baseUrl: "tests/fixtures/" }))
// 再刷新页面，即可用测试数据覆盖上面的配置；removeItem 后恢复。
try {
  Object.assign(window.LIZHI_PLAYER, JSON.parse(localStorage.getItem("lizhi.player") || "{}"));
} catch (e) { /* 配置格式不对时忽略覆盖 */ }
