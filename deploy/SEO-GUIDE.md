# 让搜索引擎收录 emberspeech.com（上线后操作指南）

> 代码侧该做的（结构化数据、canonical、robots、sitemap）已经全部提交并推送。
> 下面是你（或我）在服务器上把改动生效、并主动提交给搜索引擎的步骤。

---

## 第 1 步：重新部署，让 SEO 改动生效

SSH 进服务器后，**整段粘贴**这一行即可（已包含端口限制，不需要再 sed）：

```bash
cd /home/ubuntu/yuhuo-liusheng && git fetch origin && git reset --hard origin/master && sudo docker compose up -d --build
```

部署完验证（应能看到新的 robots.txt 注释已更新、首页含 JSON-LD）：

```bash
curl -s https://emberspeech.com/robots.txt | grep -i sitemap
curl -s https://emberspeech.com/ | grep -o 'application/ld+json' | head -n1
```

> 注：`.env.prod` 和 Nginx 配置在服务器本地、不进仓库，`git reset --hard` 不会动它们，放心。

---

## 第 2 步：在 Google Search Console 认领站点（约 3 分钟）

1. 打开 https://search.google.com/search-console/ → 用谷歌账号登录。
2. 点「添加资源」→ 选 **「网址前缀」** → 填 `https://emberspeech.com/` → 继续。
3. 验证方式选 **「HTML 标记」** → 复制那行
   `<meta name="google-site-verification" content="一长串字母数字">`。
4. 把 `一长串字母数字` 发给我（或自己替换 `public/intro.html` 等页面里的
   `content="GOOGLE_VERIFICATION_CODE"`）→ 我改完推送、你重新部署 → 回控制台点「验证」。

> 验证通过后，在左侧「站点地图」里填 `https://emberspeech.com/sitemap.xml` 提交，Google 就开始抓取收录。
> 收录后还能在「搜索分析」里看每天有哪些词带来点击——这是宝贵的真实需求数据。

---

## 第 3 步：在百度搜索资源平台认领站点（约 3 分钟）

1. 打开 https://ziyuan.baidu.com/site/ → 用百度账号登录。
2. 添加网站 → 填 `https://emberspeech.com` → 验证方式选 **「HTML 标签验证」**。
3. 复制 `meta` 里的 `content` 值发给我，我替换 `BAIDU_VERIFICATION_CODE` → 推送 → 你重新部署 → 回平台点验证。
4. 验证通过 → 左侧「普通收录 / 站点地图」→ 提交 `https://emberspeech.com/sitemap.xml`。

> 百度对**已备案**域名收录更快；香港免备案域名也能收，只是初期慢一点、需要你多发原创外链（公众号/小红书带链接）帮它发现你。

---

## 第 4 步（可选）：主动推送新链接给百度

百度有「主动推送 API」比等它爬快。需要平台给你的 **token**（在「普通收录 → 资源提交 → API 提交」里看）。
拿到 token 后，可让我写个一键推送脚本。也可以手动在「链接提交」里粘贴网址批量提交。

---

## 已经做完、不用再动的（代码侧）

- ✅ 四个页面 `intro/app/join/support` 加了 **JSON-LD 结构化数据**（WebSite + Organization），搜索结果可显示站点信息。
- ✅ 每个页面加了 **canonical 规范链接**，避免重复内容判定。
- ✅ `robots.txt` 指向 `https://emberspeech.com/sitemap.xml` 并声明 `Host: emberspeech.com`。
- ✅ `sitemap.xml` 含全部页面 + `lastmod`，利于抓取调度。
- ✅ 各页已有 `description / keywords / OG / Twitter` 卡片（分享好看、搜索摘要好）。

## 收录后怎么加速（长期）

1. 在你已发的**公众号 / 小红书 / 豆瓣**帖子里带上 `https://emberspeech.com` 真实链接——外链是搜索引擎发现新站最快的路。
2. 持续发**原创场景化内容**（写给未来的孩子 / 旧友 / 已离开的人），搜"写给未来的信""时间胶囊"这类词的人会被引过来。
3. 收录稳定后，可考虑在页面里加更多长尾词落地页（如"给十年后的自己""数字遗产是什么"）。
