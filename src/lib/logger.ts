/**
 * Minimal structured logger for the SDK.
 * Outputs JSON lines to stderr so stdout stays clean for programmatic use.
 */
export class Logger {
  private readonly enabled: boolean;
  private readonly prefix: string;

  constructor(prefix: string, enabled: boolean = false) {
    this.prefix = prefix;
    this.enabled = enabled;
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    // Errors are always logged regardless of debug flag
    this.log('error', message, context);
  }

  private log(level: string, message: string, context?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      module: this.prefix,
      msg: message,
      ...context,
    };
    console.error(JSON.stringify(entry));
  }
}
