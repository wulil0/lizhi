# 李志 · 非官方乐迷档案站

一个关于民谣歌手李志的静态网站。视觉方向是“南京复印店里的地下刊物”：新闻纸底色、油墨黑、一枚红章，封面默认是黑白复印件，指上去才有颜色。

纯 HTML / CSS / JS，没有框架，也不需要安装依赖。源文件直接用浏览器打开就能工作；部署前用一个只依赖 Node 自带模块的脚本构建出 `dist/`。

## 本地预览

```bash
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>（源文件，页面由 JS 渲染）。

预览构建结果（预渲染 + 版本号，和线上一致）：

```bash
node scripts/build.js
```

```bash
python3 -m http.server 8766 --directory dist
```

## 构建

`node scripts/build.js` 生成 `dist/`：

- **预渲染**：页眉页脚、唱片墙、地图、年表直接写进 HTML（容器带 `data-ssr`），没开 JS 和搜索引擎也能看到完整内容；`js/main.js` 遇到 `data-ssr` 只绑定交互，不重新渲染。模板在 `js/render.js`，浏览器和构建共用一份。
- **版本号**：CSS、JS、字体地址加 `?v=<内容哈希>`，服务器让它们缓存一年，改了内容地址就变。
- 生成 `sitemap.xml`、`robots.txt`，预渲染 `404.html`。
- **缺字检查**：页面上用到的字不在字体子集里时会提示，按提示重跑 `node scripts/subset-font.mjs`。

其他脚本：

| 脚本 | 什么时候用 |
|---|---|
| `scripts/subset-font.mjs` | 新增了文字（尤其是新汉字）后，重新生成思源宋体子集（`fonts/`，联网从 Google Fonts 取子集） |
| `scripts/make-covers.sh` | 新增或替换封面后，生成 `assets/covers/400`、`800` 下的 AVIF / WebP（需要 macOS `sips`、`cwebp`、`avifenc`） |

## 部署

线上地址：<https://lizhi.wulill.bond>，部署在自己的服务器（Debian + nginx）上，源码托管在 GitHub 仓库 `wulil0/lizhi`（只存代码，不做托管）。

更新网站：

```bash
deploy/deploy.sh
```

脚本先运行 `node scripts/build.js`，再用 rsync 把 `dist/` 同步到服务器的 `/var/www/lizhi`。服务器地址和密钥可以用环境变量 `LIZHI_SERVER`、`LIZHI_KEY` 覆盖。

- **歌词与搜索索引**：`lrc/`（歌词文件）与 `search-index.json`（搜索索引）由歌词管线在服务器端维护，不在 `dist/` 里；`deploy.sh` 用 `--exclude` 排除它们，部署不会删掉。不要把它们加进构建产物。
- **nginx**：配置见 `deploy/lizhi.wulill.bond.nginx.conf`，在服务器上的位置是 `/etc/nginx/sites-available/lizhi.wulill.bond`，软链接到 `sites-enabled`。HTTP 自动跳转 HTTPS；HTML 每次向服务器校验，带版本号的 CSS/JS/字体缓存一年，封面缓存一周；自定义 404 页；隐藏 nginx 版本；带 CSP、HSTS 等安全头。
- **DNS**：Cloudflare 上的通配符记录 `*.wulill.bond` 已经指向这台服务器并开启代理，`lizhi` 子域名不需要单独的记录。源站证书沿用 `wulill.bond` 的那张。
- 改了 nginx 配置后：上传到上面那个路径，执行 `nginx -t && systemctl reload nginx`。

## 页面

| 页面 | 内容 |
|---|---|
| `index.html` | 首页：大字标题、可点击轮换的封面叠放、专辑名跑马灯（可点，悬停暂停）、9 张录音室专辑、引言、导航三栏 |
| `albums.html` | 唱片：21 张专辑按性质分组（录音室 / 现场 / 精选集 / 电影配乐单曲），可筛选。点开看封面、简介和收录曲目 |
| `places.html` | 歌里的地方：以南京为原点的经纬度示意图，左下角是华东放大图；点地图上的点或下方城市按钮，看相关歌曲 |
| `timeline.html` | 年表：1978 年至今，每年旁边是当年发行的专辑封面，点开同样进入专辑详情。2019 年一条用黑条遮住，指上去或点一下才显示 |

### 交互细节

- **专辑详情弹层**（唱片页、首页、年表通用）：← → 方向键或按钮翻上一张 / 下一张，顺序跟当前页面卡片一致；Esc、点背景或 × 关闭，关闭后焦点回到原卡片。
- **可分享链接**：唱片页打开某张专辑时，地址会变成 `albums.html#<id>`（如 `#2014-1701`），直接访问会自动打开那张；`albums.html#live` 直接筛选现场专辑。
- **动画**：页面之间淡入淡出转场（支持 View Transitions 的浏览器）；首页大字从下往上印出来、封面像发牌一样依次落下、红章最后盖上；卡片错落出现，悬停时像纸片一样被抬起；地图路线依次描出、城市点逐个弹出，选中的城市路线变成实线；年表遮挡条像盖章一样刷黑；弹层开合都有过渡。
- **首页入场动画**每个浏览器会话只播一次，之后再回首页直接显示。触屏设备没有悬停，封面滚到屏幕中间时自动显出原色。
- **播放器**（默认关闭）：底部播放条 + 滚动歌词面板，支持 FLAC 无损（浏览器播不了时自动退回 MP3，也可以点格式标签手动切换音质），有缓冲提示、音量（桌面端）和键盘快捷键，音源来自对象存储（OBS）。打开方法、目录约定和接口见 [docs/player.md](docs/player.md)。
- 所有可点元素都支持键盘操作，有清晰的焦点框；系统开启“减少动态效果”时，入场动画和跑马灯会关闭。

