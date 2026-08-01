#!/usr/bin/env bash
# 长夜余火 · 腾讯云轻量一键部署/更新脚本
# 用法：
#   首次： bash deploy.sh
#   以后： 我推了代码 → 你登录服务器 → bash deploy.sh → 自动拉取并重建
set -e

REPO="https://github.com/hjl4568/yuhuo-liusheng.git"

# 优先使用当前目录（如果已经在项目目录里执行，就直接用它）
if [ -d ".git" ]; then
  DIR="$(pwd)"
else
  # 不在项目目录时，按当前用户选择默认路径，避免 ubuntu 用户写到 /root 没权限
  if [ "$(whoami)" = "root" ]; then
    DIR="/root/yuhuo-liusheng"
  else
    DIR="$HOME/yuhuo-liusheng"
  fi
fi

# 首次克隆，之后只拉最新
if [ ! -d "$DIR/.git" ]; then
  echo ">> 首次克隆代码到 $DIR ..."
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
echo ">> 拉取最新代码（强制与 GitHub 对齐，丢弃服务器本地改动）..."
git fetch origin
git reset --hard origin/master

# 用 docker compose 重建并后台运行（.env.prod 注入密钥，data 卷持久化）
echo ">> 构建并启动容器 ..."
docker compose up -d --build

# 打印公网 IP，方便直接访问
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me || echo "未知")
echo "=================================================="
echo "部署完成 ✅"
echo "本机公网 IP： $PUBLIC_IP"
echo "请先在腾讯云防火墙放行 TCP 3000 端口"
echo "访问首页：   http://${PUBLIC_IP}:3000"
echo "健康检查：   http://${PUBLIC_IP}:3000/api/health"
echo "=================================================="
