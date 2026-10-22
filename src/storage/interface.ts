export interface BotState {
  requestCount: number;
  promoThreshold: number;
  promoCooldownMinutes: number;
  isPromoEnabled: boolean;
  lastPromotionAt: number | null; // epoch timestamp in ms
  totalPromotionsSent: number;
  totalEligibleRequests: number;
  lastError: string | null;
  updatedAt: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface IncrementResult {
  previousCount: number;
  newCount: number;
  thresholdReached: boolean;
  inCooldown: boolean;
  promoTriggered: boolean;
  cooldownRemainingMs: number;
}

export interface StorageInterface {
  init(): Promise<void>;
  close(): Promise<void>;

  /**
   * Retrieves current bot state
   */
  getState(): Promise<BotState>;

  /**
   * Check if Telegram update has already been processed (idempotency deduplication)
   */
  hasProcessedUpdate(updateId: number): Promise<boolean>;

  /**
   * Record updateId as processed
   */
  recordProcessedUpdate(updateId: number): Promise<void>;

  /**
   * Safely increments request counter within an atomic transaction.
   * If updateId is passed, records updateId in the same transaction.
   * Calculates whether threshold is met and cooldown allows sending.
   */
  incrementRequestCount(
    updateId?: number,
    threshold?: number,
    cooldownMinutes?: number
  ): Promise<IncrementResult>;

  /**
   * Commits successful promotion: resets counter to 0, updates lastPromotionAt to now,
   * increments totalPromotionsSent.
   */
  recordSuccessfulPromotion(): Promise<void>;

  /**
   * Records a failed promotion attempt (counter is NOT reset so requests aren't lost).
   */
  recordFailedPromotion(errorMessage: string): Promise<void>;

  /**
   * Enables or disables automatic promotions (kill switch)
   */
  setPromoEnabled(enabled: boolean): Promise<void>;

  /**
   * Resets counter to 0 upon authorized admin confirmation
   */
  resetCounter(): Promise<void>;

  /**
   * Retrieves recent audit logs
   */
  getAuditLogs(limit?: number): Promise<AuditLogEntry[]>;

  /**
   * Adds an audit log entry
   */
  addAuditLog(action: string, details?: Record<string, unknown>): Promise<void>;
}
