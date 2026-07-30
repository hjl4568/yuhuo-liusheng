# 用 Render 部署「长夜余火 / 余火·留声」后端

Koyeb 已被 Mistral 收购，免费 Web Service 部署入口已不再可用，因此改用 **Render**（免费档，无需信用卡即可开始）。

仓库已 Render 就绪：监听 `process.env.PORT`（默认 3000，绑所有网卡）、`npm start` 存在、Dockerfile 已带 better-sqlite3 原生编译工具链。本目录下还有一个 `render.yaml`，渲染部署按钮/手动创建服务时会自动读取。

## 方式一：一键部署链接（最快）

点下面的 **Deploy to Render** 按钮（或复制链接打开），Render 会读取仓库根目录的 `render.yaml` 自动配置好大部分环境变量：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hjl4568/yuhuo-liusheng)

```
https://render.com/deploy?repo=https://github.com/hjl4568/yuhuo-liusheng
```

打开后，只有一个地方要手动填：
- `SMTP_PASS` = 163 邮箱的**授权码**（不是登录密码）

其余变量（`NODE_ENV`、`MAIL_SERVICE`、`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`WORK_MAIL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`APP_URL`）和 `JWT_SECRET`（Render 自动生成随机串）都已预填好。确认 → 点 **Deploy**。

部署完成后会得到一个 `https://yuhuo-liusheng.onrender.com` 域名（Render 自动按服务名分配）。

## 方式二：控制台手动点（备用 / 链接失效时）

1. 打开 https://dashboard.render.com → **Get Started** / **New +** → **Web Service**。
2. 来源选 **Build and deploy from a Git repository** → **Connect GitHub**（用 hjl4568 授权访问私有仓库）。
3. 选仓库 `yuhuo-liusheng` → 分支 `master` → **Connect**。
4. 配置页：
   - **Name**: `yuhuo-liusheng`
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: `Free`
   - **Region**: 默认即可（可选 `Singapore` 离国内近，但不是必选项）
   - **Health Check Path**: `/api/health`
5. 环境变量填下面这一份（Add Environment Variable）：
   - `NODE_ENV=production`
   - `MAIL_SERVICE=163`
   - `SMTP_HOST=smtp.163.com`
   - `SMTP_PORT=465`
   - `SMTP_USER=changyeyuhuo2026@163.com`
   - `WORK_MAIL=changyeyuhuo2026@163.com`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=admin123456`
   - `APP_URL=https://yuhuo-liusheng.onrender.com`
   - `JWT_SECRET=`（随机长串，可在 Render 里点 Generate 生成）
   - `SMTP_PASS=`（163 授权码）
6. 点 **Create Web Service**。构建 + 起服务通常 3–5 分钟。

## 部署后验证

- 打开 `https://yuhuo-liusheng.onrender.com` → 应看到「长夜余火」介绍页（含右下角「中 / EN」切换）。
- 访问 `https://yuhuo-liusheng.onrender.com/api/health` → 应返回 `{"status":"ok"}`。
- 点「登记早期体验」提交一条 → 项目 163 邮箱应收到意向邮件（前提是 `SMTP_PASS` 填的是正确的 163 授权码）。
- 实时数据 Tab 的统计会从占位变成真实数值。

## 免费档须知（重要）

- **15 分钟无访问即休眠**，再次访问冷启动约 30–60 秒。
- 每月 **750 免费实例小时**、**100GB 出站流量**，单人项目通常够用。
- 容器文件系统是临时的，**SQLite 数据在休眠/重启/重新部署后会清空**，MVP 试水可接受；要持久化以后再接 Render Disk 或外部数据库（Supabase/Turso）。
- 发信走 163 SMTP，与服务器所在地无关，国内能收到。

## 保活（可选）

若不想它 15 分钟休眠，可用 [cron-job.org](https://cron-job.org) 每 10 分钟 ping 一次 `https://yuhuo-liusheng.onrender.com/api/health`；这会产生少量免费时长消耗，但单人项目完全够用。

## 安全提醒

- 部署完成后，请到 GitHub **撤销之前提供的 Personal Access Token**（`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`，路径：Settings → Developer settings → Personal access tokens）。
- 以后要改文案/设计/功能：用中文告诉我 → 我在仓库改好、提交、推到 GitHub → Render 监测到 `master` 更新会**自动重新部署**，你零操作。
- 建议把后台管理员密码（`ADMIN_PASSWORD`）改成只有你知道的强密码（在 Render 环境变量里改即可，无需改代码）。
