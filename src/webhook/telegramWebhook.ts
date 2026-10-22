import { Request, Response } from 'express';
import { Bot } from 'grammy';
import { AppConfig } from '../config.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('telegram-webhook');

/**
 * Express handler for Telegram webhook updates with secret token authentication.
 * Telegram passes the secret token in header: 'X-Telegram-Bot-Api-Secret-Token'
 */
export function createWebhookHandler(bot: Bot | null, config: AppConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    // 1. Verify Secret Token header if configured
    if (config.webhookSecret) {
      const incomingSecret = req.header('X-Telegram-Bot-Api-Secret-Token');
      if (incomingSecret !== config.webhookSecret) {
        logger.warn('Webhook request rejected: invalid secret token header.');
        res.status(401).json({ error: 'Unauthorized: Invalid secret token' });
        return;
      }
    }

    if (!bot) {
      logger.warn('Received webhook update but Bot instance is not configured.');
      res.status(503).json({ error: 'Bot is not running or BOT_TOKEN is missing' });
      return;
    }

    try {
      // Feed update to grammY
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (err) {
      logger.error('Error handling Telegram webhook update:', {
        error: (err as Error).message,
      });
      // Return 200 to Telegram to prevent continuous delivery loops on routine message parsing errors
      res.status(200).send('OK');
    }
  };
}
