import postgres from "postgres";
import { env } from "./config";

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20
});

export async function ensureDatabase() {
  await sql`create extension if not exists pgcrypto`;

  await sql`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      name text not null,
      birth_date date not null,
      city text not null,
      latitude double precision,
      longitude double precision,
      role text not null default 'user',
      status text not null default 'active',
      session_version integer not null default 1,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    alter table users
    add column if not exists role text not null default 'user'
  `;

  await sql`
    alter table users
    add column if not exists session_version integer not null default 1
  `;

  await sql`
    alter table users
    add column if not exists status text not null default 'active'
  `;

  await sql`
    alter table users
    add column if not exists latitude double precision
  `;

  await sql`
    alter table users
    add column if not exists longitude double precision
  `;

  await sql`
    create table if not exists dating_profiles (
      user_id uuid primary key references users(id) on delete cascade,
      bio text not null,
      relationship_intent text not null,
      gender text not null,
      interested_in text[] not null,
      prompts jsonb not null,
      interests text[] not null,
      photo_path text,
      photo_paths text[] not null default '{}'::text[],
      voice_intro_path text,
      verification_status text not null default 'unverified',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    alter table dating_profiles
    add column if not exists photo_path text
  `;

  await sql`
    alter table dating_profiles
    add column if not exists photo_paths text[] not null default '{}'::text[]
  `;

  await sql`
    alter table dating_profiles
    add column if not exists voice_intro_path text
  `;

  await sql`
    alter table dating_profiles
    add column if not exists verification_status text not null default 'unverified'
  `;

  await sql`
    update dating_profiles
    set photo_paths = case
      when photo_path is not null and not (photo_path = any(photo_paths)) then array_prepend(photo_path, photo_paths)
      when photo_paths is null then case when photo_path is null then '{}'::text[] else array[photo_path] end
      else photo_paths
    end
  `;

  await sql`
    create table if not exists likes (
      actor_user_id uuid not null references users(id) on delete cascade,
      target_user_id uuid not null references users(id) on delete cascade,
      reaction_type text,
      reaction_note text,
      created_at timestamptz not null default now(),
      primary key (actor_user_id, target_user_id)
    )
  `;

  await sql`
    alter table likes
    add column if not exists reaction_type text
  `;

  await sql`
    alter table likes
    add column if not exists reaction_note text
  `;

  await sql`
    create table if not exists passes (
      actor_user_id uuid not null references users(id) on delete cascade,
      target_user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (actor_user_id, target_user_id)
    )
  `;

  await sql`
    create table if not exists saved_profiles (
      actor_user_id uuid not null references users(id) on delete cascade,
      target_user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (actor_user_id, target_user_id),
      check (actor_user_id <> target_user_id)
    )
  `;

  await sql`
    create table if not exists matches (
      id uuid primary key default gen_random_uuid(),
      user_a uuid not null references users(id) on delete cascade,
      user_b uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      unique (user_a, user_b),
      check (user_a <> user_b)
    )
  `;

  await sql`
    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      match_id uuid not null unique references matches(id) on delete cascade,
      user_a uuid not null references users(id) on delete cascade,
      user_b uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (user_a <> user_b)
    )
  `;

  await sql`
    create table if not exists messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      sender_user_id uuid not null references users(id) on delete cascade,
      content text not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists message_attachments (
      id uuid primary key default gen_random_uuid(),
      message_id uuid not null references messages(id) on delete cascade,
      file_path text not null,
      original_name text not null,
      mime_type text not null,
      file_size integer not null,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists conversation_reads (
      conversation_id uuid not null references conversations(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      last_read_at timestamptz not null default now(),
      primary key (conversation_id, user_id)
    )
  `;

  await sql`
    create table if not exists blocks (
      blocker_user_id uuid not null references users(id) on delete cascade,
      blocked_user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (blocker_user_id, blocked_user_id),
      check (blocker_user_id <> blocked_user_id)
    )
  `;

  await sql`
    create table if not exists reports (
      id uuid primary key default gen_random_uuid(),
      reporter_user_id uuid not null references users(id) on delete cascade,
      target_user_id uuid not null references users(id) on delete cascade,
      reason text not null,
      details text,
      status text not null default 'open',
      moderation_note text,
      moderation_reason text,
      suspension_ends_at timestamptz,
      reviewed_by_user_id uuid references users(id) on delete set null,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      check (reporter_user_id <> target_user_id)
    )
  `;

  await sql`
    create table if not exists notification_states (
      user_id uuid not null references users(id) on delete cascade,
      notification_id text not null,
      read_at timestamptz,
      dismissed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (user_id, notification_id)
    )
  `;

  await sql`
    create table if not exists notifications (
      id uuid primary key default gen_random_uuid(),
      recipient_user_id uuid not null references users(id) on delete cascade,
      actor_user_id uuid references users(id) on delete set null,
      type text not null,
      title text not null,
      body text not null,
      target_path text not null,
      photo_path text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists moderation_actions (
      id uuid primary key default gen_random_uuid(),
      moderator_user_id uuid not null references users(id) on delete cascade,
      target_user_id uuid not null references users(id) on delete cascade,
      action text not null,
      reason text,
      details text,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists appeal_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      status text not null default 'open',
      message text not null,
      created_at timestamptz not null default now(),
      reviewed_at timestamptz,
      reviewed_by_user_id uuid references users(id) on delete set null
    )
  `;

  await sql`
    alter table reports
    add column if not exists status text not null default 'open'
  `;

  await sql`
    alter table reports
    add column if not exists moderation_note text
  `;

  await sql`
    alter table reports
    add column if not exists reviewed_by_user_id uuid references users(id) on delete set null
  `;

  await sql`
    alter table reports
    add column if not exists reviewed_at timestamptz
  `;

  await sql`
    alter table reports
    add column if not exists moderation_reason text
  `;

  await sql`
    alter table reports
    add column if not exists suspension_ends_at timestamptz
  `;

  await sql`
    insert into conversations (match_id, user_a, user_b)
    select m.id, m.user_a, m.user_b
    from matches m
    on conflict (match_id) do nothing
  `;
}
