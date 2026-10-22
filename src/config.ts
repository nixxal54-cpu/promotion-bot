import { createLogger } from './logging/logger.js';

export interface AppConfig {
  botToken: string;
  webhookUrl: string;
  webhookSecret: string;
  groupId: string; // Target Telegram group/supergroup ID (e.g. -1001234567890)
  websiteUrl: string;
  promoThreshold: number;
  promoCooldownMinutes: number;
  adminUserIds: number[];
  databaseUrl?: string;
  sqlitePath: string;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  runMode: 'webhook' | 'polling';
  detectorMinLength: number;
  detectorMaxLength: number;
  detectorIgnoredWords: string[];
}

const logger = createLogger('config');

export function loadConfig(env = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV as AppConfig['nodeEnv']) || 'development';
  const isProduction = nodeEnv === 'production';

  const botToken = env.BOT_TOKEN?.trim() || '';
  const webhookUrl = env.WEBHOOK_URL?.trim() || '';
  const webhookSecret = env.WEBHOOK_SECRET?.trim() || '';
  const groupId = env.GROUP_ID?.replace(/['"]/g, '').trim() || '';
  const websiteUrl = env.WEBSITE_URL?.trim() || 'https://socialmingle.example.com';
  const promoThreshold = parseInt(env.PROMO_THRESHOLD || '10', 10);
  const promoCooldownMinutes = parseInt(env.PROMO_COOLDOWN_MINUTES || '30', 10);

  // Parse comma-separated admin user IDs
  const adminUserIds = (env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n));

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const sqlitePath = env.SQLITE_PATH?.trim() || './data/movie_promo.db';
  const port = parseInt(env.PORT || '3000', 10);
  const runMode = (env.RUN_MODE as AppConfig['runMode']) || (isProduction ? 'webhook' : 'polling');

  const detectorMinLength = parseInt(env.DETECTOR_MIN_LENGTH || '2', 10);
  const detectorMaxLength = parseInt(env.DETECTOR_MAX_LENGTH || '80', 10);

  // Default ignored words (routine group chatter)
  const defaultIgnoredWords = [
    'hi',
    'hello',
    'hey',
    'good morning',
    'good night',
    'thanks',
    'thank you',
    'thx',
    'ok',
    'okay',
    'yes',
    'no',
    'help',
    'admin',
    'rules',
    'anyone online',
    'link',
    'how to download',
    'bot not working',
    'test',
  ];

  const customIgnored = (env.DETECTOR_IGNORED_WORDS || '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

  const detectorIgnoredWords = Array.from(new Set([...defaultIgnoredWords, ...customIgnored]));

  // Validation warnings & production requirements
  if (isProduction) {
    if (!botToken) {
      logger.error('CRITICAL: BOT_TOKEN is required in production.');
    }
    if (runMode === 'webhook' && !webhookUrl) {
      logger.error('CRITICAL: WEBHOOK_URL is required when running in webhook mode.');
    }
    if (runMode === 'webhook' && !webhookSecret) {
      logger.error('CRITICAL: WEBHOOK_SECRET is required to secure Telegram webhooks.');
    }
    if (!groupId) {
      logger.warn('WARNING: GROUP_ID is not set. Bot will refuse group monitoring to prevent accidental promotion in arbitrary groups.');
    }
  }

  return {
    botToken,
    webhookUrl,
    webhookSecret,
    groupId,
    websiteUrl,
    promoThreshold: isNaN(promoThreshold) || promoThreshold < 1 ? 10 : promoThreshold,
    promoCooldownMinutes: isNaN(promoCooldownMinutes) || promoCooldownMinutes < 0 ? 30 : promoCooldownMinutes,
    adminUserIds,
    databaseUrl,
    sqlitePath,
    nodeEnv,
    port: isNaN(port) ? 3000 : port,
    runMode,
    detectorMinLength,
    detectorMaxLength,
    detectorIgnoredWords,
  };
}