## 目录结构

| 路径 | 用途 |
|---|---|
| `*.html` | 四个页面 + `404.html`（页眉页脚等由模板生成：构建时预渲染，直接打开源文件时由 JS 注入） |
| `css/style.css` | 全站样式 |
| `js/data.js` | **全部内容数据**：专辑、地点、年表。改内容只改这个文件 |
| `js/render.js` | 页面模板（纯函数），浏览器和构建脚本共用 |
| `js/boot.js` | 放在 `<head>` 里的最小脚本：标记 JS 已启用、本次会话是否看过首页入场动画 |
| `js/main.js` | 交互：弹层、筛选、地图、首页封面轮换等 |
| `js/config.js` | 播放器配置（默认关闭） |
| `js/lrc.js` | LRC 歌词解析 |
| `js/player.js` | 播放器：音源接口、播放核心、播放条与歌词面板 |
| `docs/` | 开发文档，索引见 [docs/README.md](docs/README.md) |
| `tests/` | 单元测试、合成测试数据和本地测试工具，说明见 [tests/README.md](tests/README.md)；不部署 |
| `assets/covers/` | 专辑封面，文件名 = `data.js` 里专辑的 `id` + `.jpg`（最长边 800px，作为后备）；`400/`、`800/` 下是对应宽度的 AVIF / WebP |
| `fonts/` | 思源宋体子集（400、900 两个字重）、许可证 `OFL.txt`、子集包含的字 `chars.txt` |
| `scripts/` | 构建与资源生成脚本（见上文“构建”） |
| `dist/` | 构建产物，部署的就是它；不入库 |
| `deploy/deploy.sh` | 部署脚本：同步站点到服务器 |
| `deploy/lizhi.wulill.bond.nginx.conf` | 服务器上的 nginx 站点配置（留档） |
| `.gitignore` | 不入库的本地文件 |
| `.claude/launch.json` | Claude Code 预览服务器配置 |

## 数据来源与说明

- **专辑名、性质、年份、曲目数、备注**：来自乐迷整理的 Google Drive《李志专辑》表。
- **收录曲目**：按网盘里各专辑文件夹的音频文件名整理，**不是原专辑曲序**，页面上也写明了这一点。
- **封面**：来自同一网盘文件夹中的 `Cover.jpg`，压缩后存入 `assets/covers/`。
- **年表**：依据维基百科“李志 (歌手)”条目和上面那张专辑表。
- 仓库和网站**不含任何音频或歌词**。播放器只是接口，默认关闭；接入音源前请自行确认版权。封面和作品的版权归原作者所有。

### 添加一张专辑

1. 把封面放进 `assets/covers/<id>.jpg`，运行 `scripts/make-covers.sh` 生成 AVIF / WebP；
2. 在 `js/data.js` 的 `ALBUMS` 里加一行，`type` 只能是 `录音室专辑`、`现场专辑`、`精选集`、`电影配乐单曲` 之一（要新增类型，同步修改 `js/render.js` 里的 `TYPE_ORDER`）；
3. 运行 `node scripts/build.js`，如果提示缺字，再运行 `node scripts/subset-font.mjs`。
