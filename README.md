# 李志 · 非官方乐迷档案站

一个关于民谣歌手李志的静态网站。视觉方向是“南京复印店里的地下刊物”：新闻纸底色、油墨黑、一枚红章，封面默认是黑白复印件，指上去才有颜色。

纯 HTML / CSS / JS，不需要构建，没有外部依赖。

## 本地预览

```bash
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>。

## 部署

线上地址：<https://lizhi.wulill.bond>，部署在自己的服务器（Debian + nginx）上，源码托管在 GitHub 仓库 `wulil0/lizhi`（只存代码，不做托管）。

更新网站：

```bash
deploy/deploy.sh
```

脚本用 rsync 把站点文件同步到服务器的 `/var/www/lizhi`（不上传 `.git`、`.claude`、`README.md`、`deploy/`）。服务器地址和密钥可以用环境变量 `LIZHI_SERVER`、`LIZHI_KEY` 覆盖。

- **nginx**：配置见 `deploy/lizhi.wulill.bond.nginx.conf`，在服务器上的位置是 `/etc/nginx/sites-available/lizhi.wulill.bond`，软链接到 `sites-enabled`。HTTP 自动跳转 HTTPS；封面缓存一周，HTML/CSS/JS 每次都向服务器校验。
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
- 所有可点元素都支持键盘操作，有清晰的焦点框；系统开启“减少动态效果”时，入场动画和跑马灯会关闭。

## 目录结构

| 路径 | 用途 |
|---|---|
| `*.html` | 四个页面（页眉页脚由 `js/main.js` 统一注入） |
| `css/style.css` | 全站样式 |
| `js/data.js` | **全部内容数据**：专辑、地点、年表。改内容只改这个文件 |
| `js/main.js` | 渲染与交互 |
| `assets/covers/` | 专辑封面，文件名 = `data.js` 里专辑的 `id` + `.jpg`（最长边 800px） |
| `deploy/deploy.sh` | 部署脚本：同步站点到服务器 |
| `deploy/lizhi.wulill.bond.nginx.conf` | 服务器上的 nginx 站点配置（留档） |
| `.gitignore` | 不入库的本地文件 |
| `.claude/launch.json` | Claude Code 预览服务器配置 |

## 数据来源与说明

- **专辑名、性质、年份、曲目数、备注**：来自乐迷整理的 Google Drive《李志专辑》表。
- **收录曲目**：按网盘里各专辑文件夹的音频文件名整理，**不是原专辑曲序**，页面上也写明了这一点。
- **封面**：来自同一网盘文件夹中的 `Cover.jpg`，压缩后存入 `assets/covers/`。
- **年表**：依据维基百科“李志 (歌手)”条目和上面那张专辑表。
- 网站**不收录歌词，不提供音频播放或下载**。封面和作品的版权归原作者所有。

### 添加一张专辑

1. 把封面放进 `assets/covers/<id>.jpg`；
2. 在 `js/data.js` 的 `ALBUMS` 里加一行，`type` 只能是 `录音室专辑`、`现场专辑`、`精选集`、`电影配乐单曲` 之一（要新增类型，同步修改 `js/main.js` 里的 `order`）。
