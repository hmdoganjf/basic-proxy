import type { ProxyContext } from './config/types.js';

declare global {
  namespace Express {
    interface Request {
      proxyCtx?: ProxyContext;
    }
  }
}

export {};
