FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/web/package*.json apps/web/
RUN npm install

COPY . .
RUN npm run build --workspace web

FROM caddy:2.8-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
