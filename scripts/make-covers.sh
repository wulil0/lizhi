#!/usr/bin/env bash
# 从 assets/covers/<id>.jpg（最长边 800px）生成响应式封面：
#   assets/covers/400/<id>.avif|webp   卡片、缩略图、播放条
#   assets/covers/800/<id>.avif|webp   首页叠放、专辑弹层
# 只处理还没生成过、或比原图旧的文件。依赖：sips（macOS 自带）、cwebp、avifenc（brew install webp libavif）
set -euo pipefail
cd "$(dirname "$0")/../assets/covers"
mkdir -p 400 800
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for src in *.jpg; do
  id="${src%.jpg}"
  for size in 400 800; do
    for fmt in avif webp; do
      out="$size/$id.$fmt"
      [[ -f "$out" && "$out" -nt "$src" ]] && continue
      png="$tmp/$id-$size.png"
      [[ -f "$png" ]] || sips -s format png -Z "$size" "$src" --out "$png" >/dev/null
      if [[ $fmt == webp ]]; then cwebp -quiet -q 80 -m 6 "$png" -o "$out"
      else avifenc -q 62 -s 4 -j all "$png" "$out" >/dev/null; fi
    done
  done
  echo "✓ $id"
done
