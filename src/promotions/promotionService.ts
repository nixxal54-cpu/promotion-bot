import { Api, RawApi } from 'grammy';
import { StorageInterface } from '../storage/interface.js';
import { AppConfig } from '../config.js';
import { buildPromotionMessage } from './promotionMessage.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('promotion-service');

export interface PromotionSendResult {
  triggered: boolean;
  success?: boolean;
  messageId?: number;
  error?: string;
  count: number;
  reason: string;
}

export class PromotionService {
  private storage: StorageInterface;
  private config: AppConfig;
  private isSending = false; // in-process mutex guard against concurrent sends

  constructor(storage: StorageInterface, config: AppConfig) {
    this.storage = storage;
    this.config = config;
  }

  /**
   * Processes an eligible movie request update:
   * 1. Atomically increments counter and checks threshold & cooldown.
   * 2. If promo is triggered, sends promotional message via Telegram API.
   * 3. Resets counter ONLY after successful message delivery.
   */
  async processEligibleRequest(
    chatId: number | string,
    api: Api<RawApi>,
    updateId?: number
  ): Promise<PromotionSendResult> {
    const incResult = await this.storage.incrementRequestCount(
      updateId,
      this.config.promoThreshold,
      this.config.promoCooldownMinutes
    );

    logger.info('Processed eligible movie request', {
      updateId,
      chatId,
      currentCount: incResult.newCount,
      threshold: this.config.promoThreshold,
      promoTriggered: incResult.promoTriggered,
      inCooldown: incResult.inCooldown,
      cooldownRemainingMs: incResult.cooldownRemainingMs,
    });

    if (!incResult.promoTriggered) {
      if (incResult.thresholdReached && incResult.inCooldown) {
        return {
          triggered: false,
          count: incResult.newCount,
          reason: `Threshold reached (${incResult.newCount}/${this.config.promoThreshold}), but promotion is deferred due to active cooldown (${Math.ceil(incResult.cooldownRemainingMs / 60000)}m remaining). Accumulated count preserved.`,
        };
      }

      return {
        triggered: false,
        count: incResult.newCount,
        reason: `Request counted. Progress: ${incResult.newCount}/${this.config.promoThreshold}`,
      };
    }

    // Promo triggered! Check concurrency lock
    if (this.isSending) {
      logger.warn('Concurrent promotion send in progress. Skipping duplicate execution.');
      return {
        triggered: false,
        count: incResult.newCount,
        reason: 'Concurrent send in progress; skipping duplicate trigger.',
      };
    }

    this.isSending = true;
    try {
      logger.info('Threshold reached and cooldown satisfied. Delivering promotional message to Telegram...', {
        chatId,
        threshold: this.config.promoThreshold,
      });

      const promoPayload = buildPromotionMessage(this.config.websiteUrl);

      // Send via Telegram Bot API
      const sentMessage = await api.sendMessage(chatId, promoPayload.text, {
        parse_mode: promoPayload.parse_mode,
        link_preview_options: promoPayload.link_preview_options,
      });

      // ONLY reset counter after successful message dispatch!
      await this.storage.recordSuccessfulPromotion();

      logger.info('Promotional message successfully delivered and state committed.', {
        chatId,
        messageId: sentMessage.message_id,
      });

      return {
        triggered: true,
        success: true,
        messageId: sentMessage.message_id,
        count: 0,
        reason: 'Promotion sent successfully; counter reset to 0.',
      };
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || 'Unknown Telegram send error';
      logger.error('Failed to deliver promotional message to Telegram. Counter NOT reset.', {
        error: errorMsg,
      });

      // Safely preserve count and log failure
      await this.storage.recordFailedPromotion(errorMsg);

      return {
        triggered: true,
        success: false,
        error: errorMsg,
        count: incResult.newCount,
        reason: `Telegram send failed: ${errorMsg}. Accumulated requests preserved.`,
      };
    } finally {
      this.isSending = false;
    }
  }
}
