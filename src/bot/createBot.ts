import { Bot } from 'grammy';
import { AppConfig } from '../config.js';
import { StorageInterface } from '../storage/interface.js';
import { PromotionService } from '../promotions/promotionService.js';
import { registerBotCommands } from './commands.js';
import { handleIncomingMessage } from './messageHandler.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('telegram-bot');

export function createTelegramBot(
  config: AppConfig,
  storage: StorageInterface,
  promotionService: PromotionService
): Bot {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN is missing. Provide a valid Telegram Bot token.');
  }

  const bot = new Bot(config.botToken);

  // Global error handler so routine malformed messages don't crash the server
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error(`Error processing update ${ctx.update.update_id}:`, {
      error: err.error instanceof Error ? err.error.message : String(err.error),
    });
  });

  // Register commands (/start, /help, /connect, /promo_status, /promo_count, /promo_off, /promo_on, /promo_reset, /diagnostics)
  registerBotCommands(bot, storage, config);

  // Register message handler for group movie title detection
  bot.on('message:text', async (ctx) => {
    await handleIncomingMessage(ctx, config, promotionService);
  });

  return bot;
}
