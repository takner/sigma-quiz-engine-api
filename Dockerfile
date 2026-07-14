FROM node:24.18.0-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24.18.0-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:24.18.0-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --include=dev && npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && node dist/main.js"]
