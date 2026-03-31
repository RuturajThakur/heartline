FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/api/package*.json apps/api/
RUN npm install

COPY . .
RUN npm run build --workspace api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY apps/api/package*.json apps/api/
RUN npm install --omit=dev --workspace api

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/uploads ./apps/api/uploads
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/.env.example ./.env.example

WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]
