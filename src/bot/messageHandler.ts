import { Context } from 'grammy';
import { AppConfig } from '../config.js';
import { PromotionService } from '../promotions/promotionService.js';
import { detectMovieRequest } from '../detection/movieRequestDetector.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('message-handler');

/**
 * Flexible group ID comparison that tolerates Telegram's -100 prefix, signs, and accidental quotes
 */
export function isMatchingGroupId(actualChatId: number | string | undefined, configuredGroupId: string | undefined): boolean {
  if (!actualChatId || !configuredGroupId) return false;

  const actualStr = String(actualChatId).trim();
  const configStr = String(configuredGroupId).replace(/['"]/g, '').trim();

  if (actualStr === configStr) return true;

  const actualNum = Number(actualStr);
  const configNum = Number(configStr);
  if (!isNaN(actualNum) && !isNaN(configNum) && actualNum === configNum) return true;

  const actualDigits = actualStr.replace(/^-100|^-/, '');
  const configDigits = configStr.replace(/^-100|^-/, '');
  if (actualDigits.length >= 7 && actualDigits === configDigits) {
    return true;
  }

  return false;
}

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
    logger.debug('Ignored message: sender is a bot');
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
    logger.debug(`Ignored message: chat type is "${chatType}", not a group or supergroup`);
    return;
  }

  // 6. Restrict to configured target group (fail-safe protection)
  const currentChatId = String(chat?.id);
  logger.info(`Received text message in group ${currentChatId} (${chatType}): "${text.substring(0, 30)}"`);

  if (!config.groupId) {
    logger.warn(`GROUP_ID is not configured in environment! Received message from group ${currentChatId}. Run /diagnostics in your group to obtain the exact ID.`);
    return;
  }

  if (!isMatchingGroupId(chat?.id, config.groupId)) {
    logger.warn(`Ignored message: chat ${currentChatId} does not match configured GROUP_ID "${config.groupId}". Run /diagnostics to verify.`);
    return;
  }

  // 7. Run heuristic request detection
  const detectionResult = detectMovieRequest(text, {
    minLength: config.detectorMinLength,
    maxLength: config.detectorMaxLength,
    ignoredWords: config.detectorIgnoredWords,
  });

  if (!detectionResult.isMatch) {
    logger.info(`Message did not match movie title format: "${text}" (Reason: ${detectionResult.reason})`);
    return;
  }

  logger.info(`Eligible movie request identified: "${text}"`, {
    updateId: ctx.update?.update_id,
    confidence: detectionResult.confidence,
    year: detectionResult.detectedYear,
    quality: detectionResult.detectedQuality,
    reason: detectionResult.reason,
  });

  // 8. Process counter increment and potential promotion dispatch
  await promotionService.processEligibleRequest(chat.id, ctx.api, ctx.update?.update_id);
}
