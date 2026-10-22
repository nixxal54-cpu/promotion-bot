import { Context } from 'grammy';
import { AppConfig } from '../config.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('admin-auth');

export async function isUserAdmin(ctx: Context, config: AppConfig): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) {
    return false;
  }

  // 1. Check configured allowlist
  if (config.adminUserIds.includes(userId)) {
    return true;
  }

  // 2. If inside a group/supergroup, check Telegram member permissions
  const chatType = ctx.chat?.type;
  if (chatType === 'group' || chatType === 'supergroup') {
    try {
      const member = await ctx.getChatMember(userId);
      if (member.status === 'creator' || member.status === 'administrator') {
        return true;
      }
    } catch (err) {
      logger.warn('Failed to verify group administrator status with Telegram API', {
        userId,
        chatId: ctx.chat?.id,
        error: (err as Error).message,
      });
    }
  }

  return false;
}
