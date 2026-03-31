import type { FastifyInstance } from "fastify";
import { sql } from "./db";

export type SessionToken = {
  sub: string;
  email: string;
  role: "user" | "admin";
  sessionVersion: number;
};

export type AuthSession = {
  userId: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  sessionVersion: number;
};

type UserSessionRow = {
  id: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended" | "banned";
  session_version: number;
};

export async function requireSessionWithStatuses(
  app: FastifyInstance,
  token: string | undefined,
  allowedStatuses: Array<UserSessionRow["status"]>
): Promise<AuthSession | null> {
  if (!token) {
    return null;
  }

  const verified = await app.jwt.verify<SessionToken>(token);
  const [user] = await sql<UserSessionRow[]>`
    select id, email, role, status, session_version
    from users
    where id = ${verified.sub}
    limit 1
  `;

  if (
    !user ||
    user.session_version !== verified.sessionVersion ||
    !allowedStatuses.includes(user.status)
  ) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    sessionVersion: user.session_version
  };
}

export async function requireSession(
  app: FastifyInstance,
  token: string | undefined
): Promise<AuthSession | null> {
  return requireSessionWithStatuses(app, token, ["active"]);
}

export async function requireAdmin(app: FastifyInstance, token: string | undefined) {
  const session = await requireSession(app, token);

  if (!session || session.role !== "admin") {
    return null;
  }

  return session;
}

export async function signSessionToken(
  app: FastifyInstance,
  session: AuthSession | { userId: string; email: string; role: "user" | "admin"; sessionVersion: number }
) {
  return app.jwt.sign(
    {
      sub: session.userId,
      email: session.email,
      role: session.role,
      sessionVersion: session.sessionVersion
    },
    {
      expiresIn: "7d"
    }
  );
}
