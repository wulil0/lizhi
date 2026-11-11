# 用本机的一个专辑文件夹搭“模拟对象存储”目录：按约定建软链接 + 生成 manifest.json，不复制、不修改原文件。
# 用法：python3 tests/make_obs_root.py <专辑文件夹> <输出目录> <专辑 id>
# 专辑文件夹里的文件名需形如 "01-歌名.flac"，同名 .lrc 为歌词（可缺）。需要 ffprobe 读取时长。
import os, sys, json, subprocess
src, root, album_id = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(f"{root}/audio/{album_id}", exist_ok=True); os.makedirs(f"{root}/lyrics/{album_id}", exist_ok=True)
tracks = []
for f in sorted(os.listdir(src)):
    if not f.endswith(".flac"): continue
    base = f[:-5]; n = int(base.split("-")[0]); title = base.split("-", 1)[1]
    key_a = f"audio/{album_id}/{n:02d}.flac"; key_l = f"lyrics/{album_id}/{n:02d}.lrc"
    for k, s in ((key_a, f), (key_l, base + ".lrc")):
        dst = f"{root}/{k}"
        if os.path.lexists(dst): os.remove(dst)
        if os.path.exists(f"{src}/{s}"): os.symlink(f"{src}/{s}", dst)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{src}/{f}"], capture_output=True, text=True).stdout or 0)
    t = {"n": n, "title": title, "audio": {"flac": key_a}, "duration": round(dur)}
    if os.path.exists(f"{src}/{base}.lrc"): t["lyrics"] = key_l
    tracks.append(t)
json.dump({"version": 1, "albums": {album_id: {"tracks": tracks}}}, open(f"{root}/manifest.json", "w"), ensure_ascii=False, indent=1)
print(len(tracks), "tracks")
