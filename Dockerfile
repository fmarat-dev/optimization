FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
ENV DATA_DIR=/app/data
CMD ["node", "src/bot/main.ts"]
