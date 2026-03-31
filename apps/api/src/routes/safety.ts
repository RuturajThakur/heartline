import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, requireSession, requireSessionWithStatuses } from "../auth";
import { env } from "../config";
import { sql } from "../db";
import { createNotification } from "../notifications";

const blockSchema = z.object({
  targetUserId: z.uuid()
});

const unmatchSchema = z.object({
  targetUserId: z.uuid()
});

const reportSchema = z.object({
  targetUserId: z.uuid(),
  reason: z.enum(["spam", "harassment", "fake_profile", "inappropriate_content", "other"]),
  details: z.string().trim().max(500).optional().or(z.literal(""))
});

const reviewReportSchema = z.object({
  status: z.enum(["open", "reviewed", "resolved"]),
  moderationNote: z.string().trim().max(500).optional().or(z.literal("")),
  moderationReason: z.string().trim().max(240).optional().or(z.literal("")),
  suspensionEndsAt: z.string().datetime().optional().or(z.literal(""))
});

const userStatusSchema = z.object({
  status: z.enum(["active", "suspended", "banned"])
});

const verificationReviewSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  moderationNote: z.string().trim().max(500).optional().or(z.literal(""))
});

type ReportRow = {
  id: string;
  reporter_user_id: string;
  reporter_name: string;
  target_user_id: string;
  target_name: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed" | "resolved";
  moderation_note: string | null;
  moderation_reason: string | null;
  suspension_ends_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  created_at: string;
};

type BlockRow = {
  blocked_user_id: string;
  blocked_name: string;
  blocked_city: string;
  blocked_photo_path: string | null;
  created_at: string;
};

type VerificationRow = {
  user_id: string;
  name: string;
  email: string;
  city: string;
  photo_path: string | null;
  voice_intro_path: string | null;
  verification_status: "pending" | "verified" | "unverified";
  updated_at: string;
};

