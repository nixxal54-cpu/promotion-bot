import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StorageInterface, BotState, IncrementResult, AuditLogEntry } from './interface.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('sqlite-storage');

export class SqliteStorage implements StorageInterface {
  private db: DatabaseSync | null = null;
  private dbPath: string;
  private initialThreshold: number;
  private initialCooldownMinutes: number;

  constructor(dbPath = './data/movie_promo.db', initialThreshold = 10, initialCooldownMinutes = 30) {
    this.dbPath = dbPath;
    this.initialThreshold = initialThreshold;
    this.initialCooldownMinutes = initialCooldownMinutes;
  }

  async init(): Promise<void> {
    if (this.db) return;

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');

    // Schema creation
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        request_count INTEGER NOT NULL DEFAULT 0,
        promo_threshold INTEGER NOT NULL DEFAULT 10,
        promo_cooldown_minutes INTEGER NOT NULL DEFAULT 30,
        is_promo_enabled INTEGER NOT NULL DEFAULT 1,
        last_promotion_at INTEGER,
        total_promotions_sent INTEGER NOT NULL DEFAULT 0,
        total_eligible_requests INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id INTEGER PRIMARY KEY,
        processed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT
      );
    `);

    // Ensure state row exists
    const row = this.db.prepare('SELECT id FROM bot_state WHERE id = 1').get();
    if (!row) {
      const now = Date.now();
      this.db.prepare(`
        INSERT INTO bot_state (
          id, request_count, promo_threshold, promo_cooldown_minutes,
          is_promo_enabled, last_promotion_at, total_promotions_sent,
          total_eligible_requests, last_error, updated_at
        ) VALUES (1, 0, ?, ?, 1, NULL, 0, 0, NULL, ?)
      `).run(this.initialThreshold, this.initialCooldownMinutes, now);
    }

    logger.info(`SQLite storage initialized successfully at: ${this.dbPath}`);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureConnected(): DatabaseSync {
    if (!this.db) {
      throw new Error('Database is not initialized. Call init() first.');
    }
    return this.db;
  }

  async getState(): Promise<BotState> {
    const db = this.ensureConnected();
    const row = db.prepare('SELECT * FROM bot_state WHERE id = 1').get() as {
      id: number;
      request_count: number;
      promo_threshold: number;
      promo_cooldown_minutes: number;
      is_promo_enabled: number;
      last_promotion_at: number | null;
      total_promotions_sent: number;
      total_eligible_requests: number;
      last_error: string | null;
      updated_at: number;
    } | undefined;

    if (!row) {
      throw new Error('Bot state row missing in SQLite');
    }

    return {
      requestCount: row.request_count,
      promoThreshold: row.promo_threshold,
      promoCooldownMinutes: row.promo_cooldown_minutes,
      isPromoEnabled: row.is_promo_enabled === 1,
      lastPromotionAt: row.last_promotion_at,
      totalPromotionsSent: row.total_promotions_sent,
      totalEligibleRequests: row.total_eligible_requests,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  }

  async hasProcessedUpdate(updateId: number): Promise<boolean> {
    const db = this.ensureConnected();
    const row = db.prepare('SELECT update_id FROM processed_updates WHERE update_id = ?').get(updateId);
    return Boolean(row);
  }

  async recordProcessedUpdate(updateId: number): Promise<void> {
    const db = this.ensureConnected();
    db.prepare('INSERT OR IGNORE INTO processed_updates (update_id, processed_at) VALUES (?, ?)').run(
      updateId,
      Date.now()
    );
  }

  async incrementRequestCount(
    updateId?: number,
    threshold?: number,
    cooldownMinutes?: number
  ): Promise<IncrementResult> {
    const db = this.ensureConnected();

    // Atomic transaction using BEGIN IMMEDIATE
    db.exec('BEGIN IMMEDIATE');
    try {
      if (updateId !== undefined) {
        const existing = db.prepare('SELECT update_id FROM processed_updates WHERE update_id = ?').get(updateId);
        if (existing) {
          db.exec('COMMIT');
          const state = await this.getState();
          return {
            previousCount: state.requestCount,
            newCount: state.requestCount,
            thresholdReached: false,
            inCooldown: false,
            promoTriggered: false,
            cooldownRemainingMs: 0,
          };
        }
        db.prepare('INSERT INTO processed_updates (update_id, processed_at) VALUES (?, ?)').run(
          updateId,
          Date.now()
        );
      }

      const row = db.prepare('SELECT * FROM bot_state WHERE id = 1').get() as {
        request_count: number;
        promo_threshold: number;
        promo_cooldown_minutes: number;
        is_promo_enabled: number;
        last_promotion_at: number | null;
      };

      const targetThreshold = threshold ?? row.promo_threshold;
      const targetCooldownMin = cooldownMinutes ?? row.promo_cooldown_minutes;
      const previousCount = row.request_count;
      const newCount = previousCount + 1;
      const now = Date.now();

      db.prepare(`
        UPDATE bot_state
        SET request_count = ?,
            total_eligible_requests = total_eligible_requests + 1,
            updated_at = ?
        WHERE id = 1
      `).run(newCount, now);

      db.exec('COMMIT');

      const thresholdReached = newCount >= targetThreshold;
      let inCooldown = false;
      let cooldownRemainingMs = 0;

      if (row.last_promotion_at !== null) {
        const elapsed = now - row.last_promotion_at;
        const cooldownMs = targetCooldownMin * 60 * 1000;
        if (elapsed < cooldownMs) {
          inCooldown = true;
          cooldownRemainingMs = cooldownMs - elapsed;
        }
      }

      const promoTriggered = thresholdReached && !inCooldown && row.is_promo_enabled === 1;

      return {
        previousCount,
        newCount,
        thresholdReached,
        inCooldown,
        promoTriggered,
        cooldownRemainingMs,
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error if already rolled back
      }
      throw err;
    }
  }

  async recordSuccessfulPromotion(): Promise<void> {
    const db = this.ensureConnected();
    const now = Date.now();
    db.prepare(`
      UPDATE bot_state
      SET request_count = 0,
          last_promotion_at = ?,
          total_promotions_sent = total_promotions_sent + 1,
          last_error = NULL,
          updated_at = ?
      WHERE id = 1
    `).run(now, now);

    await this.addAuditLog('PROMOTION_SENT_SUCCESS', { timestamp: new Date(now).toISOString() });
  }

  async recordFailedPromotion(errorMessage: string): Promise<void> {
    const db = this.ensureConnected();
    const now = Date.now();
    // Do NOT reset request_count!
    db.prepare(`
      UPDATE bot_state
      SET last_error = ?,
          updated_at = ?
      WHERE id = 1
    `).run(errorMessage, now);

    await this.addAuditLog('PROMOTION_SEND_FAILED', { error: errorMessage });
  }

  async setPromoEnabled(enabled: boolean): Promise<void> {
    const db = this.ensureConnected();
    const now = Date.now();
    db.prepare(`
      UPDATE bot_state
      SET is_promo_enabled = ?,
          updated_at = ?
      WHERE id = 1
    `).run(enabled ? 1 : 0, now);

    await this.addAuditLog('PROMO_ENABLED_TOGGLED', { enabled });
  }

  async resetCounter(): Promise<void> {
    const db = this.ensureConnected();
    const now = Date.now();
    const prevRow = db.prepare('SELECT request_count FROM bot_state WHERE id = 1').get() as { request_count: number };
    db.prepare(`
      UPDATE bot_state
      SET request_count = 0,
          updated_at = ?
      WHERE id = 1
    `).run(now);

    await this.addAuditLog('COUNTER_RESET', { previousCount: prevRow?.request_count ?? 0 });
  }

  async getAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
    const db = this.ensureConnected();
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit) as Array<{
      id: string;
      timestamp: string;
      action: string;
      details_json: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      action: r.action,
      details: r.details_json ? JSON.parse(r.details_json) : undefined,
    }));
  }

  async addAuditLog(action: string, details?: Record<string, unknown>): Promise<void> {
    const db = this.ensureConnected();
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    db.prepare('INSERT INTO audit_logs (id, timestamp, action, details_json) VALUES (?, ?, ?, ?)').run(
      id,
      timestamp,
      action,
      detailsJson
    );
  }
}
