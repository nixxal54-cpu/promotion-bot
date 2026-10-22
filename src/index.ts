import { loadConfig } from './config.js';
import { createStorage } from './storage/index.js';
import { PromotionService } from './promotions/promotionService.js';
import { createTelegramBot } from './bot/createBot.js';
import { createHttpServer } from './webhook/server.js';
import { createLogger } from './logging/logger.js';
import { Bot } from 'grammy';

const logger = createLogger('main');

export async function bootstrap() {
  const config = loadConfig();
  logger.info(`Starting Movie Promo Bot in ${config.nodeEnv} mode [RunMode: ${config.runMode}]`);

  // 1. Initialize persistent storage
  const storage = createStorage(config);
  await storage.init();

  // 2. Initialize Promotion Service
  const promotionService = new PromotionService(storage, config);

  // 3. Initialize Telegram Bot if token is present
  let bot: Bot | null = null;
  if (config.botToken) {
    try {
      bot = createTelegramBot(config, storage, promotionService);
      logger.info('Telegram Bot initialized.');

      if (config.runMode === 'webhook') {
        if (config.webhookUrl) {
          const webhookTarget = `${config.webhookUrl.replace(/\/$/, '')}/api/webhook/telegram`;
          logger.info(`Setting up Telegram Webhook to: ${webhookTarget}`);
          await bot.api.setWebhook(webhookTarget, {
            secret_token: config.webhookSecret || undefined,
            allowed_updates: ['message', 'callback_query'],
          });
          logger.info('Telegram Webhook successfully registered.');
        } else {
          logger.warn('WEBHOOK_URL is not set. Webhook registration skipped; listening on local endpoint.');
        }
      } else if (config.runMode === 'polling') {
        logger.info('Starting bot in local polling mode...');
        // Start polling in background
        bot.start({
          allowed_updates: ['message', 'callback_query'],
          onStart: (botInfo) => {
            logger.info(`Bot @${botInfo.username} started successfully via polling.`);
          },
        }).catch((err) => {
          logger.error('Error during Telegram bot polling:', { error: (err as Error).message });
        });
      }
    } catch (err) {
      logger.error('Failed to initialize Telegram Bot:', { error: (err as Error).message });
    }
  } else {
    logger.warn('BOT_TOKEN is not configured. Running HTTP server and simulator dashboard in sandbox mode.');
  }

  // 4. Create Express app
  const app = createHttpServer(config, storage, promotionService, bot);

  return { app, bot, storage, promotionService, config };
}

// Direct execution entry point
if (process.env.NODE_ENV !== 'test') {
  bootstrap()
    .then(({ app, config, storage, bot }) => {
      const server = app.listen(config.port, '0.0.0.0', () => {
        logger.info(`HTTP Webhook & Management server listening on port ${config.port}`);
      });

      // Graceful shutdown handling
      const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        server.close(async () => {
          if (bot && config.runMode === 'polling') {
            await bot.stop();
          }
          await storage.close();
          logger.info('Server and storage shutdown complete.');
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('Fatal bootstrap error:', { error: (err as Error).message, stack: err.stack });
      process.exit(1);
    });
}
