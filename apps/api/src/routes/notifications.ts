import { env } from "../config";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../auth";
import { sql } from "../db";

type NotificationRow = {
  id: string;
  type: "like" | "match" | "message" | "moderation" | "system";
  title: string;
  body: string;
  target_path: string;
  photo_path: string | null;
  created_at: string;
};
type NotificationStateRow = {
  notification_id: string;
  read_at: string | null;
  dismissed_at: string | null;
};

const notificationActionSchema = z.object({
  notificationId: z.string().min(1)
});

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/notifications", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const rawItems = await sql<NotificationRow[]>`
        select id, type, title, body, target_path, photo_path, created_at
        from notifications
        where recipient_user_id = ${session.userId}
        order by created_at desc
        limit 100
      `;

      const notificationIds = rawItems.map((item) => item.id);
      const states = notificationIds.length
        ? await sql<NotificationStateRow[]>`
            select notification_id, read_at, dismissed_at
            from notification_states
            where user_id = ${session.userId}
              and notification_id = any(${notificationIds})
          `
        : [];
      const stateById = new Map(states.map((state) => [state.notification_id, state]));

      const items = rawItems
        .map((item) => {
          const state = stateById.get(item.id);

          return {
            ...item,
            createdAt: item.created_at,
            targetPath: item.target_path,
            photoUrl: item.photo_path ? `${env.API_URL}${item.photo_path}` : null,
            readAt: state?.read_at ?? null,
            dismissedAt: state?.dismissed_at ?? null,
            isRead: Boolean(state?.read_at)
          };
        })
        .filter((item) => !item.dismissedAt);

      return {
        items,
        unreadCount: items.filter((item) => !item.isRead).length
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/notifications/:notificationId/read", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = notificationActionSchema.parse(request.params);

      await sql`
        insert into notification_states (user_id, notification_id, read_at, updated_at)
        values (${session.userId}, ${params.notificationId}, now(), now())
        on conflict (user_id, notification_id)
        do update set read_at = now(), updated_at = now()
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid notification id."
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/notifications/:notificationId/dismiss", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = notificationActionSchema.parse(request.params);

      await sql`
        insert into notification_states (user_id, notification_id, dismissed_at, updated_at)
        values (${session.userId}, ${params.notificationId}, now(), now())
        on conflict (user_id, notification_id)
        do update set dismissed_at = now(), updated_at = now()
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid notification id."
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });
}
