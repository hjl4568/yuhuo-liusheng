# 用 Koyeb 部署「长夜余火 / 余火·留声」后端

> ⚠️ **已失效**：Koyeb 已被 Mistral 收购，登录后控制台已变成 AI 工作负载方向，原来的免费 Web Service 部署入口不再可用。请改看 [`render部署.md`](./render部署.md) 用 Render 部署。

仓库已 Koyeb 就绪：监听 `process.env.PORT`（默认 3000，绑所有网卡）、`npm start` 存在、Dockerfile 已带 better-sqlite3 原生编译工具链。下面两种方式任选，推荐方式一（一键）。

## 方式一：一键部署链接（最快）

点这个链接，Koyeb 会自动打开一个已填好大部分配置的部署页：

```
https://app.koyeb.com/deploy?type=git&builder=dockerfile&repository=github.com/hjl4568/yuhuo-liusheng&branch=master&name=yuhuo-liusheng&dockerfile=Dockerfile&port=3000:http&region=sin&env[NODE_ENV]=production&env[MAIL_SERVICE]=163&env[SMTP_HOST]=smtp.163.com&env[SMTP_PORT]=465&env[SMTP_USER]=changyeyuhuo2026@163.com&env[WORK_MAIL]=changyeyuhuo2026@163.com&env[ADMIN_USERNAME]=admin&env[ADMIN_PASSWORD]=admin123456&env[APP_URL]=https://yuhuo-liusheng.koyeb.app
```

打开后只需做两件事再点 Deploy：
1. 在环境变量里补上两个真正敏感的值（链接里没带，避免泄露）：
   - `JWT_SECRET` = 任意一长串随机字符（例如 `openssl rand -hex 32` 的结果）
   - `SMTP_PASS` = 163 邮箱的**授权码**（不是登录密码）
2. 确认其余环境变量无误 → 点 **Deploy**。

部署完成后会得到一个 `https://yuhuo-liusheng.koyeb.app` 的域名。

## 方式二：控制台手动点（备用 / 链接失效时）

1. 打开 https://app.koyeb.com → **Continue with GitHub**（用 hjl4568 登录，授权访问该私有仓库）。
2. 概览页点 **Create Web Service**。
3. 来源选 **GitHub** → 选仓库 `yuhuo-liusheng` → 分支 `master`。
4. Builder 选 **Dockerfile**（会自动识别仓库根目录的 `Dockerfile`）。
5. 服务名 `web`、App 名 `yuhuo-liusheng`、区域选 `sin`（新加坡，离国内近）或 `fra`。
6. 端口填 `3000`（协议 HTTP）。
7. 环境变量（Variables）填下面这一份：
   - `NODE_ENV=production`
   - `MAIL_SERVICE=163`
   - `SMTP_HOST=smtp.163.com`
   - `SMTP_PORT=465`
   - `SMTP_USER=changyeyuhuo2026@163.com`
   - `WORK_MAIL=changyeyuhuo2026@163.com`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=admin123456`
   - `APP_URL=https://yuhuo-liusheng.koyeb.app`
   - `JWT_SECRET=`（随机长串）
   - `SMTP_PASS=`（163 授权码）
8. 点 **Deploy**。构建 + 起服务通常 1–3 分钟。

## 部署后验证

- 打开 `https://yuhuo-liusheng.koyeb.app` → 应看到「长夜余火」介绍页（含右下角「中 / EN」切换）。
- 访问 `https://yuhuo-liusheng.koyeb.app/api/health` → 应返回 `{"status":"ok"}`。
- 点「登记早期体验」提交一条 → 项目 163 邮箱应收到意向邮件（前提是 `SMTP_PASS` 填的是正确的 163 授权码）。
- 实时数据 Tab 的统计会从占位变成真实数值（注意：免费档 SQLite 在实例休眠/重启后会清空，属正常）。

## 免费档须知（重要）

- Koyeb 免费 Starter：约 1 小时无访问会 scale-to-zero（休眠），再次访问冷启动约几秒~十几秒。
- 容器文件系统是临时的，**SQLite 数据在休眠/重启/重新部署后会清空**，MVP 试水可接受；要持久化以后再接 Koyeb Volume 或外部数据库（Supabase/Turso）。
- 发信走 163 SMTP，与服务器所在地无关，国内也能收到。

## 安全提醒

- 部署完成后，请到 GitHub **撤销之前提供的 Personal Access Token**（`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`，路径：Settings → Developer settings → Personal access tokens）。
- 以后要改文案/设计/功能：用中文告诉我 → 我在仓库改好、提交、推到 GitHub → Koyeb 监测到 `master` 更新会**自动重新部署**，你零操作。
- 建议把后台管理员密码（`ADMIN_PASSWORD`）改成只有你知道的强密码（在 Koyeb 环境变量里改即可，无需改代码）。
