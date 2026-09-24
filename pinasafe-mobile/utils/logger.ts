type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  showTimestamp: boolean;
}

const config: LogConfig = {
  enabled: __DEV__,
  level: 'debug',
  showTimestamp: true,
};

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    return config.enabled && levels[level] >= levels[config.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = config.showTimestamp ? `[${this.getTimestamp()}]` : '';
    const levelTag = `[${level.toUpperCase()}]`;
    return `${timestamp} ${levelTag} ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), data || '');
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), data || '');
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), data || '');
    }
  }

  error(message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), error || '');
    }
  }

  api(method: string, endpoint: string, status?: number): void {
    if (status && status >= 400) {
      this.error(`API ${method} ${endpoint} - Status: ${status}`);
    } else {
      this.debug(`API ${method} ${endpoint}${status ? ` - Status: ${status}` : ''}`);
    }
  }
}

export const logger = new Logger();
