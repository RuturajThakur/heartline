import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env"
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  API_URL: z.string().url().default("http://localhost:3001"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5432/heartline"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  TRUST_PROXY: z.coerce.boolean().default(false),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().default("Heartline Admin"),
  ADMIN_CITY: z.string().default("Admin City"),
  ADMIN_BIRTH_DATE: z.string().default("1990-01-01"),
  JWT_SECRET: z.string().min(12, "JWT_SECRET must be at least 12 characters long")
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  API_URL: process.env.API_URL,
  CLIENT_URL: process.env.CLIENT_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  TRUST_PROXY: process.env.TRUST_PROXY,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_NAME: process.env.ADMIN_NAME,
  ADMIN_CITY: process.env.ADMIN_CITY,
  ADMIN_BIRTH_DATE: process.env.ADMIN_BIRTH_DATE,
  JWT_SECRET: process.env.JWT_SECRET ?? "change-me-in-production"
});
