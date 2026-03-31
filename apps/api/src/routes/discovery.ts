import { env } from "../config";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../auth";
import { sql } from "../db";

type DiscoveryRow = {
  user_id: string;
  name: string;
  birth_date: string;
  city: string;
  bio: string;
  gender: "man" | "woman" | "non_binary" | "prefer_not_to_say";
  interested_in: Array<"men" | "women" | "all">;
  relationship_intent: "long_term" | "short_term" | "figuring_it_out";
  prompts: Array<{ question: string; answer: string }> | string;
  interests: string[];
  photo_path: string | null;
  photo_paths: string[] | null;
  voice_intro_path: string | null;
  verification_status: "unverified" | "pending" | "verified";
  match_id: string | null;
  saved_at: string | null;
  updated_at: string;
};

function normalizePrompts(value: DiscoveryRow["prompts"]) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  other_user_name: string;
  other_user_photo_path: string | null;
  other_user_photo_paths: string[] | null;
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

const discoveryQuerySchema = z.object({
  minAge: z.coerce.number().int().min(18).max(100).optional(),
  maxAge: z.coerce.number().int().min(18).max(100).optional(),
  city: z.string().trim().max(80).optional(),
  relationshipIntent: z.enum(["long_term", "short_term", "figuring_it_out"]).optional()
});

