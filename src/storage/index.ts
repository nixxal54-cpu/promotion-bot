import { AppConfig } from '../config.js';
import { StorageInterface } from './interface.js';
import { SqliteStorage } from './sqlite.js';
import { PostgresStorage } from './postgres.js';
import { MemoryStorage } from './memory.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('storage-factory');

export function createStorage(config: AppConfig): StorageInterface {
  if (config.databaseUrl) {
    logger.info('Configuring PostgreSQL storage from DATABASE_URL');
    return new PostgresStorage(config.databaseUrl, config.promoThreshold, config.promoCooldownMinutes);
  }

  if (config.nodeEnv === 'test') {
    logger.info('Configuring Memory storage for test environment');
    return new MemoryStorage({
      promoThreshold: config.promoThreshold,
      promoCooldownMinutes: config.promoCooldownMinutes,
    });
  }

  logger.info(`Configuring SQLite storage at ${config.sqlitePath}`);
  return new SqliteStorage(config.sqlitePath, config.promoThreshold, config.promoCooldownMinutes);
}

export * from './interface.js';
export * from './sqlite.js';
export * from './postgres.js';
export * from './memory.js';
