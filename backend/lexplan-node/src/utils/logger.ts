type LogPayload = unknown;

function log(level: 'info' | 'warn' | 'error', message: string, payload?: LogPayload): void {
  const suffix = payload === undefined ? '' : ` ${safeJson(payload)}`;
  console[level](`[lexplan] ${message}${suffix}`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  info: (message: string, payload?: LogPayload) => log('info', message, payload),
  warn: (message: string, payload?: LogPayload) => log('warn', message, payload),
  error: (message: string, payload?: LogPayload) => log('error', message, payload),
};