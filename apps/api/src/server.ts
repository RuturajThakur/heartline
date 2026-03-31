import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "./auth";
import { ensureAdminBootstrap } from "./bootstrap";
import { env } from "./config";
import { ensureDatabase } from "./db";
import { redis } from "./redis";
import { subscribeToUserEvents } from "./realtime";
import { registerAuthRoutes } from "./routes/auth";
import { registerConversationRoutes } from "./routes/conversations";
import { registerDiscoveryRoutes } from "./routes/discovery";
import { registerLikeRoutes } from "./routes/likes";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerProfileRoutes } from "./routes/profile";
import { registerSafetyRoutes } from "./routes/safety";

const app = Fastify({
  logger: true,
  trustProxy: env.TRUST_PROXY
});

function getRateLimitConfig(method: string, url: string) {
  if (method === "POST" && (url.startsWith("/api/auth/login") || url.startsWith("/api/auth/register"))) {
    return {
      limit: 10,
      windowMs: 60_000
    };
  }

  if (method === "POST" && url.startsWith("/api/conversations/")) {
    return {
      limit: 25,
      windowMs: 60_000
    };
  }

  if (method === "POST" && (url.startsWith("/api/likes") || url.startsWith("/api/reports"))) {
    return {
      limit: 20,
      windowMs: 60_000
    };
  }

  if (method === "POST" && url.startsWith("/api/profile/photo")) {
    return {
      limit: 12,
      windowMs: 60_000
    };
  }

  return null;
}

const uploadsRoot = path.resolve(process.cwd(), "uploads");

await mkdir(path.join(uploadsRoot, "profile-photos"), {
  recursive: true
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowedOrigins = new Set([env.CLIENT_URL]);

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    if (env.NODE_ENV !== "production") {
      try {
        const parsedOrigin = new URL(origin);
        const isLocalDevOrigin =
          (parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:") &&
          (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1");

        callback(null, isLocalDevOrigin);
        return;
      } catch {
        callback(null, false);
        return;
      }
    }

    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"]
});

await app.register(cookie);

app.addHook("onRequest", async (request, reply) => {
  const csrfExemptPaths = new Set(["/api/auth/login", "/api/auth/register"]);

  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !csrfExemptPaths.has(request.url.split("?")[0])
  ) {
    const csrfCookie = request.cookies?.heartline_csrf;
    const csrfHeader = request.headers["x-csrf-token"];

    if (!csrfCookie || csrfHeader !== csrfCookie) {
      return reply.code(403).send({
        message: "CSRF validation failed."
      });
    }
  }

  const config = getRateLimitConfig(request.method, request.url);

  if (!config) {
    return;
  }

  const key = `ratelimit:${request.ip}:${request.method}:${request.url.split("?")[0]}`;
  const nextCount = await redis.incr(key);

  if (nextCount === 1) {
    await redis.pexpire(key, config.windowMs);
  }

  if (nextCount > config.limit) {
    return reply.code(429).send({
      message: "Too many requests. Please slow down and try again in a minute."
    });
  }
});

await app.register(multipart, {
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1
  }
});
await app.register(fastifyStatic, {
  root: uploadsRoot,
  prefix: "/uploads/"
});

await app.register(jwt, {
  secret: env.JWT_SECRET,
  cookie: {
    cookieName: "heartline_token",
    signed: false
  }
});

await ensureDatabase();
await ensureAdminBootstrap();
await registerAuthRoutes(app);
await registerConversationRoutes(app);
await registerDiscoveryRoutes(app);
await registerLikeRoutes(app);
await registerNotificationRoutes(app);
await registerProfileRoutes(app);
await registerSafetyRoutes(app);

app.get("/api/events", async (request, reply) => {
  const session = await requireSession(app, request.cookies.heartline_token);

  if (!session) {
    return reply.code(401).send({
      message: "Not authenticated."
    });
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  reply.raw.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsubscribe = subscribeToUserEvents(session.userId, (event) => {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    reply.raw.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 20_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    reply.raw.end();
  });

  return reply.hijack();
});

app.get("/health", async () => ({
  ok: true,
  service: "heartline-api"
}));

try {
  await app.listen({
    port: env.PORT,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
