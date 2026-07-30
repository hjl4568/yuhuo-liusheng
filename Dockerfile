# 长夜余火 · 后端容器化（适配腾讯云 CloudBase 云托管 / 任意容器平台）
FROM node:20-slim

WORKDIR /app

# better-sqlite3 是原生模块，需要编译工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# .env 不要打进镜像，运行时由平台环境变量注入
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
