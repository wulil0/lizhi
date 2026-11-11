// 播放器配置。默认关闭：enabled 为 false 时，页面上不会出现任何播放相关的界面。
// 接口说明、曲目清单格式和对象存储（OBS）设置见 docs/player.md。
window.LIZHI_PLAYER = {
  enabled: false,

  // 对象存储的访问地址，以 / 结尾。华为云 OBS 的格式：
  //   https://<桶名>.obs.<区域>.myhuaweicloud.com/
  // 也可以是绑定到桶上的自定义域名，或同站的相对路径（如 "media/"）。
  baseUrl: "",

  // 曲目清单在桶里的路径（相对 baseUrl）
  manifest: "manifest.json",

  // 同一首歌有多种格式时的优先顺序；浏览器播不了的格式会自动跳过
  prefer: ["flac", "mp3"],

  // 私有桶：提供一个函数，把对象路径换成带签名的临时地址，例如
  //   sign: async (key) => (await fetch("/api/sign?key=" + encodeURIComponent(key))).text()
  // 为 null 时直接拼接 baseUrl + key（适用于公共读的桶）。
  sign: null,
};

// 本地调试：在浏览器控制台执行
//   localStorage.setItem("lizhi.player", JSON.stringify({ enabled: true, baseUrl: "tests/fixtures/" }))
// 再刷新页面，即可用测试数据覆盖上面的配置；removeItem 后恢复。
try {
  Object.assign(window.LIZHI_PLAYER, JSON.parse(localStorage.getItem("lizhi.player") || "{}"));
} catch (e) { /* 配置格式不对时忽略覆盖 */ }
