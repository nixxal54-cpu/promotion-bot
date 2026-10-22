import { StorageInterface, BotState, IncrementResult, AuditLogEntry } from './interface.js';

export class MemoryStorage implements StorageInterface {
  private state: BotState;
  private processedUpdates = new Set<number>();
  private auditLogs: AuditLogEntry[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor(initialState?: Partial<BotState>) {
    this.state = {
      requestCount: 0,
      promoThreshold: 10,
      promoCooldownMinutes: 30,
      isPromoEnabled: true,
      lastPromotionAt: null,
      totalPromotionsSent: 0,
      totalEligibleRequests: 0,
      lastError: null,
      updatedAt: Date.now(),
      ...initialState,
    };
  }

  // Mutex lock to simulate database transactions and serialize concurrent operations
  private async acquireLock<T>(fn: () => Promise<T>): Promise<T> {
    let unlock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    const prevLock = this.lockPromise;
    this.lockPromise = prevLock.then(() => nextLock);

    await prevLock;
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  async init(): Promise<void> {
    // No-op for memory storage
  }

  async close(): Promise<void> {
    // No-op for memory storage
  }

  async getState(): Promise<BotState> {
    return { ...this.state };
  }

  async hasProcessedUpdate(updateId: number): Promise<boolean> {
    return this.processedUpdates.has(updateId);
  }

  async recordProcessedUpdate(updateId: number): Promise<void> {
    this.processedUpdates.add(updateId);
  }

  async incrementRequestCount(
    updateId?: number,
    threshold = this.state.promoThreshold,
    cooldownMinutes = this.state.promoCooldownMinutes
  ): Promise<IncrementResult> {
    return this.acquireLock(async () => {
      if (updateId !== undefined && this.processedUpdates.has(updateId)) {
        // Already processed update: return current count without incrementing
        return {
          previousCount: this.state.requestCount,
          newCount: this.state.requestCount,
          thresholdReached: false,
          inCooldown: false,
          promoTriggered: false,
          cooldownRemainingMs: 0,
        };
      }

      if (updateId !== undefined) {
        this.processedUpdates.add(updateId);
      }

      const previousCount = this.state.requestCount;
      const newCount = previousCount + 1;
      this.state.requestCount = newCount;
      this.state.totalEligibleRequests += 1;
      this.state.updatedAt = Date.now();

      const thresholdReached = newCount >= threshold;
      let inCooldown = false;
      let cooldownRemainingMs = 0;

      if (this.state.lastPromotionAt !== null) {
        const elapsedMs = Date.now() - this.state.lastPromotionAt;
        const cooldownMs = cooldownMinutes * 60 * 1000;
        if (elapsedMs < cooldownMs) {
          inCooldown = true;
          cooldownRemainingMs = cooldownMs - elapsedMs;
        }
      }

      const promoTriggered = thresholdReached && !inCooldown && this.state.isPromoEnabled;

      return {
        previousCount,
        newCount,
        thresholdReached,
        inCooldown,
        promoTriggered,
        cooldownRemainingMs,
      };
    });
  }

  async recordSuccessfulPromotion(): Promise<void> {
    await this.acquireLock(async () => {
      this.state.requestCount = 0;
      this.state.lastPromotionAt = Date.now();
      this.state.totalPromotionsSent += 1;
      this.state.lastError = null;
      this.state.updatedAt = Date.now();
      await this.addAuditLog('PROMOTION_SENT_SUCCESS', {
        timestamp: new Date().toISOString(),
      });
    });
  }

  async recordFailedPromotion(errorMessage: string): Promise<void> {
    await this.acquireLock(async () => {
      // Counter is NOT reset so accumulated requests are preserved!
      this.state.lastError = errorMessage;
      this.state.updatedAt = Date.now();
      await this.addAuditLog('PROMOTION_SEND_FAILED', { error: errorMessage });
    });
  }

  async setPromoEnabled(enabled: boolean): Promise<void> {
    await this.acquireLock(async () => {
      this.state.isPromoEnabled = enabled;
      this.state.updatedAt = Date.now();
      await this.addAuditLog('PROMO_ENABLED_TOGGLED', { enabled });
    });
  }

  async resetCounter(): Promise<void> {
    await this.acquireLock(async () => {
      const prev = this.state.requestCount;
      this.state.requestCount = 0;
      this.state.updatedAt = Date.now();
      await this.addAuditLog('COUNTER_RESET', { previousCount: prev });
    });
  }

  async getAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
    return this.auditLogs.slice(0, limit);
  }

  async addAuditLog(action: string, details?: Record<string, unknown>): Promise<void> {
    this.auditLogs.unshift({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      action,
      details,
    });
    if (this.auditLogs.length > 200) {
      this.auditLogs.pop();
    }
  }
}