export async function registerDiscoveryRoutes(app: FastifyInstance) {
  app.get("/api/discovery", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const [viewerProfile] = await sql<
        Array<{
          gender: "man" | "woman" | "non_binary" | "prefer_not_to_say";
          interested_in: Array<"men" | "women" | "all">;
          interests: string[];
          relationship_intent: "long_term" | "short_term" | "figuring_it_out";
        }>
      >`
        select gender, interested_in, interests, relationship_intent
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      if (!viewerProfile) {
        return reply.code(400).send({
          message: "Complete onboarding before using discovery."
        });
      }

      const filters = discoveryQuerySchema.parse(request.query);
      const normalizedCity = filters.city?.trim().toLowerCase() ?? null;

      const profiles = await sql<DiscoveryRow[]>`
        select
          dp.user_id,
          u.name,
          u.birth_date,
          u.city,
          dp.bio,
          dp.gender,
          dp.interested_in,
          dp.relationship_intent,
          dp.prompts,
          dp.interests,
          dp.photo_path,
          dp.photo_paths,
          dp.voice_intro_path,
          dp.verification_status,
          m.id as match_id,
          sp.created_at as saved_at,
          dp.updated_at
        from dating_profiles dp
        join users u on u.id = dp.user_id
        left join matches m
          on (
            (m.user_a = ${session.userId} and m.user_b = dp.user_id)
            or
            (m.user_b = ${session.userId} and m.user_a = dp.user_id)
          )
        left join saved_profiles sp
          on sp.actor_user_id = ${session.userId}
         and sp.target_user_id = dp.user_id
        where dp.user_id <> ${session.userId}
          and not exists (
            select 1
            from blocks b
            where (b.blocker_user_id = ${session.userId} and b.blocked_user_id = dp.user_id)
               or (b.blocker_user_id = dp.user_id and b.blocked_user_id = ${session.userId})
          )
          and not exists (
            select 1
            from likes l
            where l.actor_user_id = ${session.userId}
              and l.target_user_id = dp.user_id
          )
          and not exists (
            select 1
            from passes p
            where p.actor_user_id = ${session.userId}
              and p.target_user_id = dp.user_id
              and p.created_at > now() - interval '14 days'
          )
        order by dp.updated_at desc
        limit 30
      `;

      const filteredProfiles = profiles.filter((profile) => {
        const viewerInterestedIn = viewerProfile.interested_in;
        const candidateInterestedIn = profile.interested_in;
        const age = calculateAge(profile.birth_date);

        const viewerAllowsCandidate =
          viewerInterestedIn.includes("all") ||
          (profile.gender === "man" && viewerInterestedIn.includes("men")) ||
          (profile.gender === "woman" && viewerInterestedIn.includes("women"));

        const candidateAllowsViewer =
          candidateInterestedIn.includes("all") ||
          (viewerProfile.gender === "man" && candidateInterestedIn.includes("men")) ||
          (viewerProfile.gender === "woman" && candidateInterestedIn.includes("women"));

        const ageMatches =
          (filters.minAge === undefined || age >= filters.minAge) &&
          (filters.maxAge === undefined || age <= filters.maxAge);

        const intentMatches =
          !filters.relationshipIntent ||
          profile.relationship_intent === filters.relationshipIntent;

        const cityMatches =
          !normalizedCity || profile.city.trim().toLowerCase().includes(normalizedCity);

        return viewerAllowsCandidate && candidateAllowsViewer && ageMatches && intentMatches && cityMatches;
      });

      const rankedProfiles = filteredProfiles
        .map((profile) => {
          const prompts = normalizePrompts(profile.prompts);
          const candidateAge = calculateAge(profile.birth_date);
          const sharedInterests = profile.interests.filter((interest) =>
            viewerProfile.interests.includes(interest)
          ).length;
          const promptQualityScore = prompts.filter(
            (prompt) => prompt.answer.trim().length >= 20
          ).length;
          const photoCountScore = Math.min(profile.photo_paths?.length ?? 0, 4);
          const profileCompletenessScore =
            (profile.bio.trim().length >= 20 ? 3 : 0) +
            Math.min(profile.interests.length, 4) +
            promptQualityScore;
          const cityScore =
            profile.city.trim().toLowerCase() === normalizedCity || !normalizedCity ? 2 : 0;
          const intentScore =
            profile.relationship_intent === viewerProfile.relationship_intent ? 4 : 1;
          const ageProximityScore = Math.max(0, 6 - Math.floor(Math.abs(candidateAge - 29) / 4));
          const freshnessScore = Math.max(
            0,
            3 -
              Math.floor(
                (Date.now() - new Date(profile.updated_at).getTime()) /
                  (1000 * 60 * 60 * 24 * 7)
              )
          );

          return {
            profile,
            prompts,
            score:
              sharedInterests * 4 +
              cityScore +
              intentScore +
              ageProximityScore +
              profileCompletenessScore +
              photoCountScore +
              freshnessScore
          };
        })
        .sort((left, right) => right.score - left.score);

      return {
        items: rankedProfiles.map(({ profile, prompts }) => ({
          id: profile.user_id,
          name: profile.name,
          age: calculateAge(profile.birth_date),
          city: profile.city,
          bio: profile.bio,
          relationshipIntent: profile.relationship_intent,
          prompt: prompts[0]?.answer ?? "No prompt answer yet.",
          tags: profile.interests,
          photoUrl: profile.photo_path ? `${env.API_URL}${profile.photo_path}` : null,
          photoUrls: (profile.photo_paths ?? []).map((photoPath) => `${env.API_URL}${photoPath}`),
          voiceIntroUrl: profile.voice_intro_path
            ? `${env.API_URL}${profile.voice_intro_path}`
            : null,
          verificationStatus: profile.verification_status,
          saved: Boolean(profile.saved_at),
          matched: Boolean(profile.match_id)
        }))
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid discovery filters."
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.get("/api/discovery/saved", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const profiles = await sql<DiscoveryRow[]>`
        select
          dp.user_id,
          u.name,
          u.birth_date,
          u.city,
          dp.bio,
          dp.gender,
          dp.interested_in,
          dp.relationship_intent,
          dp.prompts,
          dp.interests,
          dp.photo_path,
          dp.photo_paths,
          dp.voice_intro_path,
          dp.verification_status,
          null::uuid as match_id,
          sp.created_at as saved_at,
          dp.updated_at
        from saved_profiles sp
        join dating_profiles dp on dp.user_id = sp.target_user_id
        join users u on u.id = dp.user_id
        where sp.actor_user_id = ${session.userId}
          and not exists (
            select 1
            from blocks b
            where (b.blocker_user_id = ${session.userId} and b.blocked_user_id = dp.user_id)
               or (b.blocker_user_id = dp.user_id and b.blocked_user_id = ${session.userId})
          )
        order by sp.created_at desc
      `;

      return {
        items: profiles.map((profile) => ({
          id: profile.user_id,
          name: profile.name,
          age: calculateAge(profile.birth_date),
          city: profile.city,
          bio: profile.bio,
          relationshipIntent: profile.relationship_intent,
          prompt: normalizePrompts(profile.prompts)[0]?.answer ?? "No prompt answer yet.",
          tags: profile.interests,
          photoUrl: profile.photo_path ? `${env.API_URL}${profile.photo_path}` : null,
          photoUrls: (profile.photo_paths ?? []).map((photoPath) => `${env.API_URL}${photoPath}`),
          voiceIntroUrl: profile.voice_intro_path
            ? `${env.API_URL}${profile.voice_intro_path}`
            : null,
          verificationStatus: profile.verification_status,
          saved: true,
          matched: false
        }))
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/discovery/:targetUserId/save", async (request, reply) => {
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
        insert into saved_profiles (actor_user_id, target_user_id)
        values (${session.userId}, ${params.targetUserId})
        on conflict (actor_user_id, target_user_id) do nothing
      `;

      return {
        ok: true,
        saved: true
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.delete("/api/discovery/:targetUserId/save", async (request, reply) => {
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
        delete from saved_profiles
        where actor_user_id = ${session.userId}
          and target_user_id = ${params.targetUserId}
      `;

      return {
        ok: true,
        saved: false
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/discovery/:targetUserId/pass", async (request, reply) => {
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
        insert into passes (actor_user_id, target_user_id, created_at)
        values (${session.userId}, ${params.targetUserId}, now())
        on conflict (actor_user_id, target_user_id)
        do update set created_at = excluded.created_at
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

  app.get("/api/matches", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const matches = await sql<MatchRow[]>`
        select
          m.id,
          m.user_a,
          m.user_b,
          m.created_at,
          u.name as other_user_name,
          dp.photo_path as other_user_photo_path,
          dp.photo_paths as other_user_photo_paths
        from matches m
        join users u
          on u.id = case
            when m.user_a = ${session.userId} then m.user_b
            else m.user_a
          end
        left join dating_profiles dp
          on dp.user_id = case
            when m.user_a = ${session.userId} then m.user_b
            else m.user_a
          end
        where (m.user_a = ${session.userId} or m.user_b = ${session.userId})
          and not exists (
            select 1
            from blocks b
            where (
              b.blocker_user_id = ${session.userId}
              and b.blocked_user_id = case
                when m.user_a = ${session.userId} then m.user_b
                else m.user_a
              end
            ) or (
              b.blocker_user_id = case
                when m.user_a = ${session.userId} then m.user_b
                else m.user_a
              end
              and b.blocked_user_id = ${session.userId}
            )
          )
        order by m.created_at desc
      `;

      return {
        items: matches.map((match) => ({
          id: match.id,
          createdAt: match.created_at,
          otherUserId: match.user_a === session.userId ? match.user_b : match.user_a,
          otherUserName: match.other_user_name,
          otherUserPhotoUrl: match.other_user_photo_path
            ? `${env.API_URL}${match.other_user_photo_path}`
            : null,
          otherUserPhotoUrls: (match.other_user_photo_paths ?? []).map(
            (photoPath) => `${env.API_URL}${photoPath}`
          )
        }))
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });
}
