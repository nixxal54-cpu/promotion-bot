import express, { Express, Request, Response } from 'express';
import { Bot, Api, RawApi } from 'grammy';
import { AppConfig } from '../config.js';
import { StorageInterface } from '../storage/interface.js';
import { PromotionService } from '../promotions/promotionService.js';
import { createWebhookHandler } from './telegramWebhook.js';
import { detectMovieRequest } from '../detection/movieRequestDetector.js';
import { getRecentLogs, createLogger, sanitizeLog } from '../logging/logger.js';

const logger = createLogger('http-server');

export interface ServerContext {
  app: Express;
  bot: Bot | null;
  storage: StorageInterface;
  config: AppConfig;
  promotionService: PromotionService;
}

export function createHttpServer(
  config: AppConfig,
  storage: StorageInterface,
  promotionService: PromotionService,
  bot: Bot | null
): Express {
  const app = express();

  // Parse JSON payloads
  app.use(express.json());

  // Health-check endpoint for Render / monitoring
  app.get('/healthz', async (_req: Request, res: Response) => {
    try {
      // Verify storage responsiveness
      await storage.getState();
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        mode: config.runMode,
        database: config.databaseUrl ? 'postgresql' : 'sqlite',
      });
    } catch (err) {
      res.status(500).json({
        status: 'unhealthy',
        error: (err as Error).message,
      });
    }
  });

  // Telegram Webhook endpoint
  const webhookHandler = createWebhookHandler(bot, config);
  app.post('/api/webhook/telegram', webhookHandler);
  app.post('/webhook', webhookHandler); // Alternative route alias for Render convenience

  // DIAGNOSTICS & MANAGEMENT APIS FOR OPERATOR DASHBOARD

  // Status & metrics
  app.get('/api/status', async (_req: Request, res: Response) => {
    try {
      const state = await storage.getState();
      const logs = await storage.getAuditLogs(15);

      // Safe config summary (no secret leakage!)
      const safeConfig = {
        hasBotToken: Boolean(config.botToken),
        hasWebhookSecret: Boolean(config.webhookSecret),
        hasDatabaseUrl: Boolean(config.databaseUrl),
        groupId: config.groupId || null,
        websiteUrl: config.websiteUrl,
        promoThreshold: config.promoThreshold,
        promoCooldownMinutes: config.promoCooldownMinutes,
        runMode: config.runMode,
        nodeEnv: config.nodeEnv,
        adminCount: config.adminUserIds.length,
      };

      res.json({
        state,
        config: safeConfig,
        auditLogs: logs,
        isBotConnected: Boolean(bot),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Real-time title detection tester
  app.post('/api/test-detector', (req: Request, res: Response) => {
    const { text, minLength, maxLength, ignoredWords } = req.body;
    const result = detectMovieRequest(text, {
      minLength: minLength !== undefined ? parseInt(minLength, 10) : config.detectorMinLength,
      maxLength: maxLength !== undefined ? parseInt(maxLength, 10) : config.detectorMaxLength,
      ignoredWords: ignoredWords ? ignoredWords : config.detectorIgnoredWords,
    });
    res.json(result);
  });

  // Interactive request simulator (allows testing counter, cooldown, deduplication, and promo trigger without live Telegram)
  app.post('/api/simulate-request', async (req: Request, res: Response) => {
    try {
      const {
        text = 'Leo 2023',
        isBot = false,
        updateId = Date.now(),
        chatId = config.groupId || '-1001234567890',
      } = req.body;

      if (isBot) {
        return res.json({
          processed: false,
          reason: 'Ignored: Message sender is a bot.',
        });
      }

      if (text.startsWith('/')) {
        return res.json({
          processed: false,
          reason: 'Ignored: Commands are not counted toward movie promotion threshold.',
        });
      }

      const detection = detectMovieRequest(text, {
        minLength: config.detectorMinLength,
        maxLength: config.detectorMaxLength,
        ignoredWords: config.detectorIgnoredWords,
      });

      if (!detection.isMatch) {
        return res.json({
          processed: false,
          reason: `Filtered out by detector: ${detection.reason}`,
          detection,
        });
      }

      // Mock Telegram API for local simulation if live Bot instance is not connected
      const mockApi = bot
        ? bot.api
        : ({
            sendMessage: async (targetChatId: string | number, msgText: string) => {
              logger.info('Simulated Telegram sendMessage dispatched', { targetChatId });
              return { message_id: Math.floor(Math.random() * 100000), text: msgText };
            },
          } as unknown as Api<RawApi>);

      const result = await promotionService.processEligibleRequest(chatId, mockApi, updateId);
      const updatedState = await storage.getState();

      res.json({
        processed: true,
        detection,
        result,
        updatedState,
      });
    } catch (err) {
      logger.error('Error during simulated request:', { error: (err as Error).message });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Admin Toggle Promo ON/OFF
  app.post('/api/admin/toggle', async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;
      await storage.setPromoEnabled(Boolean(enabled));
      const state = await storage.getState();
      res.json({ success: true, isPromoEnabled: state.isPromoEnabled });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Admin Reset Counter
  app.post('/api/admin/reset', async (req: Request, res: Response) => {
    try {
      const { confirm } = req.body;
      if (!confirm) {
        return res.status(400).json({ error: 'Explicit confirmation required to reset counter' });
      }
      await storage.resetCounter();
      const state = await storage.getState();
      res.json({ success: true, count: state.requestCount });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Recent Sanitized Logs
  app.get('/api/logs', (_req: Request, res: Response) => {
    const rawLogs = getRecentLogs();
    res.json(sanitizeLog(rawLogs));
  });

  return app;
}
