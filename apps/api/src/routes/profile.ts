import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../auth";
import { env } from "../config";
import { sql } from "../db";

const genderSchema = z.enum(["man", "woman", "non_binary", "prefer_not_to_say"]);
const interestedInSchema = z.enum(["men", "women", "all"]);

const profileSchema = z.object({
  bio: z.string().min(20).max(500),
  relationshipIntent: z.enum(["long_term", "short_term", "figuring_it_out"]),
  gender: genderSchema.refine((value) => value !== "prefer_not_to_say", {
    message: "Please select an option."
  }),
  interestedIn: z.array(interestedInSchema).min(1).max(3),
  prompts: z
    .array(
      z.object({
        question: z.string().min(5).max(120),
        answer: z.string().min(10).max(240)
      })
    )
    .min(2)
    .max(3),
  interests: z.array(z.string().min(2).max(40)).min(3).max(8)
});
const reorderPhotosSchema = z.object({
  photoUrls: z.array(z.string().url()).min(1).max(6)
});

type ProfileRow = {
  user_id: string;
  bio: string;
  relationship_intent: "long_term" | "short_term" | "figuring_it_out";
  gender: z.infer<typeof genderSchema>;
  interested_in: Array<z.infer<typeof interestedInSchema>>;
  prompts: Array<{ question: string; answer: string }> | string;
  interests: string[];
  photo_path: string | null;
  photo_paths: string[];
  voice_intro_path: string | null;
  verification_status: "unverified" | "pending" | "verified";
  created_at: string;
  updated_at: string;
};

