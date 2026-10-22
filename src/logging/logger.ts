export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
}

// In-memory ring buffer for the operations dashboard audit view
const MAX_LOG_HISTORY = 150;
const logHistory: LogEntry[] = [];

// Helper to sanitize sensitive strings (tokens, webhook secrets, connection strings with passwords)
export function sanitizeLog(input: unknown): unknown {
  if (typeof input === 'string') {
    return input
      .replace(/(?:bot)?(\d{8,12}:[a-zA-Z0-9_-]{25,50})/g, '[REDACTED_BOT_TOKEN]')
      .replace(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/g, 'postgres://user:[REDACTED_PASSWORD]@')
      .replace(/WEBHOOK_SECRET=[^\s&]+/g, 'WEBHOOK_SECRET=[REDACTED]');
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeLog);
  }
  if (input !== null && typeof input === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (/token|secret|password|key/i.test(key)) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = sanitizeLog(val);
      }
    }
    return copy;
  }
  return input;
}

export function getRecentLogs(): LogEntry[] {
  return [...logHistory];
}

export function createLogger(namespace: string) {
  const formatPrefix = (level: LogLevel) => {
    const now = new Date().toISOString();
    return `[${now}] [${level.toUpperCase()}] [${namespace}]`;
  };

  const record = (level: LogLevel, message: string, data?: unknown) => {
    const safeData = data !== undefined ? sanitizeLog(data) : undefined;
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      namespace,
      message,
      data: safeData,
    };

    logHistory.unshift(entry);
    if (logHistory.length > MAX_LOG_HISTORY) {
      logHistory.pop();
    }
  };

  return {
    debug(message: string, data?: unknown) {
      record('debug', message, data);
      if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
        const sanitized = data !== undefined ? sanitizeLog(data) : '';
        console.debug(formatPrefix('debug'), message, sanitized);
      }
    },
    info(message: string, data?: unknown) {
      record('info', message, data);
      const sanitized = data !== undefined ? sanitizeLog(data) : '';
      console.info(formatPrefix('info'), message, sanitized);
    },
    warn(message: string, data?: unknown) {
      record('warn', message, data);
      const sanitized = data !== undefined ? sanitizeLog(data) : '';
      console.warn(formatPrefix('warn'), message, sanitized);
    },
    error(message: string, data?: unknown) {
      record('error', message, data);
      const sanitized = data !== undefined ? sanitizeLog(data) : '';
      console.error(formatPrefix('error'), message, sanitized);
    },
  };
}
