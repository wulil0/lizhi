# 播放器与歌词接口

播放器默认**关闭**：不改配置时，网站上不会出现任何播放相关的界面，也不会发出音频请求。仓库里**不含任何真实音频或歌词**；接哪个音源、什么时候打开，由站点维护者决定，涉及的版权问题也需要自己负责。

## 组成

| 文件 | 作用 |
|---|---|
| `js/config.js` | 配置：开关、对象存储地址、格式优先顺序、私有桶签名函数 |
| `js/lrc.js` | LRC 歌词解析（`parseLRC`、`lineAt`），可在 Node 里单独测试 |
| `js/player.js` | 音源接口、播放核心、播放条与歌词面板界面，对外暴露 `window.LizhiPlayer` |
| `js/main.js` | 专辑详情弹层：播放器就绪且清单里有这张专辑时，显示“播放整张”和可点击的曲目 |

## 打开播放器

编辑 `js/config.js`：

```js
window.LIZHI_PLAYER = {
  enabled: true,
  baseUrl: "https://<桶名>.obs.<区域>.myhuaweicloud.com/",   // 以 / 结尾
  manifest: "manifest.json",
  prefer: ["flac", "mp3"],
  sign: null,
};
```

`baseUrl` 也可以是桶绑定的自定义域名、CDN 域名，或者同站的相对路径（如 `media/`）。

## 对象存储目录约定

```
<桶根目录>/
├── manifest.json                 曲目清单（必需）
├── audio/<专辑id>/<两位序号>.flac
├── audio/<专辑id>/<两位序号>.mp3  （可选，作为 FLAC 的后备）
└── lyrics/<专辑id>/<两位序号>.lrc  （可选）
```

`<专辑id>` 必须和 `js/data.js` 里 `ALBUMS` 的 `id` 一致（如 `2004-jinji`、`2014-1701`），播放器靠它找到封面和专辑名。路径其实可以随意，只要 `manifest.json` 里写对就行；上面的约定只是为了好管理。

## 曲目清单 manifest.json

完整示例见 [manifest.example.json](manifest.example.json)。

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | 数字 | 目前为 `1` |
| `albums.<专辑id>.tracks[]` | 数组 | 按播放顺序排列 |
| `n` | 数字 | 曲序，界面显示和定位用，同一张专辑内唯一 |
| `title` | 字符串 | 曲名 |
| `audio` | 对象或字符串 | 对象：`{ "flac": 路径, "mp3": 路径, ... }`，支持 `flac` `mp3` `m4a` `aac` `ogg` `opus` `wav`；只有一个文件时可直接写路径字符串，格式按扩展名判断 |
| `lyrics` | 字符串，可选 | LRC 文件路径；没有时歌词面板显示“这首没有歌词文件” |
| `duration` | 数字，可选 | 秒，仅用于弹层里显示时长 |

路径是相对 `baseUrl` 的对象键，也可以直接写完整的 `https://` 地址。

## FLAC 无损

- 用浏览器原生 `<audio>` 播放，不需要解码库。Chrome、Edge、Firefox 和 Safari 11 以上（macOS / iOS）都支持 FLAC。
- 同一首有多种格式时，按 `prefer` 的顺序挑**浏览器能播**的那个（`canPlayType` 判断）。
- 选中的格式加载失败（文件缺失、解码失败等），会自动换下一个格式重试，并在控制台警告一次。
- 播放条上会显示当前格式，FLAC/WAV 用红框标出“无损”。这首有不止一种能播的格式时，**点格式标签可以切换音质**（如 FLAC ⇄ MP3，流量紧张时有用），进度和播放状态保留，选择记在 `localStorage` 的 `lizhi.player.prefer` 里，之后的曲目优先用它。
- FLAC 文件大，开始播放或拖动后需要等待时，播放键外圈会转动，标题旁显示“缓冲中”。
- 设置了 `preload="metadata"`：只在开始播放时下载音频，不会一打开页面就拉几十 MB 的 FLAC。

## 对象存储需要的设置

1. **读权限**：公共读，或者私有桶 + `sign` 函数（见下）。
2. **CORS**：`manifest.json` 和 `.lrc` 用 `fetch` 读取，必须允许站点跨域访问。华为云 OBS 控制台 → 桶 → 权限管理 → CORS 规则：
   - 允许的来源：`https://lizhi.wulill.bond`（本地调试可以加上 `http://localhost:8765`）
   - 允许的方法：`GET`、`HEAD`
   - 允许的头域：`Range`
   - 补充的头域（Expose）：`Content-Range`、`Content-Length`、`Accept-Ranges`
