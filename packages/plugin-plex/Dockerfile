FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install plugin-sdk dependencies and build it
COPY plugin-sdk ./plugin-sdk
WORKDIR /app/plugin-sdk
RUN pnpm install && pnpm run build

# Back to plugin-plex
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY tsconfig.json ./

# Create symlink to built plugin-sdk
RUN mkdir -p packages && cp -r /app/plugin-sdk packages/plugin-sdk

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