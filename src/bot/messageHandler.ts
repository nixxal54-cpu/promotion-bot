import { Context } from 'grammy';
import { AppConfig } from '../config.js';
import { PromotionService } from '../promotions/promotionService.js';
import { detectMovieRequest } from '../detection/movieRequestDetector.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('message-handler');

export async function handleIncomingMessage(
  ctx: Context,
  config: AppConfig,
  promotionService: PromotionService
): Promise<void> {
  const message = ctx.message;
  if (!message) {
    return; // Service update, callback query, or non-message update
  }

  // 1. Ignore messages from bots (critical: ignores third-party movie bot responses)
  if (message.from?.is_bot) {
    return;
  }

  // 2. Ignore bot's own messages
  if (ctx.me && message.from?.id === ctx.me.id) {
    return;
  }

  // 3. Ignore non-text messages (photos, stickers, file uploads, audio, pins, etc.)
  const text = message.text;
  if (!text || typeof text !== 'string') {
    return;
  }

  // 4. Ignore commands (starts with '/')
  if (text.startsWith('/')) {
    return;
  }

  // 5. Restrict monitoring to groups and supergroups only
  const chat = ctx.chat ?? message.chat;
  const chatType = chat?.type;
  if (chatType !== 'group' && chatType !== 'supergroup') {
    // In private chats, we don't count movie requests for promotions
    return;
  }

  // 6. Restrict to configured target group (fail-safe protection)
  const currentChatId = String(chat?.id);
  if (!config.groupId) {
    logger.warn('Incoming group message ignored: GROUP_ID is not configured.');
    return;
  }

  if (currentChatId !== String(config.groupId)) {
    // Message from an unconfigured group: ignore silently
    return;
  }

  // 7. Run heuristic request detection
  const detectionResult = detectMovieRequest(text, {
    minLength: config.detectorMinLength,
    maxLength: config.detectorMaxLength,
    ignoredWords: config.detectorIgnoredWords,
  });

  if (!detectionResult.isMatch) {
    logger.debug('Message did not match movie request criteria', {
      reason: detectionResult.reason,
    });
    return;
  }

  logger.info('Eligible movie request identified', {
    updateId: ctx.update?.update_id,
    confidence: detectionResult.confidence,
    year: detectionResult.detectedYear,
    quality: detectionResult.detectedQuality,
    reason: detectionResult.reason,
  });

  // 8. Process counter increment and potential promotion dispatch
  await promotionService.processEligibleRequest(chat.id, ctx.api, ctx.update?.update_id);
}
