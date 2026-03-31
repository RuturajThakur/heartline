import { sql } from "./db";

export async function createNotification(input: {
  recipientUserId: string;
  actorUserId?: string | null;
  type: "like" | "match" | "message" | "moderation" | "system";
  title: string;
  body: string;
  targetPath: string;
  photoPath?: string | null;
  payload?: Record<string, unknown>;
}) {
  await sql`
    insert into notifications (
      recipient_user_id,
      actor_user_id,
      type,
      title,
      body,
      target_path,
      photo_path,
      payload
    )
    values (
      ${input.recipientUserId},
      ${input.actorUserId ?? null},
      ${input.type},
      ${input.title},
      ${input.body},
      ${input.targetPath},
      ${input.photoPath ?? null},
      ${JSON.stringify(input.payload ?? {})}::jsonb
    )
  `;
}
