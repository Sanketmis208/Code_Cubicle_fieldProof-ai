# FieldProof API
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend backend
RUN npm run prisma:generate -w backend && npm run build -w backend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --workspace backend --include-workspace-root --omit=dev
COPY backend/prisma backend/prisma
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
WORKDIR /app/backend
EXPOSE 4000
# Apply migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
