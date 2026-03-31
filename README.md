# Heartline

## Current Build Direction

This repo now also includes a self-hosted monorepo starter:

- `apps/web`: Vite + React + TanStack Router + TanStack Query
- `apps/api`: Fastify + TypeScript

Run `docker compose up -d`, copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.

## Local Admin Bootstrap

If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in `.env`, the API will seed or promote that user to an admin account automatically on startup.

## Infra Notes

- Redis is now used for realtime fanout and rate limiting.
- `TRUST_PROXY=true` should be enabled when you deploy behind Nginx or another reverse proxy.
- `NODE_ENV=production` enables secure auth cookie behavior.
- Production deployment files live in `docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/systemd`, and `deploy/logrotate`.
- `scripts/backup-postgres.sh` creates a timestamped Postgres backup from the production compose stack.

## Production Stack Included

- Caddy reverse proxy with automatic TLS
- Dockerfiles for API and web
- Docker Compose production stack with health checks and persistent volumes
- Redis-backed realtime fanout and rate limiting
- log rotation example
- systemd example to run the compose stack on boot

Heartline is a social-first dating app concept built around chemistry, conversation, and safety instead of endless swiping.

## Core Idea

Most dating apps feel transactional. Most social apps are not designed for intentional romantic discovery. Heartline sits between them:

- people discover each other through shared vibe, prompts, short videos, and community moments
- matching is only one part of the product
- the app rewards good conversation, consistency, and respectful behavior

## MVP Features

1. Profile identity
- photos
- voice intro
- personality prompts
- relationship intent
- interests and lifestyle tags

2. Discovery feed
- a mix of nearby people, mutual-interest profiles, and community prompt posts
- less swipe-heavy, more browse-and-react
- reactions can target a specific photo, prompt, or voice note

3. Match flow
- mutual likes create a private chat
- icebreakers are generated from profile content
- users can answer daily prompts to keep conversations alive

4. Social layer
- short status updates like "weekend mood" or "currently into"
- optional group spaces around interests like fitness, books, music, or food
- events and date ideas based on location

5. Trust and safety
- profile verification
- blurred media until trust is built
- easy block/report tools
- consent-first messaging controls

## Ideal MVP User Journey

1. Sign up and choose dating intent
2. Build a profile with photos, prompts, and a short audio intro
3. Explore a discovery feed with profiles and social moments
4. React to a specific part of someone’s profile
5. Match and start a guided conversation
6. Move toward a date idea or keep engaging socially

## Backend Foundation Included

- Docker Compose services for PostgreSQL and Redis
- environment-driven API config via `.env`
- Fastify auth endpoints for register, login, current session, and logout
- cookie-based JWT sessions
- automatic `users` table bootstrap on API startup

## What Is In This Folder

- `apps/web`: Vite frontend with TanStack Router and TanStack Query
- `apps/api`: Fastify API with discovery and auth endpoints
- `docker-compose.yml`: local Postgres and Redis services
- `.env.example`: starter environment variables

## Best Next Move

If you like this direction, the next step should be extending this starter with:

1. onboarding UI and auth screens
2. profile creation backed by Postgres
3. likes and matches
4. chat and notifications
5. media upload via self-hosted object storage
