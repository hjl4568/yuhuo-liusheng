# 余火·留声 上线部署（香港服务器 · 免 ICP 备案）

> 前置：服务器 `150.109.73.159` 经实查为**香港节点**，对外建站**无需 ICP 备案**。
> 域名 `emberspeech.com` 已完成实名、DNS A 记录已指向本机。以下步骤让网站以
> `https://emberspeech.com` 直接上线（国内用户可正常访问）。
>
> 操作方式：SSH 登录服务器后，把每一段命令整段复制粘贴执行（# 开头是说明，不用复制）。

---

## 第 0 步（必须，在腾讯云网页操作，不在服务器上）：开放 80 / 443 端口

> certbot 申请免费证书时要从公网访问你服务器的 80 端口做验证。腾讯云默认只放行了 3000，
> **必须先在腾讯云控制台「防火墙 / 安全组」里放行 TCP 80 和 TCP 443**（来源 0.0.0.0/0）。
> 这一步在浏览器里点，不用写命令：
> 1. 登录腾讯云 → 找到这台轻量应用服务器/云服务器 → 「防火墙」或「安全组」
> 2. 添加规则：协议 TCP，端口 80，允许；再添加一条 443，允许。
> 3. （可选）之后验证 https 正常了，可把 3000 端口规则删掉，只留 80/443。

---

## 第 1 步：拉取最新代码（含新标语 + 域名版分享卡片）

```bash
cd /home/ubuntu/yuhuo-liusheng
git fetch origin
git reset --hard origin/master
git log --oneline -1   # 确认最新是 fbcab6f 左右
```

## 第 2 步：装 Nginx + 免费证书工具 certbot

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

## 第 3 步：放入反代配置并启用

```bash
# 复制项目里已写好的反代配置（80 端口 → 本机容器 3000）
sudo cp deploy/nginx-emberspeech.conf /etc/nginx/sites-available/emberspeech.conf
sudo ln -sf /etc/nginx/sites-available/emberspeech.conf /etc/nginx/sites-enabled/emberspeech.conf

# 关掉 Nginx 默认站点（避免占用 80 端口冲突）
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t   # 检查配置语法，看到 "test is successful" 再继续
sudo systemctl enable nginx && sudo systemctl start nginx
```

## 第 4 步：申请免费 HTTPS 证书（Let's Encrypt，自动改写 Nginx 加 443）

```bash
# 先让你输入一个邮箱（证书快到期会邮件提醒续期，免费），直接打字回车即可
read -p "输入你的邮箱(用于证书续期提醒): " CERT_EMAIL
sudo certbot --nginx -d emberspeech.com -d www.emberspeech.com \
  --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
```

> 成功会显示 `Congratulations!` 并自动把 http 跳转到 https。
> 若报错 `Timeout` / `Connection refused`：多半是第 0 步防火墙 80 端口没开，回去开了再重跑本步。

## 第 5 步：把容器只绑本机、并设好域名环境变量

编辑 `docker-compose.yml`，把端口那行改成只监听本机（避免 3000 口直接暴露）：

```bash
# 用 sed 把 "3000:3000" 改成 "127.0.0.1:3000:3000"（若已是则无变化）
sudo sed -i 's#"3000:3000"#"127.0.0.1:3000:3000"#' docker-compose.yml
grep -n ports docker-compose.yml   # 确认改到了
```

设置生产环境变量（CORS 白名单 + 对外地址）：

```bash
# 若还没有 .env.prod，先复制模板
[ -f .env.prod ] || cp .env.prod.example .env.prod

# 写入域名相关两项（覆盖式写入，幂等）
sudo sed -i 's#^CORS_ORIGINS=.*#CORS_ORIGINS=https://emberspeech.com,https://www.emberspeech.com#' .env.prod
sudo sed -i 's#^APP_URL=.*#APP_URL=https://emberspeech.com#' .env.prod
grep -E "CORS_ORIGINS|APP_URL" .env.prod
```

## 第 6 步：重新构建并启动容器

```bash
sudo docker compose up -d --build
sudo docker compose ps   # 确认 yuhuo 容器状态为 Up
```

## 第 7 步：验证上线

```bash
# 本地探测（服务器内执行）
curl -sI https://emberspeech.com | head -n 3   # 应看到 HTTP/2 301/200 与证书
curl -sI https://emberspeech.com/admin.html | head -n 1
```

在自己电脑浏览器访问：
- `https://emberspeech.com` → 看到新标语 **Words that wait, voices that arrive.**
- `https://emberspeech.com/admin.html` → 后台（**第一件事改掉 admin123456 弱密码**）

---

## 常见问题

- **证书到期续期**：certbot 默认自动续。可手动试：`sudo certbot renew --dry-run`
- **改了前端代码要生效**：回到第 1 步 `git fetch + reset --hard` + 第 6 步 `docker compose up -d --build`
- **以后想接微信生态/微信支付**：再另购大陆服务器并走 ICP 备案，代码原样迁移，不重写。
- **国内访问略慢**：香港节点比大陆节点延迟高一点点，余火这种轻量站无感；若日后介意可加大陆 CDN（需备案）。