export async function registerSafetyRoutes(app: FastifyInstance) {
  app.get("/api/blocks", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const blocks = await sql<BlockRow[]>`
        select
          b.blocked_user_id,
          u.name as blocked_name,
          u.city as blocked_city,
          dp.photo_path as blocked_photo_path,
          b.created_at
        from blocks b
        join users u on u.id = b.blocked_user_id
        left join dating_profiles dp on dp.user_id = b.blocked_user_id
        where b.blocker_user_id = ${session.userId}
        order by b.created_at desc
      `;

      return {
        items: blocks.map((block) => ({
          userId: block.blocked_user_id,
          name: block.blocked_name,
          city: block.blocked_city,
          photoUrl: block.blocked_photo_path
            ? `${env.API_URL}${block.blocked_photo_path}`
            : null,
          blockedAt: block.created_at
        }))
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/blocks", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = blockSchema.parse(request.body);

      if (input.targetUserId === session.userId) {
        return reply.code(400).send({
          message: "You cannot block yourself."
        });
      }

      await sql`
        insert into blocks (blocker_user_id, blocked_user_id)
        values (${session.userId}, ${input.targetUserId})
        on conflict (blocker_user_id, blocked_user_id) do nothing
      `;

      await sql`
        delete from likes
        where (actor_user_id = ${session.userId} and target_user_id = ${input.targetUserId})
           or (actor_user_id = ${input.targetUserId} and target_user_id = ${session.userId})
      `;

      await sql`
        delete from matches
        where (user_a = ${session.userId} and user_b = ${input.targetUserId})
           or (user_a = ${input.targetUserId} and user_b = ${session.userId})
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid block payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/unmatch", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = unmatchSchema.parse(request.body);

      if (input.targetUserId === session.userId) {
        return reply.code(400).send({
          message: "You cannot unmatch yourself."
        });
      }

      await sql`
        delete from likes
        where (actor_user_id = ${session.userId} and target_user_id = ${input.targetUserId})
           or (actor_user_id = ${input.targetUserId} and target_user_id = ${session.userId})
      `;

      await sql`
        delete from matches
        where (user_a = ${session.userId} and user_b = ${input.targetUserId})
           or (user_a = ${input.targetUserId} and user_b = ${session.userId})
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid unmatch payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/blocks/:targetUserId/remove", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { targetUserId?: string };

      if (!params.targetUserId) {
        return reply.code(400).send({
          message: "Target user id is required."
        });
      }

      await sql`
        delete from blocks
        where blocker_user_id = ${session.userId}
          and blocked_user_id = ${params.targetUserId}
      `;

      return {
        ok: true
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/reports", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = reportSchema.parse(request.body);

      if (input.targetUserId === session.userId) {
        return reply.code(400).send({
          message: "You cannot report yourself."
        });
      }

      await sql`
        insert into reports (reporter_user_id, target_user_id, reason, details)
        values (
          ${session.userId},
          ${input.targetUserId},
          ${input.reason},
          ${input.details?.trim() ? input.details.trim() : null}
        )
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid report payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.get("/api/reports", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const reports = await sql<ReportRow[]>`
        select
          r.id,
          r.reporter_user_id,
          reporter.name as reporter_name,
          r.target_user_id,
          target_user.name as target_name,
          r.reason,
          r.details,
          r.status,
          r.moderation_note,
          r.reviewed_at,
          r.moderation_reason,
          r.suspension_ends_at,
          reviewer.name as reviewed_by_name,
          r.created_at
        from reports r
        join users reporter on reporter.id = r.reporter_user_id
        join users target_user on target_user.id = r.target_user_id
        left join users reviewer on reviewer.id = r.reviewed_by_user_id
        order by
          case when r.status = 'open' then 0 else 1 end,
          r.created_at desc
      `;

      const items = reports.map((report) => ({
        id: report.id,
        reporterUserId: report.reporter_user_id,
        reporterName: report.reporter_name,
        targetUserId: report.target_user_id,
        targetUserName: report.target_name,
        reason: report.reason,
        details: report.details,
        status: report.status,
        moderationNote: report.moderation_note,
        moderationReason: report.moderation_reason,
        suspensionEndsAt: report.suspension_ends_at,
        reviewedAt: report.reviewed_at,
        reviewedByName: report.reviewed_by_name,
        createdAt: report.created_at
      }));

      return {
        items,
        openCount: items.filter((report) => report.status === "open").length
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.get("/api/verifications", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const items = await sql<VerificationRow[]>`
        select
          dp.user_id,
          u.name,
          u.email,
          u.city,
          dp.photo_path,
          dp.voice_intro_path,
          dp.verification_status,
          dp.updated_at
        from dating_profiles dp
        join users u on u.id = dp.user_id
        where dp.verification_status = 'pending'
        order by dp.updated_at desc
      `;

      return {
        items: items.map((item) => ({
          userId: item.user_id,
          name: item.name,
          email: item.email,
          city: item.city,
          photoUrl: item.photo_path ? `${env.API_URL}${item.photo_path}` : null,
          voiceIntroUrl: item.voice_intro_path
            ? `${env.API_URL}${item.voice_intro_path}`
            : null,
          verificationStatus: item.verification_status,
          requestedAt: item.updated_at
        })),
        pendingCount: items.length
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/verifications/:userId/review", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { userId?: string };

      if (!params.userId) {
        return reply.code(400).send({
          message: "User id is required."
        });
      }

      const input = verificationReviewSchema.parse(request.body);
      const nextStatus = input.decision === "verified" ? "verified" : "unverified";

      await sql`
        update dating_profiles
        set
          verification_status = ${nextStatus},
          updated_at = now()
        where user_id = ${params.userId}
      `;

      await sql`
        insert into moderation_actions (moderator_user_id, target_user_id, action, reason, details)
        values (
          ${session.userId},
          ${params.userId},
          ${input.decision === "verified" ? "verification_verified" : "verification_rejected"},
          'Verification review',
          ${input.moderationNote?.trim() ? input.moderationNote.trim() : null}
        )
      `;

      await createNotification({
        recipientUserId: params.userId,
        actorUserId: session.userId,
        type: "moderation",
        title:
          input.decision === "verified"
            ? "Your profile is now verified"
            : "Your verification request was declined",
        body:
          input.decision === "verified"
            ? "Your verified badge is now visible on your profile."
            : input.moderationNote?.trim()
              ? input.moderationNote.trim()
              : "Update your profile details and request verification again when you are ready.",
        targetPath: "/edit-profile",
        payload: {
          decision: input.decision
        }
      });

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid verification review payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/reports/:reportId/review", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { reportId?: string };

      if (!params.reportId) {
        return reply.code(400).send({
          message: "Report id is required."
        });
      }

      const input = reviewReportSchema.parse(request.body);

      await sql`
        update reports
        set
          status = ${input.status},
          moderation_note = ${input.moderationNote?.trim() ? input.moderationNote.trim() : null},
          moderation_reason = ${input.moderationReason?.trim() ? input.moderationReason.trim() : null},
          suspension_ends_at = ${input.suspensionEndsAt?.trim() ? input.suspensionEndsAt.trim() : null},
          reviewed_by_user_id = ${session.userId},
          reviewed_at = now()
        where id = ${params.reportId}
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid review payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/users/:userId/status", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(403).send({
          message: "Admin access required."
        });
      }

      const params = request.params as { userId?: string };

      if (!params.userId) {
        return reply.code(400).send({
          message: "User id is required."
        });
      }

      const input = userStatusSchema.parse(request.body);

      const [targetUser] = await sql<Array<{ email: string }>>`
        select email
        from users
        where id = ${params.userId}
        limit 1
      `;

      await sql`
        update users
        set
          status = ${input.status}
        where id = ${params.userId}
      `;

      await sql`
        insert into moderation_actions (moderator_user_id, target_user_id, action, reason)
        values (${session.userId}, ${params.userId}, ${input.status}, 'Account status changed from moderation dashboard')
      `;

      await createNotification({
        recipientUserId: params.userId,
        actorUserId: session.userId,
        type: "moderation",
        title:
          input.status === "active"
            ? "Your account is active again"
            : input.status === "suspended"
              ? "Your account has been suspended"
              : "Your account has been banned",
        body:
          input.status === "active"
            ? "You can sign in and use Heartline again."
            : input.status === "suspended"
              ? "Open Settings if you need to review your account status or submit an appeal."
              : "Open Settings if you need to review your account status or submit an appeal.",
        targetPath: "/settings",
        payload: {
          status: input.status,
          targetEmail: targetUser?.email ?? null
        }
      });

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid user status payload."
        });
      }

      return reply.code(403).send({
        message: "Admin access required."
      });
    }
  });

  app.get("/api/moderation/users", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(403).send({
          message: "Admin access required."
        });
      }

      const query = z
        .object({
          q: z.string().trim().max(80).optional()
        })
        .parse(request.query);
      const term = query.q?.trim().toLowerCase() ?? "";

      const users = await sql<
        Array<{
          id: string;
          email: string;
          name: string;
          city: string;
          role: string;
          status: string;
          created_at: string;
        }>
      >`
        select id, email, name, city, role, status, created_at
        from users
        where ${term === ""}
          or lower(email) like ${`%${term}%`}
          or lower(name) like ${`%${term}%`}
        order by created_at desc
        limit 50
      `;

      return {
        items: users
      };
    } catch {
      return reply.code(403).send({
        message: "Admin access required."
      });
    }
  });

  app.get("/api/moderation/users/:userId/history", async (request, reply) => {
    try {
      const session = await requireAdmin(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(403).send({
          message: "Admin access required."
        });
      }

      const params = request.params as { userId?: string };

      if (!params.userId) {
        return reply.code(400).send({
          message: "User id is required."
        });
      }

      const actions = await sql<
        Array<{
          id: string;
          action: string;
          reason: string | null;
          details: string | null;
          created_at: string;
          moderator_name: string;
        }>
      >`
        select
          ma.id,
          ma.action,
          ma.reason,
          ma.details,
          ma.created_at,
          moderator.name as moderator_name
        from moderation_actions ma
        join users moderator on moderator.id = ma.moderator_user_id
        where ma.target_user_id = ${params.userId}
        order by ma.created_at desc
      `;

      const reports = await sql<
        Array<{
          id: string;
          reason: string;
          details: string | null;
          status: string;
          created_at: string;
        }>
      >`
        select id, reason, details, status, created_at
        from reports
        where target_user_id = ${params.userId}
        order by created_at desc
      `;

      return {
        actions,
        reports
      };
    } catch {
      return reply.code(403).send({
        message: "Admin access required."
      });
    }
  });

  app.post("/api/appeals", async (request, reply) => {
    try {
      const session = await requireSessionWithStatuses(app, request.cookies.heartline_token, [
        "suspended",
        "banned"
      ]);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = z
        .object({
          message: z.string().trim().min(20).max(1000)
        })
        .parse(request.body);

      await sql`
        insert into appeal_requests (user_id, message)
        values (${session.userId}, ${input.message})
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid appeal payload."
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });
}
