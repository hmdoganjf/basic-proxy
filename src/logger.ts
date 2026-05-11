import pino from 'pino';

export interface RootLoggerOptions {
  level?: string;
  pretty?: boolean;
}

export function createRootLogger(opts?: RootLoggerOptions): pino.Logger {
  const level = opts?.level || process.env.LOG_LEVEL || 'info';
  const pretty =
    opts?.pretty === true ||
    process.env.LOG_PRETTY === '1' ||
    process.env.PROXY_LOG_PRETTY === '1' ||
    process.env.NODE_ENV === 'development';

  return pino({
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
          },
        }
      : {}),
  });
}
