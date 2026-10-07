# truth_source MCP server (stdio)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY tsconfig.json sources.yaml ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY sources.yaml ./
# Optional at runtime: -e TAVILY_API_KEY=... -e BRAVE_API_KEY=... -e FACTCHECK_API_KEY=... -e CONTACT_EMAIL=...
CMD ["node", "dist/index.js"]
