import { env } from "../config";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { requireSession } from "../auth";
import { sql } from "../db";
import { createNotification } from "../notifications";
import { publishUserEvent } from "../realtime";

type ConversationRow = {
  id: string;
  match_id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
  other_user_name: string;
  other_user_photo_path: string | null;
  other_user_photo_paths: string[] | null;
  last_message_content: string | null;
  last_message_created_at: string | null;
  last_message_sender_user_id: string | null;
  last_message_id: string | null;
  last_message_attachment_count: number;
  unread_count: number;
};

type MessageRow = {
  id: string;
  sender_user_id: string;
  content: string;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  file_path: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

const sendMessageSchema = z.object({
  content: z.string().trim().max(500, "Message is too long.").default("")
});

function getAttachmentKind(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "file";
}

function summarizeMessage(content: string, attachmentCount: number) {
  if (content.trim()) {
    return content;
  }

  if (attachmentCount <= 0) {
    return "";
  }

  return attachmentCount === 1 ? "Sent an attachment" : `Sent ${attachmentCount} attachments`;
}

async function getConversationForUser(conversationId: string, userId: string) {
  const [conversation] = await sql<Array<{ id: string }>>`
    select id
    from conversations
    where id = ${conversationId}
      and (${userId} in (user_a, user_b))
      and not exists (
        select 1
        from blocks b
        where (
          b.blocker_user_id = ${userId}
          and b.blocked_user_id = case
            when user_a = ${userId} then user_b
            else user_a
          end
        ) or (
          b.blocker_user_id = case
            when user_a = ${userId} then user_b
            else user_a
          end
          and b.blocked_user_id = ${userId}
        )
      )
    limit 1
  `;

  return conversation ?? null;
}

export async function registerConversationRoutes(app: FastifyInstance) {
  app.get("/api/conversations", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const conversations = await sql<ConversationRow[]>`
        select
          c.id,
          c.match_id,
          c.user_a,
          c.user_b,
          c.updated_at,
          u.name as other_user_name,
          dp.photo_path as other_user_photo_path,
          dp.photo_paths as other_user_photo_paths,
          lm.content as last_message_content,
          lm.created_at as last_message_created_at,
          lm.sender_user_id as last_message_sender_user_id,
          lm.id as last_message_id,
          coalesce(lma.attachment_count, 0) as last_message_attachment_count,
          coalesce(unread.unread_count, 0) as unread_count
        from conversations c
        join users u
          on u.id = case
            when c.user_a = ${session.userId} then c.user_b
            else c.user_a
          end
        left join dating_profiles dp
          on dp.user_id = case
            when c.user_a = ${session.userId} then c.user_b
            else c.user_a
          end
        left join lateral (
          select m.id, m.content, m.created_at, m.sender_user_id
          from messages m
          where m.conversation_id = c.id
          order by m.created_at desc
          limit 1
        ) lm on true
        left join lateral (
          select count(*)::int as attachment_count
          from message_attachments ma
          where ma.message_id = lm.id
        ) lma on true
        left join lateral (
          select count(*)::int as unread_count
          from messages m
          left join conversation_reads cr
            on cr.conversation_id = c.id
           and cr.user_id = ${session.userId}
          where m.conversation_id = c.id
            and m.sender_user_id <> ${session.userId}
            and m.created_at > coalesce(cr.last_read_at, 'epoch'::timestamptz)
        ) unread on true
        where (c.user_a = ${session.userId} or c.user_b = ${session.userId})
          and not exists (
            select 1
            from blocks b
            where (
              b.blocker_user_id = ${session.userId}
              and b.blocked_user_id = case
                when c.user_a = ${session.userId} then c.user_b
                else c.user_a
              end
            ) or (
              b.blocker_user_id = case
                when c.user_a = ${session.userId} then c.user_b
                else c.user_a
              end
              and b.blocked_user_id = ${session.userId}
            )
          )
        order by coalesce(lm.created_at, c.updated_at) desc
      `;

      const items = conversations.map((conversation) => ({
          id: conversation.id,
          matchId: conversation.match_id,
          otherUserId: conversation.user_a === session.userId ? conversation.user_b : conversation.user_a,
          otherUserName: conversation.other_user_name,
          otherUserPhotoUrl: conversation.other_user_photo_path
            ? `${env.API_URL}${conversation.other_user_photo_path}`
            : null,
          otherUserPhotoUrls: (conversation.other_user_photo_paths ?? []).map(
            (photoPath) => `${env.API_URL}${photoPath}`
          ),
          updatedAt: conversation.updated_at,
          lastMessage: summarizeMessage(
            conversation.last_message_content ?? "",
            Number(conversation.last_message_attachment_count) || 0
          ),
          lastMessageAt: conversation.last_message_created_at,
          lastMessageSenderUserId: conversation.last_message_sender_user_id,
          lastMessageHasAttachments: (Number(conversation.last_message_attachment_count) || 0) > 0,
          unreadCount: Number(conversation.unread_count) || 0
        }));

      return {
        items,
        totalUnreadCount: items.reduce((sum, item) => sum + item.unreadCount, 0)
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.get("/api/conversations/:conversationId/messages", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { conversationId?: string };

      if (!params.conversationId) {
        return reply.code(400).send({
          message: "Conversation id is required."
        });
      }

      const conversation = await getConversationForUser(params.conversationId, session.userId);

      if (!conversation) {
        return reply.code(404).send({
          message: "Conversation not found."
        });
      }

      const messages = await sql<MessageRow[]>`
        select id, sender_user_id, content, created_at
        from messages
        where conversation_id = ${params.conversationId}
        order by created_at asc
      `;
      const attachments = messages.length
        ? await sql<AttachmentRow[]>`
            select id, message_id, file_path, original_name, mime_type, file_size, created_at
            from message_attachments
            where message_id in ${sql(messages.map((message) => message.id))}
            order by created_at asc
          `
        : [];

      await sql`
        insert into conversation_reads (conversation_id, user_id, last_read_at)
        values (${params.conversationId}, ${session.userId}, now())
        on conflict (conversation_id, user_id)
        do update set last_read_at = excluded.last_read_at
      `;

      return {
        items: messages.map((message) => ({
          id: message.id,
          senderUserId: message.sender_user_id,
          content: message.content,
          createdAt: message.created_at,
          attachments: attachments
            .filter((attachment) => attachment.message_id === message.id)
            .map((attachment) => ({
              id: attachment.id,
              name: attachment.original_name,
              mimeType: attachment.mime_type,
              kind: getAttachmentKind(attachment.mime_type),
              size: attachment.file_size,
              url: `${env.API_URL}${attachment.file_path}`
            }))
        }))
      };
    } catch {
      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });

  app.post("/api/conversations/:conversationId/messages", async (request, reply) => {
    try {
      const session = await requireSession(app, request.cookies.heartline_token);

      if (!session) {
        return reply.code(401).send({
          message: "Not authenticated."
        });
      }

      const params = request.params as { conversationId?: string };

      if (!params.conversationId) {
        return reply.code(400).send({
          message: "Conversation id is required."
        });
      }

      const conversation = await getConversationForUser(params.conversationId, session.userId);

      if (!conversation) {
        return reply.code(404).send({
          message: "Conversation not found."
        });
      }

      let content = "";
      const uploadedAttachments: Array<{
        filePath: string;
        originalName: string;
        mimeType: string;
        fileSize: number;
      }> = [];

      if (request.isMultipart()) {
        const uploadsRoot = path.resolve(process.cwd(), "uploads", "chat-attachments");

        for await (const part of request.parts()) {
          if (part.type === "file") {
            if (!part.filename) {
              continue;
            }

            const extension = path.extname(part.filename) || "";
            const fileName = `${session.userId}-${randomUUID()}${extension}`;
            const fileBuffer = await part.toBuffer();
            const relativePath = `/uploads/chat-attachments/${fileName}`;
            const absolutePath = path.resolve(process.cwd(), `.${relativePath}`);

            await writeFile(absolutePath, fileBuffer);

            uploadedAttachments.push({
              filePath: relativePath,
              originalName: part.filename,
              mimeType: part.mimetype || "application/octet-stream",
              fileSize: fileBuffer.byteLength
            });
            continue;
          }

          if (part.fieldname === "content") {
            content = String(part.value ?? "");
          }
        }
      } else {
        const input = sendMessageSchema.parse(request.body);
        content = input.content;
      }

      const normalizedContent = content.trim();

      if (!normalizedContent && uploadedAttachments.length === 0) {
        return reply.code(400).send({
          message: "Add a message or at least one attachment."
        });
      }

      const [message] = await sql<Array<{ id: string; sender_user_id: string; content: string; created_at: string }>>`
        insert into messages (conversation_id, sender_user_id, content)
        values (${params.conversationId}, ${session.userId}, ${normalizedContent})
        returning id, sender_user_id, content, created_at
      `;

      if (uploadedAttachments.length > 0) {
        await sql`
          insert into message_attachments ${sql(
            uploadedAttachments.map((attachment) => ({
              message_id: message.id,
              file_path: attachment.filePath,
              original_name: attachment.originalName,
              mime_type: attachment.mimeType,
              file_size: attachment.fileSize
            })),
            "message_id",
            "file_path",
            "original_name",
            "mime_type",
            "file_size"
          )}
        `;
      }

      await sql`
        update conversations
        set updated_at = now()
        where id = ${params.conversationId}
      `;

      const [participants] = await sql<Array<{ user_a: string; user_b: string }>>`
        select user_a, user_b
        from conversations
        where id = ${params.conversationId}
        limit 1
      `;

      if (participants) {
        const recipientUserId =
          participants.user_a === session.userId ? participants.user_b : participants.user_a;

        await createNotification({
          recipientUserId,
          actorUserId: session.userId,
          type: "message",
          title: "You have a new message",
          body:
            summarizeMessage(normalizedContent, uploadedAttachments.length).length > 120
              ? `${summarizeMessage(normalizedContent, uploadedAttachments.length).slice(0, 117)}...`
              : summarizeMessage(normalizedContent, uploadedAttachments.length),
          targetPath: "/inbox",
          payload: {
            conversationId: params.conversationId
          }
        });

        publishUserEvent(recipientUserId, "message", {
          conversationId: params.conversationId
        });
        publishUserEvent(recipientUserId, "notification", {
          scope: "messages",
          conversationId: params.conversationId
        });
      }

      return {
        message: {
          id: message.id,
          senderUserId: message.sender_user_id,
          content: message.content,
          createdAt: message.created_at,
          attachments: uploadedAttachments.map((attachment, index) => ({
            id: `${message.id}-${index}`,
            name: attachment.originalName,
            mimeType: attachment.mimeType,
            kind: getAttachmentKind(attachment.mimeType),
            size: attachment.fileSize,
            url: `${env.API_URL}${attachment.filePath}`
          }))
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          message: error.issues[0]?.message ?? "Invalid message payload.",
          field: error.issues[0]?.path.join(".")
        });
      }

      return reply.code(401).send({
        message: "Not authenticated."
      });
    }
  });
}
