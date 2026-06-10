FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Install dependencies
RUN pnpm install

# Build plugin-plex
COPY src ./src
RUN pnpm run build

# Runtime
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]