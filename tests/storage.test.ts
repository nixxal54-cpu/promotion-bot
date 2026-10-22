import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../src/storage/memory.js';
import { SqliteStorage } from '../src/storage/sqlite.js';

test('MemoryStorage deduplicates updates using update_id', async () => {
  const storage = new MemoryStorage({ promoThreshold: 10 });

  const r1 = await storage.incrementRequestCount(500);
  assert.equal(r1.newCount, 1);

  // Send exact same updateId again (e.g. Telegram webhook retry)
  const r2 = await storage.incrementRequestCount(500);
  assert.equal(r2.newCount, 1); // Counter did not double increment!

  // Send new updateId
  const r3 = await storage.incrementRequestCount(501);
  assert.equal(r3.newCount, 2);
});

test('SqliteStorage persists state and handles transactions in :memory:', async () => {
  const storage = new SqliteStorage(':memory:', 10, 30);
  await storage.init();

  const state1 = await storage.getState();
  assert.equal(state1.requestCount, 0);
  assert.equal(state1.promoThreshold, 10);
  assert.equal(state1.promoCooldownMinutes, 30);

  // Increment with deduplication check
  const r1 = await storage.incrementRequestCount(1001);
  assert.equal(r1.newCount, 1);

  // Duplicate update retry
  const r1Retry = await storage.incrementRequestCount(1001);
  assert.equal(r1Retry.newCount, 1);

  // Increment to 10
  for (let i = 2; i <= 10; i++) {
    await storage.incrementRequestCount(1000 + i);
  }

  const stateAfter10 = await storage.getState();
  assert.equal(stateAfter10.requestCount, 10);

  // Record successful promotion
  await storage.recordSuccessfulPromotion();
  const stateAfterPromo = await storage.getState();
  assert.equal(stateAfterPromo.requestCount, 0);
  assert.equal(stateAfterPromo.totalPromotionsSent, 1);
  assert.ok(stateAfterPromo.lastPromotionAt !== null);

  // Check audit log
  const logs = await storage.getAuditLogs();
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].action, 'PROMOTION_SENT_SUCCESS');

  await storage.close();
});
