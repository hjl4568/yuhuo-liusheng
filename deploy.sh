#!/usr/bin/env bash
# 长夜余火 · 腾讯云轻量一键部署/更新脚本
# 用法：
#   首次： bash deploy.sh
#   以后： 我推了代码 → 你登录服务器 → bash deploy.sh → 自动拉取并重建
set -e

DIR="/root/yuhuo-liusheng"
REPO="https://github.com/hjl4568/yuhuo-liusheng.git"

# 首次克隆，之后只拉最新
if [ ! -d "$DIR/.git" ]; then
  echo ">> 首次克隆代码 ..."
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
echo ">> 拉取最新代码 ..."
git pull --ff-only

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
