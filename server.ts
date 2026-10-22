import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './src/config.js';
import { createStorage } from './src/storage/index.js';
import { PromotionService } from './src/promotions/promotionService.js';
import { createTelegramBot } from './src/bot/createBot.js';
import { createHttpServer } from './src/webhook/server.js';
import { createLogger } from './src/logging/logger.js';
import { Bot } from 'grammy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('server');

async function startServer() {
  const config = loadConfig();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize storage
  const storage = createStorage(config);
  await storage.init();

  // Initialize promotion coordinator
  const promotionService = new PromotionService(storage, config);

  // Initialize bot if token exists
  let bot: Bot | null = null;
  if (config.botToken) {
    try {
      bot = createTelegramBot(config, storage, promotionService);
      logger.info('Telegram Bot initialized.');

      if (config.runMode === 'webhook' && config.webhookUrl) {
        const webhookTarget = `${config.webhookUrl.replace(/\/$/, '')}/api/webhook/telegram`;
        logger.info(`Setting up Telegram Webhook to: ${webhookTarget}`);
        await bot.api.setWebhook(webhookTarget, {
          secret_token: config.webhookSecret || undefined,
          allowed_updates: ['message', 'callback_query'],
        });
        logger.info('Telegram Webhook successfully registered.');
      } else if (config.runMode === 'polling') {
        logger.info('Starting Telegram Bot in polling mode...');
        bot.start({
          allowed_updates: ['message', 'callback_query'],
          onStart: (botInfo) => {
            logger.info(`Bot @${botInfo.username} polling active.`);
          },
        }).catch((err) => {
          logger.error('Polling error:', { error: (err as Error).message });
        });
      }
    } catch (err) {
      logger.error('Could not initialize Telegram bot:', { error: (err as Error).message });
    }
  }

  // Create Express app with webhook and API routes
  const app = createHttpServer(config, storage, promotionService, bot);

  // In development, hook Vite dev middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend in production if built
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`🚀 Movie Promo Bot service ready on http://0.0.0.0:${port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully closing server...`);
    server.close(async () => {
      if (bot && config.runMode === 'polling') {
        await bot.stop();
      }
      await storage.close();
      logger.info('Graceful shutdown finished.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error('Failed to start server:', { error: err.message, stack: err.stack });
  process.exit(1);
});
