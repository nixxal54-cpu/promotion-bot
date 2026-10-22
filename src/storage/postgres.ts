import pg from 'pg';
import { StorageInterface, BotState, IncrementResult, AuditLogEntry } from './interface.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('postgres-storage');

export class PostgresStorage implements StorageInterface {
  private pool: pg.Pool;
  private initialThreshold: number;
  private initialCooldownMinutes: number;

  constructor(connectionString: string, initialThreshold = 10, initialCooldownMinutes = 30) {
    this.initialThreshold = initialThreshold;
    this.initialCooldownMinutes = initialCooldownMinutes;
    this.pool = new pg.Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS bot_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          request_count INTEGER NOT NULL DEFAULT 0,
          promo_threshold INTEGER NOT NULL DEFAULT 10,
          promo_cooldown_minutes INTEGER NOT NULL DEFAULT 30,
          is_promo_enabled BOOLEAN NOT NULL DEFAULT TRUE,
          last_promotion_at BIGINT,
          total_promotions_sent INTEGER NOT NULL DEFAULT 0,
          total_eligible_requests INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS processed_updates (
          update_id BIGINT PRIMARY KEY,
          processed_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          action VARCHAR(128) NOT NULL,
          details JSONB
        );

        CREATE INDEX IF NOT EXISTS idx_processed_updates_time ON processed_updates(processed_at);
      `);

      const res = await client.query('SELECT id FROM bot_state WHERE id = 1');
      if (res.rows.length === 0) {
        const now = Date.now();
        await client.query(
          `INSERT INTO bot_state (
            id, request_count, promo_threshold, promo_cooldown_minutes,
            is_promo_enabled, last_promotion_at, total_promotions_sent,
            total_eligible_requests, last_error, updated_at
          ) VALUES (1, 0, $1, $2, TRUE, NULL, 0, 0, NULL, $3)`,
          [this.initialThreshold, this.initialCooldownMinutes, now]
        );
      }

      logger.info('PostgreSQL storage schema initialized and verified.');
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getState(): Promise<BotState> {
    const res = await this.pool.query('SELECT * FROM bot_state WHERE id = 1');
    if (res.rows.length === 0) {
      throw new Error('Bot state row missing in PostgreSQL');
    }
    const row = res.rows[0];
    return {
      requestCount: parseInt(row.request_count, 10),
      promoThreshold: parseInt(row.promo_threshold, 10),
      promoCooldownMinutes: parseInt(row.promo_cooldown_minutes, 10),
      isPromoEnabled: Boolean(row.is_promo_enabled),
      lastPromotionAt: row.last_promotion_at ? parseInt(row.last_promotion_at, 10) : null,
      totalPromotionsSent: parseInt(row.total_promotions_sent, 10),
      totalEligibleRequests: parseInt(row.total_eligible_requests, 10),
      lastError: row.last_error,
      updatedAt: parseInt(row.updated_at, 10),
    };
  }

  async hasProcessedUpdate(updateId: number): Promise<boolean> {
    const res = await this.pool.query('SELECT update_id FROM processed_updates WHERE update_id = $1', [updateId]);
    return res.rows.length > 0;
  }

  async recordProcessedUpdate(updateId: number): Promise<void> {
    await this.pool.query(
      'INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [updateId, Date.now()]
    );
  }

  async incrementRequestCount(
    updateId?: number,
    threshold?: number,
    cooldownMinutes?: number
  ): Promise<IncrementResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update deduplication within transaction
      if (updateId !== undefined) {
        const updateCheck = await client.query(
          'SELECT update_id FROM processed_updates WHERE update_id = $1 FOR UPDATE',
          [updateId]
        );
        if (updateCheck.rows.length > 0) {
          await client.query('COMMIT');
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
        await client.query(
          'INSERT INTO processed_updates (update_id, processed_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [updateId, Date.now()]
        );
      }

      // Explicit row-level lock on the single bot_state row prevents concurrent double-increments or double-triggers!
      const res = await client.query('SELECT * FROM bot_state WHERE id = 1 FOR UPDATE');
      if (res.rows.length === 0) {
        throw new Error('Bot state row missing during increment');
      }

      const row = res.rows[0];
      const targetThreshold = threshold ?? parseInt(row.promo_threshold, 10);
      const targetCooldownMin = cooldownMinutes ?? parseInt(row.promo_cooldown_minutes, 10);
      const previousCount = parseInt(row.request_count, 10);
      const newCount = previousCount + 1;
      const now = Date.now();

      await client.query(
        `UPDATE bot_state
         SET request_count = $1,
             total_eligible_requests = total_eligible_requests + 1,
             updated_at = $2
         WHERE id = 1`,
        [newCount, now]
      );

      await client.query('COMMIT');

      const thresholdReached = newCount >= targetThreshold;
      let inCooldown = false;
      let cooldownRemainingMs = 0;

      if (row.last_promotion_at !== null) {
        const lastPromo = parseInt(row.last_promotion_at, 10);
        const elapsed = now - lastPromo;
        const cooldownMs = targetCooldownMin * 60 * 1000;
        if (elapsed < cooldownMs) {
          inCooldown = true;
          cooldownRemainingMs = cooldownMs - elapsed;
        }
      }

      const isPromoEnabled = Boolean(row.is_promo_enabled);
      const promoTriggered = thresholdReached && !inCooldown && isPromoEnabled;

      return {
        previousCount,
        newCount,
        thresholdReached,
        inCooldown,
        promoTriggered,
        cooldownRemainingMs,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async recordSuccessfulPromotion(): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `UPDATE bot_state
       SET request_count = 0,
           last_promotion_at = $1,
           total_promotions_sent = total_promotions_sent + 1,
           last_error = NULL,
           updated_at = $1
       WHERE id = 1`,
      [now]
    );

    await this.addAuditLog('PROMOTION_SENT_SUCCESS', { timestamp: new Date(now).toISOString() });
  }

  async recordFailedPromotion(errorMessage: string): Promise<void> {
    const now = Date.now();
    // Do NOT reset request_count!
    await this.pool.query(
      `UPDATE bot_state
       SET last_error = $1,
           updated_at = $2
       WHERE id = 1`,
      [errorMessage, now]
    );

    await this.addAuditLog('PROMOTION_SEND_FAILED', { error: errorMessage });
  }

  async setPromoEnabled(enabled: boolean): Promise<void> {
    const now = Date.now();
    await this.pool.query(
      `UPDATE bot_state
       SET is_promo_enabled = $1,
           updated_at = $2
       WHERE id = 1`,
      [enabled, now]
    );

    await this.addAuditLog('PROMO_ENABLED_TOGGLED', { enabled });
  }

  async resetCounter(): Promise<void> {
    const now = Date.now();
    const res = await this.pool.query('SELECT request_count FROM bot_state WHERE id = 1');
    const prev = res.rows[0] ? parseInt(res.rows[0].request_count, 10) : 0;

    await this.pool.query(
      `UPDATE bot_state
       SET request_count = 0,
           updated_at = $1
       WHERE id = 1`,
      [now]
    );

    await this.addAuditLog('COUNTER_RESET', { previousCount: prev });
  }

  async getAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
    const res = await this.pool.query(
      'SELECT id, timestamp, action, details FROM audit_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      timestamp: typeof r.timestamp === 'string' ? r.timestamp : r.timestamp.toISOString(),
      action: r.action,
      details: r.details || undefined,
    }));
  }

  async addAuditLog(action: string, details?: Record<string, unknown>): Promise<void> {
    const id = Math.random().toString(36).substring(2, 9);
    await this.pool.query(
      'INSERT INTO audit_logs (id, timestamp, action, details) VALUES ($1, NOW(), $2, $3)',
      [id, action, details ? JSON.stringify(details) : null]
    );
  }
}