3. **Range 请求**：拖动进度条需要服务器支持 `Range`（返回 206）。OBS 默认支持；自建服务器要确认这一点。本地 `python3 -m http.server` **不支持**，所以用它测试时进度条拖不动，这不是播放器的问题。
4. **Content-Type**：`.flac` 设为 `audio/flac`、`.lrc` 设为 `text/plain; charset=utf-8`。LRC 文件需要是 UTF-8 编码。
5. **防盗链**：公共读的桶，任何人拿到地址都能下载，流量费算在桶主头上。在 OBS 控制台 → 桶 → 访问权限控制 → 防盗链里设置 Referer 白名单：`https://lizhi.wulill.bond/*`（本地调试可加 `http://localhost:8765/*`），并**不允许空 Referer**。注意防盗链只能挡住别的网站直接引用，挡不住有意下载；真正需要控制访问时用私有桶 + 签名。
6. **CDN**：FLAC 一首几十 MB，直接从桶下载既慢又贵。建议给桶绑定一个自定义域名并接入华为云 CDN（回源到 OBS），`baseUrl` 写 CDN 域名；CDN 上同样开启 Referer 防盗链、允许 Range 回源，缓存时间可以设长（音频文件不会改；要替换就换文件名）。用了 CDN 后，CORS 规则要在 CDN 上也配一份。
7. **网站的 CSP**：nginx 配置里 `media-src` 和 `connect-src` 已放开 `https:`，换成任何 HTTPS 的桶或 CDN 地址都不用改站点配置；如果想收紧，把它们改成具体的域名。

### 私有桶

把 `sign` 设成一个异步函数，输入对象键，返回带签名的临时地址，例如由自己的后端签名：

```js
sign: async (key) => (await fetch("/api/sign?key=" + encodeURIComponent(key))).text(),
```

所有地址（清单、音频、歌词）都会经过它。不要把对象存储的 AK/SK 写进前端代码。

## 替换成其他音源

`player.js` 里的 `source` 对象就是音源接口，只要实现这三个方法就能换成别的来源（比如自建 API）：

| 方法 | 作用 |
|---|---|
| `url(key) → Promise<string>` | 对象键 → 可访问的地址 |
| `json(key) → Promise<object>` | 读取 JSON（曲目清单） |
| `text(key) → Promise<string>` | 读取文本（歌词） |

## 歌词：LRC 格式

`js/lrc.js` 支持：

- `[mm:ss]`、`[mm:ss.xx]`、`[mm:ss.xxx]`、`[mm:ss:xx]`
- 一行多个时间标签：`[00:10.00][00:50.00]副歌`
- `[offset:±毫秒]`：为正时歌词整体提前
- 忽略 `[ti:]` `[ar:]` 等信息标签和没有时间标签的行；空白行显示为“· · ·”（间奏）

歌词面板：当前行加粗并自动滚到中间，点任意一行跳到那里播放。每一行都是按钮，可以用 Tab 选中、回车跳转。

## 键盘快捷键

播放条出现后生效；焦点在输入框、按钮或链接上，或专辑弹层打开时不响应（避免和它们自己的按键冲突）。

| 按键 | 作用 |
|---|---|
| 空格 / K | 播放 / 暂停 |
| ← / → | 后退 / 前进 5 秒 |
| Shift + ← / → | 上一首 / 下一首 |
| L | 打开 / 关闭歌词面板 |

桌面端播放条上有音量滑块，音量记在 `localStorage` 的 `lizhi.player.volume` 里；手机上用系统音量，不显示滑块。

## JS 接口：window.LizhiPlayer

| 成员 | 说明 |
|---|---|
| `ready` | 曲目清单是否已加载 |
| `hasAlbum(id)` / `tracks(id)` | 清单里有没有这张专辑 / 它的曲目数组 |
| `playAlbum(id, n?)` | 播放专辑，`n` 为曲序，缺省从第一首开始；如果正在播的就是这首，则切换播放/暂停 |
| `toggle()` `next()` `prev()` `seek(秒)` `stop()` | 播放控制；`prev()` 在当前曲目播放超过 3 秒时先回到开头 |
| `switchQuality()` | 在当前曲目可用的格式之间切换，保留进度，并记住选择 |
| `current()` | `{ albumId, n, playing }` 或 `null` |
| `parseLRC` `source` | 同上文 |

事件（在 `document` 上派发）：

- `lizhi:player-ready`：曲目清单加载完成
- `lizhi:track`：切换曲目，`detail` 为 `{ albumId, n }`，关闭播放器时为 `null`

其他行为：

- **跨页面接着播**：当前曲目和进度存在 `sessionStorage`，跳到别的页面后播放条会停在原来的位置，点播放继续（浏览器不允许自动出声）。
- **系统媒体控制**：设置了 Media Session，锁屏、耳机按键、系统播放控件里能看到封面和曲名，并能切歌。
- 清单加载失败时播放器保持隐藏，只在控制台警告，不影响网站其他功能。

## 本地测试

见 [../tests/README.md](../tests/README.md)：可以用仓库自带的合成测试音频，或者用本机曲库搭一个支持 CORS 和 Range 的模拟对象存储。
