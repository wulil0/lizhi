#!/usr/bin/env bash
# 构建并把 dist/ 同步到服务器 /var/www/lizhi（lizhi.wulill.bond）。用法：在项目根目录执行 deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER="${LIZHI_SERVER:-root@111.91.21.52}"
KEY="${LIZHI_KEY:-$HOME/.ssh/id_ed25519}"
node scripts/build.js
rsync -az --delete -e "ssh -i $KEY" dist/ "$SERVER:/var/www/lizhi/"
ssh -i "$KEY" "$SERVER" 'chown -R www-data:www-data /var/www/lizhi'
echo "已部署：https://lizhi.wulill.bond"
