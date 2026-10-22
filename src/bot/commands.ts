import { Bot, Context, InlineKeyboard } from 'grammy';
import { StorageInterface } from '../storage/interface.js';
import { AppConfig } from '../config.js';
import { isUserAdmin } from './adminAuth.js';
import { isMatchingGroupId } from './messageHandler.js';
import { buildConnectMessage, escapeHtml } from '../promotions/promotionMessage.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('bot-commands');

export function registerBotCommands(bot: Bot, storage: StorageInterface, config: AppConfig): void {
  // /start
  bot.command('start', async (ctx: Context) => {
    const welcomeText = [
      '👋 <b>Movie Promo Bot</b>',
      '',
      'This bot monitors eligible movie requests in the configured group and periodically introduces our social-connection platform.',
      '',
      '<b>Available commands:</b>',
      '• /connect - Learn about our community and website',
      '• /promo_count - View current movie request progress',
      '• /promo_status - View full promo engine status',
      '• /help - View detailed commands and privacy instructions',
    ].join('\n');

    await ctx.reply(welcomeText, { parse_mode: 'HTML' });
  });

  // /connect
  bot.command('connect', async (ctx: Context) => {
    const connectMsg = buildConnectMessage(config.websiteUrl);
    await ctx.reply(connectMsg.text, {
      parse_mode: connectMsg.parse_mode,
      link_preview_options: connectMsg.link_preview_options,
    });
  });

  // /help
  bot.command('help', async (ctx: Context) => {
    const isAdmin = await isUserAdmin(ctx, config);

    let helpText = [
      '📖 <b>Movie Promo Bot Help & Diagnostics</b>',
      '',
      '<b>Member Commands:</b>',
      '• /connect : About our community & website',
      '• /promo_count : Current movie request count',
      '• /promo_status : Automatic promotion status',
      '• /diagnostics : Verify Telegram message receipt & Privacy Mode',
    ].join('\n');

    if (isAdmin) {
      helpText += [
        '\n\n<b>Admin Commands:</b>',
        '• /promo_on : Enable automatic promotional messages',
        '• /promo_off : Disable promotional messages (Kill Switch)',
        '• /promo_reset : Reset request counter to 0 (requires confirmation)',
      ].join('\n');
    }

    await ctx.reply(helpText, { parse_mode: 'HTML' });
  });

  // /promo_count
  bot.command('promo_count', async (ctx: Context) => {
    const state = await storage.getState();
    const progress = `${state.requestCount}/${state.promoThreshold}`;
    const percent = Math.min(100, Math.round((state.requestCount / state.promoThreshold) * 100));

    const text = [
      '📊 <b>Movie Request Counter</b>',
      '',
      `• <b>Current Count:</b> <code>${state.requestCount}</code> / <code>${state.promoThreshold}</code> (${percent}%)`,
      `• <b>Total Lifetime Requests:</b> <code>${state.totalEligibleRequests}</code>`,
      `• <b>Promotions Sent:</b> <code>${state.totalPromotionsSent}</code>`,
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // /promo_status
  bot.command('promo_status', async (ctx: Context) => {
    const state = await storage.getState();
    const now = Date.now();

    let cooldownInfo = 'Inactive (Ready to promote)';
    if (state.lastPromotionAt !== null) {
      const elapsed = now - state.lastPromotionAt;
      const cooldownMs = state.promoCooldownMinutes * 60 * 1000;
      if (elapsed < cooldownMs) {
        const remainingMin = Math.ceil((cooldownMs - elapsed) / 60000);
        cooldownInfo = `Active (${remainingMin}m remaining until next promo allowed)`;
      } else {
        const hoursAgo = Math.floor(elapsed / 3600000);
        cooldownInfo = `Inactive (Last promo was ${hoursAgo}h ago)`;
      }
    }

    const text = [
      '⚙️ <b>Promotion Engine Status</b>',
      '',
      `• <b>Automatic Promo:</b> ${state.isPromoEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}`,
      `• <b>Current Counter:</b> <code>${state.requestCount}</code> / <code>${state.promoThreshold}</code> requests`,
      `• <b>Configured Cooldown:</b> <code>${state.promoCooldownMinutes}</code> minutes`,
      `• <b>Cooldown Status:</b> ${cooldownInfo}`,
      `• <b>Total Promotions Delivered:</b> <code>${state.totalPromotionsSent}</code>`,
      `• <b>Target Group ID:</b> <code>${config.groupId ? escapeHtml(config.groupId) : 'Not configured'}</code>`,
      state.lastError ? `\n⚠️ <i>Last send warning:</i> ${escapeHtml(state.lastError)}` : '',
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // /promo_off (Admin only)
  bot.command('promo_off', async (ctx: Context) => {
    const isAdmin = await isUserAdmin(ctx, config);
    if (!isAdmin) {
      await ctx.reply('⛔ <i>Unauthorized. This command is restricted to administrators.</i>', { parse_mode: 'HTML' });
      return;
    }

    await storage.setPromoEnabled(false);
    logger.info('Promotion engine paused by admin', { userId: ctx.from?.id });
    await ctx.reply('🔴 <b>Promotion engine DISABLED.</b> No automatic promotional messages will be posted until re-enabled with /promo_on.', { parse_mode: 'HTML' });
  });

  // /promo_on (Admin only)
  bot.command('promo_on', async (ctx: Context) => {
    const isAdmin = await isUserAdmin(ctx, config);
    if (!isAdmin) {
      await ctx.reply('⛔ <i>Unauthorized. This command is restricted to administrators.</i>', { parse_mode: 'HTML' });
      return;
    }

    await storage.setPromoEnabled(true);
    logger.info('Promotion engine enabled by admin', { userId: ctx.from?.id });
    await ctx.reply('🟢 <b>Promotion engine ENABLED.</b> Automatic promotions will trigger when the request threshold is reached and cooldown permits.', { parse_mode: 'HTML' });
  });

  // /promo_reset (Admin only, requires confirmation)
  bot.command('promo_reset', async (ctx: Context) => {
    const isAdmin = await isUserAdmin(ctx, config);
    if (!isAdmin) {
      await ctx.reply('⛔ <i>Unauthorized. This command is restricted to administrators.</i>', { parse_mode: 'HTML' });
      return;
    }

    const textArgs = ctx.message?.text?.trim().split(/\s+/) || [];
    const confirmedByArg = textArgs[1]?.toLowerCase() === 'confirm';

    if (confirmedByArg) {
      const stateBefore = await storage.getState();
      await storage.resetCounter();
      logger.info('Counter reset executed via confirm argument', { userId: ctx.from?.id, previousCount: stateBefore.requestCount });
      await ctx.reply(`🔄 <b>Counter reset confirmed.</b> Request count was reset from <code>${stateBefore.requestCount}</code> to <code>0</code>.`, { parse_mode: 'HTML' });
      return;
    }

    // Prompt with interactive confirmation inline button
    const keyboard = new InlineKeyboard()
      .text('⚠️ Yes, Reset Counter to 0', 'confirm_reset_counter')
      .text('Cancel', 'cancel_reset_counter');

    await ctx.reply(
      '⚠️ <b>Confirmation Required</b>\n\nAre you sure you want to reset the movie request counter to 0?\n\nAlternatively, send: <code>/promo_reset confirm</code>',
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );
  });

  // Callback query handler for interactive /promo_reset confirmation
  bot.callbackQuery('confirm_reset_counter', async (ctx: Context) => {
    const isAdmin = await isUserAdmin(ctx, config);
    if (!isAdmin) {
      await ctx.answerCallbackQuery({ text: 'Unauthorized', show_alert: true });
      return;
    }

    const stateBefore = await storage.getState();
    await storage.resetCounter();
    logger.info('Counter reset executed via callback button', { userId: ctx.from?.id, previousCount: stateBefore.requestCount });

    await ctx.answerCallbackQuery({ text: 'Counter reset to 0' });
    await ctx.editMessageText(
      `🔄 <b>Counter successfully reset.</b> Count was reset from <code>${stateBefore.requestCount}</code> to <code>0</code>.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.callbackQuery('cancel_reset_counter', async (ctx: Context) => {
    await ctx.answerCallbackQuery({ text: 'Reset cancelled' });
    await ctx.editMessageText('❌ <i>Counter reset cancelled. Current count preserved.</i>', { parse_mode: 'HTML' });
  });

  // /diagnostics
  bot.command('diagnostics', async (ctx: Context) => {
    const chatType = ctx.chat?.type;
    const isGroup = chatType === 'group' || chatType === 'supergroup';
    const matchesGroupId = isMatchingGroupId(ctx.chat?.id, config.groupId);
    const state = await storage.getState();

    // Check bot's own member status in this group
    let botStatusInGroup = 'Unknown';
    let isAdminInGroup = false;
    if (isGroup && ctx.me?.id) {
      try {
        const botMember = await ctx.getChatMember(ctx.me.id);
        botStatusInGroup = botMember.status;
        isAdminInGroup = botMember.status === 'administrator' || botMember.status === 'creator';
      } catch (err) {
        botStatusInGroup = `Check failed: ${(err as Error).message}`;
      }
    }

    // Inspect Telegram webhook status
    let webhookStatusLine = 'Unknown';
    try {
      const webhookInfo = await ctx.api.getWebhookInfo();
      if (webhookInfo.url) {
        webhookStatusLine = `<code>${escapeHtml(webhookInfo.url)}</code> (Pending: ${webhookInfo.pending_update_count})`;
        if (webhookInfo.last_error_message) {
          webhookStatusLine += `\n⚠️ <i>Last Telegram error: ${escapeHtml(webhookInfo.last_error_message)}</i>`;
        }
      } else {
        webhookStatusLine = '🔴 <b>NO WEBHOOK URL REGISTERED WITH TELEGRAM!</b>';
      }
    } catch (err) {
      webhookStatusLine = `Error checking: ${(err as Error).message}`;
    }

    const text = [
      '🩺 <b>Movie Promo Bot Diagnostics</b>',
      '',
      `• <b>Current Chat ID:</b> <code>${ctx.chat?.id}</code> (${chatType})`,
      `• <b>Configured GROUP_ID:</b> <code>${config.groupId || 'NOT SET'}</code>`,
      `• <b>Group ID Matches:</b> ${matchesGroupId ? '✅ Yes' : '❌ NO (Bot ignores messages here!)'}`,
      `• <b>Current Counter:</b> <code>${state.requestCount} / ${state.promoThreshold}</code> requests`,
      `• <b>Bot Status in Group:</b> <code>${botStatusInGroup}</code> ${isAdminInGroup ? '✅ (Can read all messages)' : '⚠️ (Member)'}`,
      `• <b>Telegram Webhook:</b> ${webhookStatusLine}`,
      '',
      matchesGroupId
        ? '✅ <b>Chat ID is configured correctly!</b>'
        : '⚠️ <b>ACTION REQUIRED:</b> Copy the Chat ID above and set it as <code>GROUP_ID</code> in Render Environment tab!',
      '',
      '🔍 <b>Why Messages Might Not Count:</b>',
      '1. <b>Telegram Group Privacy:</b> By default, Telegram drops ordinary text messages sent to bots! To fix:',
      '   • <b>Option A (Easiest):</b> Promote this bot to <b>Administrator</b> in group settings (requires no extra permissions, instantly allows reading messages).',
      '   • <b>Option B:</b> Message @BotFather → <code>/setprivacy</code> → Select bot → <b>Disable</b>. Then <i>remove and re-add</i> the bot to this group.',
      '2. <b>Group ID Mismatch:</b> Verify your Render <code>GROUP_ID</code> matches <code>' + ctx.chat?.id + '</code> exactly.',
      '3. <b>Movie Title Format:</b> Send titles like <code>Leo 2023</code> or <code>Interstellar 1080p</code>.',
    ].join('\n');

    await ctx.reply(text, { parse_mode: 'HTML' });
  });
}
