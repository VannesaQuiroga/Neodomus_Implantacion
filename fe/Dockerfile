FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@10 --activate

ENV CI=true

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

# Copia con listado explícito (S6470): evita arrastrar archivos sensibles o
# ajenos a la imagen (p. ej. .env, artefactos dist/, stores de paquetes).
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tsconfig.app.json ./
COPY playwright.config.ts vite-env.d.ts ./
COPY src ./src
COPY public ./public
COPY e2e ./e2e

EXPOSE 5173

CMD ["pnpm", "run", "dev"]