function normalizePrompts(value: ProfileRow["prompts"]) {
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

function serializeProfile(profile: ProfileRow) {
  return {
    userId: profile.user_id,
    bio: profile.bio,
    relationshipIntent: profile.relationship_intent,
    gender: profile.gender,
    interestedIn: profile.interested_in,
    prompts: normalizePrompts(profile.prompts),
    interests: profile.interests,
    photoUrl: profile.photo_path ? `${env.API_URL}${profile.photo_path}` : null,
    photoUrls: profile.photo_paths.map((photoPath) => `${env.API_URL}${photoPath}`),
    voiceIntroUrl: profile.voice_intro_path ? `${env.API_URL}${profile.voice_intro_path}` : null,
    verificationStatus: profile.verification_status,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };
}

export async function registerProfileRoutes(app: FastifyInstance) {
  app.get("/api/profile", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const [profile] = await sql<ProfileRow[]>`
        select user_id, bio, relationship_intent, gender, interested_in, prompts, interests, photo_path, photo_paths, voice_intro_path, verification_status, created_at, updated_at
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      return {
        profile: profile ? serializeProfile(profile) : null
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.put("/api/profile", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = profileSchema.parse(request.body);

      const [profile] = await sql<ProfileRow[]>`
        insert into dating_profiles (
          user_id,
          bio,
          relationship_intent,
          gender,
          interested_in,
          prompts,
          interests,
          photo_path,
          photo_paths,
          voice_intro_path,
          verification_status
        )
        values (
          ${session.userId},
          ${input.bio},
          ${input.relationshipIntent},
          ${input.gender},
          ${input.interestedIn},
          ${JSON.stringify(input.prompts)}::jsonb,
          ${input.interests},
          (
            select photo_path
            from dating_profiles
            where user_id = ${session.userId}
          ),
          coalesce(
            (
              select photo_paths
              from dating_profiles
              where user_id = ${session.userId}
            ),
            '{}'::text[]
          ),
          (
            select voice_intro_path
            from dating_profiles
            where user_id = ${session.userId}
          ),
          coalesce(
            (
              select verification_status
              from dating_profiles
              where user_id = ${session.userId}
            ),
            'unverified'
          )
        )
        on conflict (user_id)
        do update set
          bio = excluded.bio,
          relationship_intent = excluded.relationship_intent,
          gender = excluded.gender,
          interested_in = excluded.interested_in,
          prompts = excluded.prompts,
          interests = excluded.interests,
          updated_at = now()
        returning user_id, bio, relationship_intent, gender, interested_in, prompts, interests, photo_path, photo_paths, voice_intro_path, verification_status, created_at, updated_at
      `;

      return {
        profile: serializeProfile(profile)
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.issues[0];

        return reply.code(400).send({
          message: issue?.message ?? "Invalid profile payload.",
          field: issue?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/profile/photo", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const upload = await request.file();

      if (!upload) {
        return reply.code(400).send({
          message: "Photo is required."
        });
      }

      if (!upload.mimetype.startsWith("image/")) {
        return reply.code(400).send({
          message: "Please upload an image file."
        });
      }

      const extension = upload.filename.includes(".")
        ? upload.filename.slice(upload.filename.lastIndexOf(".")).toLowerCase()
        : upload.mimetype === "image/png"
          ? ".png"
          : upload.mimetype === "image/webp"
            ? ".webp"
            : ".jpg";
      const fileName = `${session.userId}-${randomUUID()}${extension}`;
      const relativePath = `/uploads/profile-photos/${fileName}`;
      const absoluteDir = path.resolve(process.cwd(), "uploads", "profile-photos");
      const absolutePath = path.join(absoluteDir, fileName);
      const fileBuffer = await upload.toBuffer();

      await mkdir(absoluteDir, {
        recursive: true
      });

      const [existingProfile] = await sql<Array<{ photo_path: string | null }>>`
        select photo_path
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      await writeFile(absolutePath, fileBuffer);

      await sql`
        insert into dating_profiles (
          user_id,
          bio,
          relationship_intent,
          gender,
          interested_in,
          prompts,
          interests,
          photo_path,
          verification_status
        )
        values (
          ${session.userId},
          '',
          'long_term',
          'prefer_not_to_say',
          ${[]}::text[],
          ${JSON.stringify([])}::jsonb,
          ${[]}::text[],
          ${relativePath},
          'unverified'
        )
        on conflict (user_id)
        do update set
          photo_path = excluded.photo_path,
          photo_paths = case
            when dating_profiles.photo_paths is null then array[excluded.photo_path]
            when excluded.photo_path = any(dating_profiles.photo_paths) then dating_profiles.photo_paths
            else array_prepend(excluded.photo_path, dating_profiles.photo_paths)
          end,
          updated_at = now()
      `;

      if (existingProfile?.photo_path) {
        const previousPath = path.resolve(
          process.cwd(),
          existingProfile.photo_path.replace(/^\/uploads\//, "uploads/")
        );

        if (previousPath !== absolutePath) {
          await rm(previousPath, {
            force: true
          });
        }
      }

      const [updatedProfile] = await sql<Array<{ photo_paths: string[] }>>`
        select photo_paths
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      return {
        photoUrl: `${env.API_URL}${relativePath}`,
        photoUrls: (updatedProfile?.photo_paths ?? []).map(
          (photoPath) => `${env.API_URL}${photoPath}`
        )
      };
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("file too large")) {
        return reply.code(400).send({
          message: "Photo must be 5MB or smaller."
        });
      }

      return reply.code(400).send({
        message: "Could not upload photo."
      });
    }
  });

  app.post("/api/profile/voice-intro", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const upload = await request.file();

      if (!upload) {
        return reply.code(400).send({
          message: "Voice intro is required."
        });
      }

      if (!upload.mimetype.startsWith("audio/")) {
        return reply.code(400).send({
          message: "Please upload an audio file."
        });
      }

      const extension = upload.filename.includes(".")
        ? upload.filename.slice(upload.filename.lastIndexOf(".")).toLowerCase()
        : upload.mimetype === "audio/webm"
          ? ".webm"
          : upload.mimetype === "audio/ogg"
            ? ".ogg"
            : upload.mimetype === "audio/wav"
              ? ".wav"
              : ".mp3";
      const fileName = `${session.userId}-${randomUUID()}${extension}`;
      const relativePath = `/uploads/voice-intros/${fileName}`;
      const absoluteDir = path.resolve(process.cwd(), "uploads", "voice-intros");
      const absolutePath = path.join(absoluteDir, fileName);
      const fileBuffer = await upload.toBuffer();

      await mkdir(absoluteDir, {
        recursive: true
      });

      const [existingProfile] = await sql<Array<{ voice_intro_path: string | null }>>`
        select voice_intro_path
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      await writeFile(absolutePath, fileBuffer);

      await sql`
        insert into dating_profiles (
          user_id,
          bio,
          relationship_intent,
          gender,
          interested_in,
          prompts,
          interests,
          voice_intro_path,
          verification_status
        )
        values (
          ${session.userId},
          '',
          'long_term',
          'prefer_not_to_say',
          ${[]}::text[],
          ${JSON.stringify([])}::jsonb,
          ${[]}::text[],
          ${relativePath},
          'unverified'
        )
        on conflict (user_id)
        do update set
          voice_intro_path = excluded.voice_intro_path,
          updated_at = now()
      `;

      if (existingProfile?.voice_intro_path) {
        const previousPath = path.resolve(
          process.cwd(),
          existingProfile.voice_intro_path.replace(/^\/uploads\//, "uploads/")
        );

        if (previousPath !== absolutePath) {
          await rm(previousPath, {
            force: true
          });
        }
      }

      return {
        voiceIntroUrl: `${env.API_URL}${relativePath}`
      };
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("file too large")) {
        return reply.code(400).send({
          message: "Voice intro must be 12MB or smaller."
        });
      }

      return reply.code(400).send({
        message: "Could not upload voice intro."
      });
    }
  });

  app.post("/api/profile/verification/request", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const [profile] = await sql<Array<{ photo_path: string | null; verification_status: string }>>`
        select photo_path, verification_status
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      if (!profile?.photo_path) {
        return reply.code(400).send({
          message: "Add at least one profile photo before requesting verification."
        });
      }

      await sql`
        update dating_profiles
        set
          verification_status = case
            when verification_status = 'verified' then verification_status
            else 'pending'
          end,
          updated_at = now()
        where user_id = ${session.userId}
      `;

      const [updatedProfile] = await sql<ProfileRow[]>`
        select user_id, bio, relationship_intent, gender, interested_in, prompts, interests, photo_path, photo_paths, voice_intro_path, verification_status, created_at, updated_at
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      return {
        profile: updatedProfile ? serializeProfile(updatedProfile) : null
      };
    } catch {
      return reply.code(400).send({
        message: "Could not request verification."
      });
    }
  });

  app.post("/api/profile/photos/:photoId/primary", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { photoId?: string };

      if (!params.photoId) {
        return reply.code(400).send({
          message: "Photo id is required."
        });
      }

      const [profile] = await sql<Array<{ photo_paths: string[] }>>`
        select photo_paths
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      const nextPrimary = (profile?.photo_paths ?? []).find((photoPath) =>
        photoPath.includes(params.photoId!)
      );

      if (!nextPrimary) {
        return reply.code(404).send({
          message: "Photo not found."
        });
      }

      await sql`
        update dating_profiles
        set
          photo_path = ${nextPrimary},
          photo_paths = array_prepend(
            ${nextPrimary},
            array(
              select photo
              from unnest(photo_paths) as photo
              where photo <> ${nextPrimary}
            )
          ),
          updated_at = now()
        where user_id = ${session.userId}
      `;

      return {
        ok: true
      };
    } catch {
      return reply.code(400).send({
        message: "Could not update primary photo."
      });
    }
  });

  app.post("/api/profile/photos/:photoId/remove", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { photoId?: string };

      if (!params.photoId) {
        return reply.code(400).send({
          message: "Photo id is required."
        });
      }

      const [profile] = await sql<Array<{ photo_path: string | null; photo_paths: string[] }>>`
        select photo_path, photo_paths
        from dating_profiles
        where user_id = ${session.userId}
        limit 1
      `;

      const targetPath = (profile?.photo_paths ?? []).find((photoPath) =>
        photoPath.includes(params.photoId!)
      );

      if (!targetPath) {
        return reply.code(404).send({
          message: "Photo not found."
        });
      }

      const remainingPhotoPaths = (profile?.photo_paths ?? []).filter(
        (photoPath) => photoPath !== targetPath
      );

      await sql`
        update dating_profiles
        set
          photo_path = ${remainingPhotoPaths[0] ?? null},
          photo_paths = ${remainingPhotoPaths},
          updated_at = now()
        where user_id = ${session.userId}
      `;

      const absolutePath = path.resolve(
        process.cwd(),
        targetPath.replace(/^\/uploads\//, "uploads/")
      );

      await rm(absolutePath, {
        force: true
      });

      return {
        ok: true
      };
    } catch {
      return reply.code(400).send({
        message: "Could not remove photo."
      });
    }
  });

  app.post("/api/profile/photos/reorder", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const input = reorderPhotosSchema.parse(request.body);
      const relativePaths = input.photoUrls.map((photoUrl) => photoUrl.replace(env.API_URL, ""));

      await sql`
        update dating_profiles
        set
          photo_path = ${relativePaths[0] ?? null},
          photo_paths = ${relativePaths},
          updated_at = now()
        where user_id = ${session.userId}
      `;

      return {
        ok: true
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid photo order payload."
        });
      }

      return reply.code(400).send({
        message: "Could not reorder photos."
      });
    }
  });
}
