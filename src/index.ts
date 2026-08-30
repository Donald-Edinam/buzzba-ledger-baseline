import { loadConfig } from './core/config.js';
import { log } from './core/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  log.info('boot', { env: config.NODE_ENV });
  // Entry point. Replace once the challenge statement lands.
}

main().catch((error: unknown) => {
  log.error('fatal', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
