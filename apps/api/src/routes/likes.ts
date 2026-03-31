import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../auth";
import { env } from "../config";
import { sql } from "../db";
import { createNotification } from "../notifications";
import { publishUserEvent } from "../realtime";

const likeSchema = z.object({
  targetUserId: z.uuid(),
  reactionType: z.enum(["profile", "photo", "bio", "prompt"]).optional(),
  reactionNote: z.string().trim().min(2).max(120).optional()
});

type IncomingLikeRow = {
  actor_user_id: string;
  created_at: string;
  reaction_type: "profile" | "photo" | "bio" | "prompt" | null;
  reaction_note: string | null;
  name: string;
  birth_date: string;
  city: string;
  bio: string;
  relationship_intent: "long_term" | "short_term" | "figuring_it_out";
  interests: string[];
  prompts: Array<{ question: string; answer: string }>;
  photo_path: string | null;
};

function calculateAge(birthDate: string) {
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - dob.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }

  return age;
}

export async function registerLikeRoutes(app: FastifyInstance) {
  app.get("/api/likes/incoming", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const likes = await sql<IncomingLikeRow[]>`
        select
          l.actor_user_id,
          l.created_at,
          l.reaction_type,
          l.reaction_note,
          u.name,
          u.birth_date,
          u.city,
          dp.bio,
          dp.relationship_intent,
          dp.interests,
          dp.prompts,
          dp.photo_path
        from likes l
        join users u on u.id = l.actor_user_id
        join dating_profiles dp on dp.user_id = l.actor_user_id
        where l.target_user_id = ${session.userId}
          and not exists (
            select 1
            from likes reverse_like
            where reverse_like.actor_user_id = ${session.userId}
              and reverse_like.target_user_id = l.actor_user_id
          )
          and not exists (
            select 1
            from matches m
            where (m.user_a = ${session.userId} and m.user_b = l.actor_user_id)
               or (m.user_a = l.actor_user_id and m.user_b = ${session.userId})
          )
          and not exists (
            select 1
            from blocks b
            where (b.blocker_user_id = ${session.userId} and b.blocked_user_id = l.actor_user_id)
               or (b.blocker_user_id = l.actor_user_id and b.blocked_user_id = ${session.userId})
          )
        order by l.created_at desc
      `;

      return {
        items: likes.map((like) => ({
          userId: like.actor_user_id,
          createdAt: like.created_at,
          name: like.name,
          age: calculateAge(like.birth_date),
          city: like.city,
          bio: like.bio,
          relationshipIntent: like.relationship_intent,
          prompt: like.prompts[0]?.answer ?? "No prompt answer yet.",
          tags: like.interests,
          photoUrl: like.photo_path ? `${env.API_URL}${like.photo_path}` : null,
          reactionType: like.reaction_type,
          reactionNote: like.reaction_note
        }))
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/likes/:targetUserId/pass", async (request, reply) => {
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
        delete from likes
        where actor_user_id = ${params.targetUserId}
          and target_user_id = ${session.userId}
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

  app.post("/api/likes", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = likeSchema.parse(request.body);

      if (input.targetUserId === session.userId) {
        return reply.code(400).send({
          message: "You cannot like your own profile."
        });
      }

      const [block] = await sql<Array<{ blocker_user_id: string }>>`
        select blocker_user_id
        from blocks
        where (blocker_user_id = ${session.userId} and blocked_user_id = ${input.targetUserId})
           or (blocker_user_id = ${input.targetUserId} and blocked_user_id = ${session.userId})
        limit 1
      `;

      if (block) {
        return reply.code(400).send({
          message: "This profile is unavailable."
        });
      }

      await sql`
        insert into likes (actor_user_id, target_user_id, reaction_type, reaction_note)
        values (${session.userId}, ${input.targetUserId}, ${input.reactionType ?? null}, ${input.reactionNote ?? null})
        on conflict (actor_user_id, target_user_id)
        do update set
          reaction_type = coalesce(excluded.reaction_type, likes.reaction_type),
          reaction_note = coalesce(excluded.reaction_note, likes.reaction_note)
      `;

      const [actorProfile] = await sql<Array<{ name: string; photo_path: string | null }>>`
        select u.name, dp.photo_path
        from users u
        left join dating_profiles dp on dp.user_id = u.id
        where u.id = ${session.userId}
        limit 1
      `;

      await createNotification({
        recipientUserId: input.targetUserId,
        actorUserId: session.userId,
        type: "like",
        title: `${actorProfile?.name ?? "Someone"} liked your profile`,
        body:
          input.reactionType && input.reactionNote
            ? `${input.reactionNote}`
            : input.reactionType
              ? `${actorProfile?.name ?? "Someone"} reacted to your ${input.reactionType}.`
              : "Open Likes You to decide if you want to like back.",
        targetPath: "/likes",
        photoPath: actorProfile?.photo_path ?? null,
        payload: {
          actorUserId: session.userId,
          reactionType: input.reactionType ?? null,
          reactionNote: input.reactionNote ?? null
        }
      });

      publishUserEvent(input.targetUserId, "notification", {
        scope: "likes"
      });

      const [mutualLike] = await sql<Array<{ actor_user_id: string }>>`
        select actor_user_id
        from likes
        where actor_user_id = ${input.targetUserId}
          and target_user_id = ${session.userId}
        limit 1
      `;

      let matched = false;
      let matchId: string | null = null;

      if (mutualLike) {
        const orderedUsers = [session.userId, input.targetUserId].sort();
        const [match] = await sql<Array<{ id: string }>>`
          insert into matches (user_a, user_b)
          values (${orderedUsers[0]}, ${orderedUsers[1]})
          on conflict (user_a, user_b) do update set user_a = excluded.user_a
          returning id
        `;

        matched = true;
        matchId = match.id;

        await sql`
          insert into conversations (match_id, user_a, user_b)
          values (${match.id}, ${orderedUsers[0]}, ${orderedUsers[1]})
          on conflict (match_id) do nothing
        `;

        await createNotification({
          recipientUserId: session.userId,
          actorUserId: input.targetUserId,
          type: "match",
          title: "You have a new match",
          body: "Open Product to start the conversation.",
          targetPath: "/product",
          payload: {
            matchId
          }
        });
        await createNotification({
          recipientUserId: input.targetUserId,
          actorUserId: session.userId,
          type: "match",
          title: "You have a new match",
          body: "Open Product to start the conversation.",
          targetPath: "/product",
          payload: {
            matchId
          }
        });

        publishUserEvent(session.userId, "notification", {
          scope: "match",
          matchId
        });
        publishUserEvent(input.targetUserId, "notification", {
          scope: "match",
          matchId
        });
      }

      return {
        ok: true,
        matched,
        matchId
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid like payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      request.log.error(error);

      return reply.code(500).send({
        message: "Could not send like."
      });
    }
  });
}
