import { z } from 'zod';
import { AppError } from './result.js';

try {
  process.loadEnvFile();
} catch {
  // .env file is optional
}

/**
 * All environment access happens here and nowhere else. Fails fast at boot with
 * a readable message rather than surfacing `undefined` deep in a code path.
 */
const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', 'Invalid environment configuration', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}
