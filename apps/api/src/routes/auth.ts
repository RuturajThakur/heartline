import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession, requireSessionWithStatuses, signSessionToken } from "../auth";
import { sql } from "../db";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(2).max(80),
  birthDate: z.iso.date(),
  city: z.string().min(2).max(120)
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80),
  birthDate: z.iso.date(),
  city: z.string().min(2).max(120)
});

const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
});

const deleteAccountSchema = z.object({
  currentPassword: z.string().min(8),
  confirmText: z.string().trim().refine((value) => value === "DELETE", {
    message: "Type DELETE to confirm."
  })
});

type UserRow = {
  id: string;
  email: string;
  name: string;
  birth_date: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  session_version: number;
  created_at: string;
};

function sanitizeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    birthDate: user.birth_date,
    city: user.city,
    latitude: user.latitude,
    longitude: user.longitude,
    role: user.role,
    status: user.status,
    createdAt: user.created_at
  };
}

function setSessionCookie(reply: any, token: string) {
  const csrfToken = randomUUID();
  reply.setCookie("heartline_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  reply.setCookie("heartline_csrf", csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);

    const existingUser = await sql<Array<{ id: string }>>`
      select id from users where email = ${input.email} limit 1
    `;

    if (existingUser.length > 0) {
      return reply.code(409).send({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const [user] = await sql<UserRow[]>`
      insert into users (email, password_hash, name, birth_date, city)
      values (${input.email}, ${passwordHash}, ${input.name}, ${input.birthDate}, ${input.city})
      returning id, email, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
    `;

    const token = await signSessionToken(app, {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.session_version
    });

    setSessionCookie(reply, token);

    return reply.code(201).send({
      user: sanitizeUser(user)
    });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);

    const [user] = await sql<(UserRow & { password_hash: string })[]>`
      select id, email, password_hash, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
      from users
      where email = ${input.email}
      limit 1
    `;

    if (!user) {
      return reply.code(401).send({
        message: "Invalid email or password."
      });
    }

    const validPassword = await bcrypt.compare(input.password, user.password_hash);

    if (!validPassword) {
      return reply.code(401).send({
        message: "Invalid email or password."
      });
    }

    if (user.status !== "active") {
      return reply.code(403).send({
        message:
          user.status === "banned"
            ? "This account has been banned."
            : "This account is suspended."
      });
    }

    const token = await signSessionToken(app, {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.session_version
    });

    setSessionCookie(reply, token);

    return {
      user: sanitizeUser(user)
    };
  });

  app.get("/api/auth/me", async (request, reply) => {
    try {
      const session = await requireSessionWithStatuses(app, request.cookies.heartline_token, [
        "active",
        "suspended",
        "banned"
      ]);

      if (!session) {
        reply.clearCookie("heartline_token", {
          path: "/"
        });
        reply.clearCookie("heartline_csrf", {
          path: "/"
        });

        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const [user] = await sql<UserRow[]>`
        select id, email, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
        from users
        where id = ${session.userId}
        limit 1
      `;

      if (!user) {
        reply.clearCookie("heartline_token", {
          path: "/"
        });
        reply.clearCookie("heartline_csrf", {
          path: "/"
        });

        return reply.code(401).send({
          message: "Session is no longer valid."
        });
      }

      return {
        user: sanitizeUser(user)
      };
    } catch {
      reply.clearCookie("heartline_token", {
        path: "/"
      });
      reply.clearCookie("heartline_csrf", {
        path: "/"
      });

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.patch("/api/auth/account", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = updateAccountSchema.parse(request.body);

      const [user] = await sql<UserRow[]>`
        update users
        set
          name = ${input.name},
          birth_date = ${input.birthDate},
          city = ${input.city}
        where id = ${session.userId}
        returning id, email, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
      `;

      return {
        user: sanitizeUser(user)
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid account payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/auth/password", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = changePasswordSchema.parse(request.body);

      const [user] = await sql<(UserRow & { password_hash: string })[]>`
        select id, email, password_hash, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
        from users
        where id = ${session.userId}
        limit 1
      `;

      if (!user) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const validPassword = await bcrypt.compare(input.currentPassword, user.password_hash);

      if (!validPassword) {
        return reply.code(400).send({
          message: "Current password is incorrect.",
          field: "currentPassword"
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);

      const [updatedUser] = await sql<UserRow[]>`
        update users
        set
          password_hash = ${passwordHash},
          session_version = session_version + 1
        where id = ${session.userId}
        returning id, email, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
      `;

      const token = await signSessionToken(app, {
        userId: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        sessionVersion: updatedUser.session_version
      });

      setSessionCookie(reply, token);

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid password payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("heartline_token", {
      path: "/"
    });
    reply.clearCookie("heartline_csrf", {
      path: "/"
    });

    return {
      ok: true
    };
  });

  app.post("/api/auth/location", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = updateLocationSchema.parse(request.body);

      const [user] = await sql<UserRow[]>`
        update users
        set
          latitude = ${input.latitude},
          longitude = ${input.longitude}
        where id = ${session.userId}
        returning id, email, name, birth_date, city, latitude, longitude, role, status, session_version, created_at
      `;

      return {
        user: sanitizeUser(user)
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid location payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.delete("/api/auth/account", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = deleteAccountSchema.parse(request.body);

      const [user] = await sql<Array<{ password_hash: string }>>`
        select password_hash
        from users
        where id = ${session.userId}
        limit 1
      `;

      if (!user) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const validPassword = await bcrypt.compare(input.currentPassword, user.password_hash);

      if (!validPassword) {
        return reply.code(400).send({
          message: "Current password is incorrect.",
          field: "currentPassword"
        });
      }

      await sql`
        delete from users
        where id = ${session.userId}
      `;

      reply.clearCookie("heartline_token", {
        path: "/"
      });
      reply.clearCookie("heartline_csrf", {
        path: "/"
      });

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid delete account payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });
}
