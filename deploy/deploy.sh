#!/usr/bin/env bash
# 构建并把 dist/ 同步到服务器 /var/www/lizhi（lizhi.wulill.bond）。用法：在项目根目录执行 deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER="${LIZHI_SERVER:-root@111.91.21.52}"
KEY="${LIZHI_KEY:-$HOME/.ssh/id_ed25519}"
node scripts/build.js
# lrc/（歌词文件）与 search-index.json（搜索索引）由歌词管线在服务器端维护，不在 dist/ 里，部署时必须排除，
# 否则 --delete 会把它们删掉（2026-11-12 曾因此丢过一次，导致全站无法播放）。
rsync -az --delete --exclude='lrc/' --exclude='search-index.json' -e "ssh -i $KEY" dist/ "$SERVER:/var/www/lizhi/"
ssh -i "$KEY" "$SERVER" 'chown -R www-data:www-data /var/www/lizhi'
echo "已部署：https://lizhi.wulill.bond"
