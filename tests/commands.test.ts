import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../src/storage/memory.js';
import { AppConfig } from '../src/config.js';
import { isUserAdmin } from '../src/bot/adminAuth.js';
import { buildPromotionMessage, buildConnectMessage } from '../src/promotions/promotionMessage.js';
import { Context } from 'grammy';

function createMockConfig(): AppConfig {
  return {
    botToken: 'mock-token',
    webhookUrl: 'https://example.com',
    webhookSecret: 'secret123',
    groupId: '-1001234567890',
    websiteUrl: 'https://socialmingle.example.com',
    promoThreshold: 10,
    promoCooldownMinutes: 30,
    adminUserIds: [12345], // 12345 is admin
    sqlitePath: ':memory:',
    nodeEnv: 'test',
    port: 3000,
    runMode: 'webhook',
    detectorMinLength: 2,
    detectorMaxLength: 80,
    detectorIgnoredWords: ['hi', 'hello'],
  };
}

test('isUserAdmin approves allowlisted admin IDs', async () => {
  const config = createMockConfig();
  const mockAdminCtx = {
    from: { id: 12345 },
    chat: { type: 'group', id: -1001234567890 },
  } as unknown as Context;

  assert.equal(await isUserAdmin(mockAdminCtx, config), true);
});

test('isUserAdmin rejects unauthorized regular users', async () => {
  const config = createMockConfig();
  const mockRegularCtx = {
    from: { id: 99999 },
    chat: { type: 'private', id: 99999 },
  } as unknown as Context;

  assert.equal(await isUserAdmin(mockRegularCtx, config), false);
});

test('buildPromotionMessage includes website URL and disables link previews', () => {
  const url = 'https://myconnectionhub.io';
  const msg = buildPromotionMessage(url);
  assert.ok(msg.text.includes(url));
  assert.ok(msg.text.includes('Looking to make new connections?'));
  assert.equal(msg.parse_mode, 'HTML');
  assert.equal(msg.link_preview_options.is_disabled, true);
});

test('buildConnectMessage includes respectful community intro', () => {
  const url = 'https://myconnectionhub.io';
  const msg = buildConnectMessage(url);
  assert.ok(msg.text.includes(url));
  assert.ok(msg.text.includes('social-connection website'));
});

test('promo_off and promo_on toggle promotion engine in storage', async () => {
  const storage = new MemoryStorage();
  assert.equal((await storage.getState()).isPromoEnabled, true);

  await storage.setPromoEnabled(false);
  assert.equal((await storage.getState()).isPromoEnabled, false);

  await storage.setPromoEnabled(true);
  assert.equal((await storage.getState()).isPromoEnabled, true);
});

test('promo_reset resets counter to 0 on confirmation', async () => {
  const storage = new MemoryStorage({ requestCount: 8 });
  assert.equal((await storage.getState()).requestCount, 8);

  await storage.resetCounter();
  assert.equal((await storage.getState()).requestCount, 0);

  const logs = await storage.getAuditLogs();
  assert.equal(logs[0].action, 'COUNTER_RESET');
});
