# 余火·留声 — 时光胶囊式内容投递平台

> 让此刻的声音，抵达未来

- 在线主页：[https://emberspeech.com](https://emberspeech.com)
- 项目主页内容导览：[docs/PROJECT-OVERVIEW.md](./docs/PROJECT-OVERVIEW.md)

## 项目简介

用户上传文字/录音/影像，设定触发时间和收件人，系统在指定时刻将内容通过邮件投递给对方。

## 核心功能（MVP）

- 用户注册/登录（JWT 鉴权）
- 内容创建（文字/录音/图片/视频，AES-256 加密存储）
- 投递设置（收件人、触发时间、公开授权）
- 触发机制（立即触发/定时触发/手动触发）
- 邮件发送（Nodemailer，支持测试模式）
- 后台管理（用户/胶囊/日志/仪表盘）

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | HTML5 + CSS3 + Vanilla JS（移动端优先） |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 认证 | JWT + bcrypt |
| 邮件 | Nodemailer |
| 加密 | AES-256-CBC |
| 定时 | node-cron |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 重建原生模块（Windows 首次需要）
npm rebuild better-sqlite3

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 设置邮件 SMTP 等

# 4. 启动
npm start

# 5. 访问
# 前端: http://localhost:3000
# 后台: http://localhost:3000/admin.html
```

## 默认账号

首次启动时，系统会自动创建管理员账号：

| 类型 | 账号 | 密码 |
|------|------|------|
| 管理员 | admin | 见环境变量 `ADMIN_PASSWORD`（首次启动后请立即修改） |
| 测试用户 | 在注册页创建 | - |

> ⚠️ 安全提示：不要修改 `.env.example` / `.env.prod.example` / `render.yaml` 来写入生产密码，请在服务器本地创建 `.env` 或 `.env.prod` 并自行保管。这些环境文件已被 `.gitignore` 排除，不会进入 GitHub。

## 邮件配置

### 开发模式（默认）
使用 Ethereal 测试邮件，邮件不会真正发送，但可以在浏览器中预览。

### 生产模式（QQ邮箱示例）
1. 登录 QQ邮箱 → 设置 → 账户 → 开启 SMTP
2. 获取授权码
3. 编辑 `.env`：
```
MAIL_SERVICE=smtp
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=你的QQ号@qq.com
SMTP_PASS=你的授权码
```

## 部署指南

### 方案一：Railway（推荐，免费）

```bash
# 1. 安装 Railway CLI
npm install -g @railway/cli

# 2. 登录
railway login

# 3. 初始化并部署
railway init
railway up
```

### 方案二：Render（免费）

1. 注册 render.com
2. New → Web Service → 连接 GitHub 仓库
3. Build Command: `npm install && npm rebuild better-sqlite3`
4. Start Command: `npm start`

### 方案三：腾讯云轻量服务器（香港节点，免备案）

> 当前线上部署方案。服务器位于中国香港，绑定域名后可直接通过 `https://emberspeech.com` 访问，无需 ICP 备案（注：若后续需开通微信公众号/小程序/微信支付，再考虑迁移大陆服务器并备案）。

详见 [deploy/DEPLOY-HK-now.md](./deploy/DEPLOY-HK-now.md)。

## H5 → 小程序演进

### 第一步（当前）：H5 网页版
- 已完成，免审核，可直接分享 URL 测试

### 第二步：小程序适配
1. 注册微信小程序账号（mp.weixin.qq.com）
2. 使用 uni-app 或 Taro 创建小程序项目
3. 复用后端 API（无需改动）
4. 重写前端 UI 组件
5. 提交审核上线

### 关键点
- 后端 API 完全复用，零改动
- 小程序中可用 `web-view` 直接嵌入 H5 页面过渡
- 微信登录需后端增加 `wx.login` 接口

## 项目结构

```
yuhuo-liusheng/
├── src/
│   ├── index.js              # 入口
│   ├── db.js                 # 数据库
│   ├── middleware/auth.js    # 认证中间件
│   ├── routes/
│   │   ├── auth.js           # 用户认证 API
│   │   ├── capsules.js       # 胶囊管理 API
│   │   └── admin.js          # 后台管理 API
│   └── services/
│       ├── crypto.js         # 加密服务
│       ├── email.js          # 邮件服务
│       └── scheduler.js      # 定时触发器
├── public/
│   ├── css/style.css         # 全局样式
│   ├── js/api.js             # API 客户端
│   ├── index.html            # 首页
│   ├── intro.html            # 项目主页（滚动叙事）
│   ├── origin.html           # 项目缘起《长夜·余火》全文
│   ├── join.html             # 加入我们
│   ├── support.html          # 支持我们
│   ├── compliance.html       # 合规与 e签宝方案
│   ├── privacy.html          # 隐私政策
│   ├── login.html            # 登录
│   ├── register.html         # 注册
│   ├── create.html           # 创建胶囊
│   ├── capsules.html         # 胶囊列表
│   ├── capsule-detail.html   # 胶囊详情
│   ├── profile.html          # 个人中心
│   └── admin.html            # 后台管理
├── data/                     # 数据库 + 上传文件（已被 .gitignore 排除）
├── docs/
│   ├── PRD.md                # 产品需求文档
│   ├── PROJECT-OVERVIEW.md   # 项目主页内容导览
│   └── 合规与e签宝方案.md      # 合规方案
├── deploy/
│   ├── DEPLOY-HK-now.md      # 香港免备案部署指南
│   ├── SEO-GUIDE.md          # 搜索引擎收录指南
│   └── nginx-emberspeech.conf # Nginx 反向代理配置
├── .env.example              # 环境变量模板（开发）
├── .env.prod.example         # 环境变量模板（生产）
└── package.json
```

## API 文档

详见 `docs/PRD.md` 中的 API 设计章节。

## License

MIT
