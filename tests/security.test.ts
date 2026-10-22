import test from 'node:test';
import assert from 'node:assert/strict';
import { handleIncomingMessage } from '../src/bot/messageHandler.js';
import { createWebhookHandler } from '../src/webhook/telegramWebhook.js';
import { sanitizeLog } from '../src/logging/logger.js';
import { AppConfig } from '../src/config.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { PromotionService } from '../src/promotions/promotionService.js';
import { Context, Bot, Api, RawApi } from 'grammy';
import { Request, Response } from 'express';

function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    botToken: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567',
    webhookUrl: 'https://promo.onrender.com',
    webhookSecret: 'my-super-secret-token-xyz',
    groupId: '-100987654321',
    websiteUrl: 'https://socialmingle.example.com',
    promoThreshold: 10,
    promoCooldownMinutes: 30,
    adminUserIds: [111],
    sqlitePath: ':memory:',
    nodeEnv: 'test',
    port: 3000,
    runMode: 'webhook',
    detectorMinLength: 2,
    detectorMaxLength: 80,
    detectorIgnoredWords: ['hi', 'hello'],
    ...overrides,
  };
}

test('webhook rejects requests with invalid secret token', async () => {
  const config = createMockConfig({ webhookSecret: 'secret-12345' });
  const handler = createWebhookHandler(null, config);

  let statusCode = 0;
  let jsonResponse: unknown = null;

  const mockReq = {
    header: (name: string) => (name.toLowerCase() === 'x-telegram-bot-api-secret-token' ? 'wrong-token' : undefined),
    body: {},
  } as unknown as Request;

  const mockRes = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (data: unknown) => {
          jsonResponse = data;
        },
        send: () => {},
      };
    },
  } as unknown as Response;

  await handler(mockReq, mockRes);
  assert.equal(statusCode, 401);
  assert.ok(JSON.stringify(jsonResponse).includes('Unauthorized'));
});

test('webhook accepts requests with valid secret token', async () => {
  const config = createMockConfig({ webhookSecret: 'secret-12345' });
  let updateHandled = false;

  const mockBot = {
    handleUpdate: async () => {
      updateHandled = true;
    },
  } as unknown as Bot;

  const handler = createWebhookHandler(mockBot, config);

  let statusCode = 0;
  const mockReq = {
    header: (name: string) => (name.toLowerCase() === 'x-telegram-bot-api-secret-token' ? 'secret-12345' : undefined),
    body: { update_id: 123 },
  } as unknown as Request;

  const mockRes = {
    status: (code: number) => {
      statusCode = code;
      return {
        send: () => {},
      };
    },
  } as unknown as Response;

  await handler(mockReq, mockRes);
  assert.equal(statusCode, 200);
  assert.equal(updateHandled, true);
});

test('message handler ignores messages sent by other bots', async () => {
  const config = createMockConfig();
  const storage = new MemoryStorage();
  const service = new PromotionService(storage, config);

  const mockBotContext = {
    message: {
      message_id: 1,
      from: { id: 777, is_bot: true, first_name: 'Existing Movie Bot' },
      chat: { id: -100987654321, type: 'supergroup' },
      text: 'Leo 2023 1080p Bluray',
    },
  } as unknown as Context;

  await handleIncomingMessage(mockBotContext, config, service);
  const state = await storage.getState();
  assert.equal(state.requestCount, 0); // Not counted!
});

test('message handler ignores messages from unconfigured / wrong groups', async () => {
  const config = createMockConfig({ groupId: '-100987654321' });
  const storage = new MemoryStorage();
  const service = new PromotionService(storage, config);

  const wrongGroupContext = {
    message: {
      message_id: 2,
      from: { id: 888, is_bot: false, first_name: 'Alice' },
      chat: { id: -100111111111, type: 'supergroup' }, // different chat ID
      text: 'Leo 2023',
    },
  } as unknown as Context;

  await handleIncomingMessage(wrongGroupContext, config, service);
  const state = await storage.getState();
  assert.equal(state.requestCount, 0);
});

test('message handler ignores private chats for promotion counting', async () => {
  const config = createMockConfig();
  const storage = new MemoryStorage();
  const service = new PromotionService(storage, config);

  const privateChatContext = {
    message: {
      message_id: 3,
      from: { id: 888, is_bot: false, first_name: 'Alice' },
      chat: { id: 888, type: 'private' },
      text: 'Leo 2023',
    },
  } as unknown as Context;

  await handleIncomingMessage(privateChatContext, config, service);
  const state = await storage.getState();
  assert.equal(state.requestCount, 0);
});

test('message handler counts eligible member movie request in target group', async () => {
  const config = createMockConfig();
  const storage = new MemoryStorage();
  const service = new PromotionService(storage, config);

  const eligibleContext = {
    update: { update_id: 999 },
    message: {
      message_id: 4,
      from: { id: 888, is_bot: false, first_name: 'Alice' },
      chat: { id: -100987654321, type: 'supergroup' },
      text: 'Leo 2023',
    },
    api: {
      sendMessage: async () => ({ message_id: 10 }),
    } as unknown as Api<RawApi>,
  } as unknown as Context;

  await handleIncomingMessage(eligibleContext, config, service);
  const state = await storage.getState();
  assert.equal(state.requestCount, 1);
});

test('logger sanitizes Telegram bot tokens and connection passwords', () => {
  const tokenString = 'Bot token is 123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567 in chat';
  const sanitizedToken = sanitizeLog(tokenString);
  assert.ok(!String(sanitizedToken).includes('123456789:ABCdefGHIjklMNOpqrsTUVwxyz1234567'));
  assert.ok(String(sanitizedToken).includes('[REDACTED_BOT_TOKEN]'));

  const dbString = 'Connected to postgresql://admin:mySecretPassword123@db.host.com:5432/proddb';
  const sanitizedDb = sanitizeLog(dbString);
  assert.ok(!String(sanitizedDb).includes('mySecretPassword123'));
  assert.ok(String(sanitizedDb).includes('[REDACTED_PASSWORD]'));
});
