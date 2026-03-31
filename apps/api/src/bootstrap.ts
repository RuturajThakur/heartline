import bcrypt from "bcryptjs";
import { env } from "./config";
import { sql } from "./db";

export async function ensureAdminBootstrap() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const [existingUser] = await sql<Array<{ id: string }>>`
    select id
    from users
    where email = ${env.ADMIN_EMAIL}
    limit 1
  `;

  if (existingUser) {
    await sql`
      update users
      set
        role = 'admin',
        status = 'active'
      where id = ${existingUser.id}
    `;
    return;
  }

  await sql`
    insert into users (
      email,
      password_hash,
      name,
      birth_date,
      city,
      role,
      status
    )
    values (
      ${env.ADMIN_EMAIL},
      ${passwordHash},
      ${env.ADMIN_NAME},
      ${env.ADMIN_BIRTH_DATE},
      ${env.ADMIN_CITY},
      'admin',
      'active'
    )
  `;
}
