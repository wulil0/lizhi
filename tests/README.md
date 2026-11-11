# tests

| 路径 | 用途 |
|---|---|
| `lrc.test.js` | LRC 歌词解析单元测试 |
| `fixtures/` | 合成的测试数据：几段纯音（不是任何真实歌曲）、测试歌词、曲目清单，目录结构与线上对象存储约定一致 |
| `player-preview.html` | 开发用跳转页：写入播放器测试配置后跳到指定页面，方便本地或无头浏览器截图 |
| `obs_mock_server.py` | 模拟对象存储：静态文件 + CORS + Range，行为接近 OBS |
| `make_obs_root.py` | 用本机的一个专辑文件夹生成模拟对象存储目录（软链接 + manifest.json，不复制、不修改原文件） |

`tests/` 不会部署到服务器。

## 单元测试

```bash
node --test tests/lrc.test.js
```

## 用合成数据试播放器

本地预览（`python3 -m http.server 8765`）后，打开：

<http://localhost:8765/tests/player-preview.html>

会自动打开唱片页，点《被禁忌的游戏》即可播放。测试数据覆盖：FLAC 优先、仅 FLAC、FLAC 文件缺失时自动退回 MP3、歌词 offset、一行多个时间标签、没有歌词的曲目。

注意：`python3 -m http.server` 不支持 Range 请求，所以这种方式下进度条拖不动。要测拖动进度，用下面的模拟对象存储。

关闭测试配置：<http://localhost:8765/tests/player-preview.html?off=1>

## 用本机曲库试播放器（支持拖动进度）

```bash
python3 tests/make_obs_root.py "<专辑文件夹>" /tmp/obs-root 2004-jinji
```

```bash
python3 tests/obs_mock_server.py /tmp/obs-root 8790
```

然后打开 <http://localhost:8765/tests/player-preview.html?base=http://127.0.0.1:8790/&to=albums.html%232004-jinji>。

本机曲库只在本地使用，不要放进仓库，也不要部署。
