import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../src/storage/memory.js';
import { PromotionService } from '../src/promotions/promotionService.js';
import { AppConfig } from '../src/config.js';
import { Api, RawApi } from 'grammy';

function createMockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    botToken: 'mock-token',
    webhookUrl: 'https://example.com',
    webhookSecret: 'secret123',
    groupId: '-1001234567890',
    websiteUrl: 'https://socialmingle.example.com',
    promoThreshold: 10,
    promoCooldownMinutes: 30,
    adminUserIds: [9999],
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

function createMockTelegramApi(shouldFail = false, failureError = 'Telegram API Error: 429 Too Many Requests') {
  let sentMessages: Array<{ chatId: string | number; text: string }> = [];

  const api = {
    sendMessage: async (chatId: string | number, text: string) => {
      if (shouldFail) {
        throw new Error(failureError);
      }
      sentMessages.push({ chatId, text });
      return { message_id: sentMessages.length, text };
    },
  } as unknown as Api<RawApi>;

  return { api, sentMessages };
}

test('counter increments normally below threshold (1 to 9)', async () => {
  const config = createMockConfig({ promoThreshold: 10 });
  const storage = new MemoryStorage({ promoThreshold: 10 });
  const service = new PromotionService(storage, config);
  const { api, sentMessages } = createMockTelegramApi();

  for (let i = 1; i <= 9; i++) {
    const res = await service.processEligibleRequest(config.groupId, api, i);
    assert.equal(res.triggered, false);
    assert.equal(res.count, i);
  }

  const state = await storage.getState();
  assert.equal(state.requestCount, 9);
  assert.equal(sentMessages.length, 0);
});

test('triggers promotion at 10th request and resets counter to 0', async () => {
  const config = createMockConfig({ promoThreshold: 10 });
  const storage = new MemoryStorage({ promoThreshold: 10, requestCount: 9 });
  const service = new PromotionService(storage, config);
  const { api, sentMessages } = createMockTelegramApi();

  const res = await service.processEligibleRequest(config.groupId, api, 10);
  assert.equal(res.triggered, true);
  assert.equal(res.success, true);
  assert.equal(res.count, 0);
  assert.equal(sentMessages.length, 1);
  assert.ok(sentMessages[0].text.includes('Looking to make new connections?'));
  assert.ok(sentMessages[0].text.includes(config.websiteUrl));

  const state = await storage.getState();
  assert.equal(state.requestCount, 0);
  assert.equal(state.totalPromotionsSent, 1);
  assert.ok(state.lastPromotionAt !== null);
});

test('does NOT send promo if threshold is reached during cooldown, but preserves count', async () => {
  const config = createMockConfig({ promoThreshold: 10, promoCooldownMinutes: 30 });
  // Simulate last promo was sent 5 minutes ago (cooldown is 30 mins)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const storage = new MemoryStorage({
    promoThreshold: 10,
    promoCooldownMinutes: 30,
    requestCount: 9,
    lastPromotionAt: fiveMinutesAgo,
  });
  const service = new PromotionService(storage, config);
  const { api, sentMessages } = createMockTelegramApi();

  // 10th request arrives
  const res10 = await service.processEligibleRequest(config.groupId, api, 100);
  assert.equal(res10.triggered, false);
  assert.equal(res10.count, 10);
  assert.ok(res10.reason.includes('deferred due to active cooldown'));
  assert.equal(sentMessages.length, 0);

  // 11th request arrives still in cooldown: count accumulates to 11 without loss
  const res11 = await service.processEligibleRequest(config.groupId, api, 101);
  assert.equal(res11.triggered, false);
  assert.equal(res11.count, 11);
  assert.equal(sentMessages.length, 0);

  const state = await storage.getState();
  assert.equal(state.requestCount, 11);
});

test('does NOT reset counter when Telegram API rejects or fails to send message', async () => {
  const config = createMockConfig({ promoThreshold: 10 });
  const storage = new MemoryStorage({ promoThreshold: 10, requestCount: 9 });
  const service = new PromotionService(storage, config);
  const { api } = createMockTelegramApi(true, 'Telegram 429: Too Many Requests - retry after 45');

  const res = await service.processEligibleRequest(config.groupId, api, 10);
  assert.equal(res.triggered, true);
  assert.equal(res.success, false);
  assert.ok(res.error?.includes('429'));

  // Critical requirement: counter must NOT be reset!
  const state = await storage.getState();
  assert.equal(state.requestCount, 10);
  assert.ok(state.lastError?.includes('429'));
});

test('concurrent requests do not produce duplicate promotions', async () => {
  const config = createMockConfig({ promoThreshold: 10 });
  const storage = new MemoryStorage({ promoThreshold: 10, requestCount: 9 });
  const service = new PromotionService(storage, config);
  const { api, sentMessages } = createMockTelegramApi();

  // Simulate two concurrent updates arriving almost at the same millisecond
  const [res1, res2] = await Promise.all([
    service.processEligibleRequest(config.groupId, api, 201),
    service.processEligibleRequest(config.groupId, api, 202),
  ]);

  // Only one promotion should be triggered
  const successfulSends = [res1, res2].filter((r) => r.triggered && r.success);
  assert.equal(successfulSends.length, 1);
  assert.equal(sentMessages.length, 1);
});
