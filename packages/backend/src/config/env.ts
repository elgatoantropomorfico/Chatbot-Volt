import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  OPENAI_API_KEY: z.string().optional(),

  WHATSAPP_VERIFY_TOKEN: z.string().default('volt-verify-token'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('volt-media'),
  R2_PUBLIC_URL: z.string().optional(),

  PILOT_APPKEY: z.string().optional(),
  PILOT_API_URL: z.string().url().optional(),
  PILOT_SUBORIGIN_ID: z.string().optional(),
  PILOT_PROVIDER_SERVICE: z.string().optional(),
  PILOT_CONTACT_TYPE_ID: z.string().optional(),
  PILOT_BUSINESS_TYPE_DEFAULT: z.string().optional(),
  PILOT_DEBUG: z.string().optional(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_API_BASE: z.string().url().optional(),
  GROQ_WHISPER_MODEL: z.string().optional(),
  GROQ_WHISPER_LANGUAGE: z.string().optional(),

  /** Public base URL of the API (for MP notification_url / back_urls). */
  API_PUBLIC_URL: z.string().url().optional(),

  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
